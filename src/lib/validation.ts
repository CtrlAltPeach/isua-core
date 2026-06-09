// Zod-схемы валидации входных данных API.
import { z } from "zod";

export const APPLICANT_STATUSES = ["applied", "withdrawn"] as const;

// --- Авторизация ---
export const registerSchema = z.object({
  email: z.string().email("Некорректный email"),
  username: z.string().min(2, "Имя пользователя минимум 2 символа").max(50),
  password: z.string().min(8, "Пароль минимум 8 символов").max(100),
});

export const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Введите пароль"),
});

// --- Абитуриент ---
// Балл — целое 0-100; принимаем число или пустую строку/undefined → null.
const scoreField = z
  .union([z.coerce.number().int("Балл — целое число").min(0).max(100), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : (v as number)));

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
  mathBase: z
    .union([z.coerce.number().int().min(2).max(5), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : (v as number))),
  mathProfile: scoreField,
  russian: scoreField,
  chemistry: scoreField,
  physics: scoreField,
  informatics: scoreField,
  geography: scoreField,
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
