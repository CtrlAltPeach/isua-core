// Zod-схемы валидации входных данных API.
import { z } from "zod";

export const APPLICANT_STATUSES = ["applied", "withdrawn"] as const;

// --- Программа ---
// Минимальные баллы по предметам: объект предмет→число (0-100) или null/{}.
const minScoresSchema = z
  .record(z.string(), z.coerce.number().int().min(0).max(100))
  .nullable()
  .optional();

export const programSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(100),
  places: z.coerce.number().int().min(0, "Мест не может быть меньше 0"),
  minScores: minScoresSchema,
});
export const updateProgramSchema = programSchema.partial();

// --- Массовое удаление ---
export const bulkDeleteSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, "Не выбрано ни одного"),
});

// --- Авторизация ---
export const registerSchema = z.object({
  email: z.string().email("Некорректный email"),
  username: z.string().min(2, "Имя пользователя минимум 2 символа").max(50),
  password: z.string().min(8, "Пароль минимум 8 символов").max(100),
  // Роль нового пользователя (по умолчанию operator). Учитывается только
  // когда юзера создаёт админ; при bootstrap первого юзера он всегда admin.
  role: z.enum(["admin", "operator"]).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Введите пароль"),
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
  isPaid: z.coerce.boolean().optional(),
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
  // Доп. баллы / ВИ: целое ≥0, без верхней границы (может поднять итог >300).
  // Пусто/null → 0.
  additionalScores: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : v),
    z.coerce.number().int().min(0),
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
