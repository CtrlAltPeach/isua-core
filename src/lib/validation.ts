// Zod-схемы валидации входных данных API.
import { z } from "zod";

export const APPLICANT_STATUSES = ["applied", "withdrawn"] as const;

// --- Программа ---
// Минимальные баллы по предметам: объект предмет→число (0-100) или null/{}.
const minScoresSchema = z
  .record(z.string(), z.coerce.number().int().min(0).max(100))
  .nullable()
  .optional();

// Группа программ: id положительный, либо null (= «Без группы»).
// Пусто/null/0 → null (снять группу); иначе — положительный int.
const programGroupIdField = z
  .preprocess(
    (v) =>
      v === "" || v === undefined || v === null || v === 0 || v === "0"
        ? null
        : v,
    z.coerce.number().int().positive().nullable(),
  )
  .optional();

export const programSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(100),
  places: z.coerce.number().int().min(0, "Мест не может быть меньше 0"),
  minScores: minScoresSchema,
  programGroupId: programGroupIdField,
});
export const updateProgramSchema = programSchema.partial();

// --- Группа программ ---
export const programGroupSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(100),
  sortOrder: z.coerce.number().int().min(0).optional(),
});
export const updateProgramGroupSchema = programGroupSchema.partial();

// --- Массовое удаление ---
export const bulkDeleteSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, "Не выбрано ни одного"),
});

// --- Авторизация ---
// Email регистронезависим: нормализуем (trim + lower) ДО валидации, чтобы
// поиск/уникальность по email не зависели от регистра ввода.
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email("Некорректный email"));

export const registerSchema = z.object({
  email: emailField,
  username: z.string().min(2, "Имя пользователя минимум 2 символа").max(50),
  password: z.string().min(8, "Пароль минимум 8 символов").max(100),
  // Роль нового пользователя (по умолчанию operator). Учитывается только
  // когда юзера создаёт админ; при bootstrap первого юзера он всегда admin.
  role: z.enum(["admin", "operator"]).optional(),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Введите пароль"),
});

// Смена собственного пароля (D2). Новый пароль — те же требования, что при
// регистрации (min 8). Текущий проверяется на сервере (verifyPassword).
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  newPassword: z.string().min(8, "Новый пароль минимум 8 символов").max(100),
});

// --- Абитуриент ---
// Пустую строку/null/undefined приводим к null ДО парсинга числа.
// Иначе z.coerce.number() превратил бы "" и null в 0 (Number("")===0).
const emptyToNull = (v: unknown): unknown =>
  v === "" || v === null || v === undefined ? null : v;

// Балл — целое 0-100, либо null.
const scoreField = z.preprocess(
  emptyToNull,
  z.coerce.number().int("Балл — целое число").min(0).max(100).nullable(),
);

const optionalString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? null : v));

// Дата рождения: пусто/null → null; иначе валидная дата (год 1900..сегодня).
// HTML-инпут type="date" отдаёт "YYYY-MM-DD"; coerce.date парсит как UTC-полночь.
const birthDateField = z.preprocess(
  emptyToNull,
  z.coerce
    .date()
    .refine(
      (d) => d.getUTCFullYear() >= 1900 && d.getTime() <= Date.now(),
      "Некорректная дата рождения",
    )
    .nullable(),
);

// Поля, общие для создания и обновления.
const applicantBase = {
  fullName: z.string().min(1, "ФИО обязательно").max(200),
  programId: z.coerce.number().int().positive("Выберите программу"),
  status: z.enum(APPLICANT_STATUSES).optional(),
  phone: optionalString,
  email: z
    .union([z.string().email("Некорректный email"), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  consentToEnroll: z.coerce.boolean().optional(),
  documentsComplete: z.coerce.boolean().optional(),
  specialQuota: z.coerce.boolean().optional(),
  specialRight: z.coerce.boolean().optional(),
  isPaid: z.coerce.boolean().optional(),
  isDistant: z.coerce.boolean().optional(),
  birthDate: birthDateField,
  documentType: z
    .union([z.enum(["diploma", "certificate"]), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  citizenship: optionalString,
  passportSeries: optionalString,
  passportNumber: optionalString,
  mathBase: z.preprocess(
    emptyToNull,
    z.coerce.number().int().min(2).max(5).nullable(),
  ),
  mathProfile: scoreField,
  russian: scoreField,
  chemistry: scoreField,
  physics: scoreField,
  informatics: scoreField,
  geography: scoreField,
  // Доп. баллы (индивидуальные достижения): целое 0..10. Пусто/null → 0.
  additionalScores: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : v),
    z.coerce.number().int().min(0).max(10, "Доп. баллы не более 10"),
  ),
  // ВИ — вступительные испытания вуза (для поступающих без ЕГЭ): целое 0..300
  // либо null (= сдаёт по ЕГЭ). Если задано — заменяет сумму ЕГЭ в итоговом балле.
  viScore: z.preprocess(
    emptyToNull,
    z.coerce.number().int("Балл — целое число").min(0).max(300, "ВИ не более 300").nullable(),
  ),
  registrationAddress: optionalString,
  inn: optionalString,
  snils: optionalString,
  notes: optionalString,
};

export const createApplicantSchema = z.object(applicantBase);

// Для обновления все поля опциональны, плюс version для оптимистичной блокировки.
export const updateApplicantSchema = z
  .object({
    ...applicantBase,
    fullName: applicantBase.fullName.optional(),
    programId: applicantBase.programId.optional(),
    version: z.coerce.number().int().positive().optional(),
  })
  .partial();

export type CreateApplicantInput = z.infer<typeof createApplicantSchema>;
export type UpdateApplicantInput = z.infer<typeof updateApplicantSchema>;
