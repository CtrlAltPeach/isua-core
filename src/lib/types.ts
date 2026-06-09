// Общие TypeScript-типы, разделяемые frontend и API.
import type { Applicant, Program, History, User } from "@prisma/client";

export type { Applicant, Program, History };

export type ApplicantStatus = "applied" | "withdrawn";

// Публичный профиль пользователя (без passwordHash).
export type PublicUser = Pick<User, "id" | "email" | "username">;

// Абитуриент с присоединённой программой (как возвращает API).
export type ApplicantWithProgram = Applicant & {
  program?: { id: number; name: string };
};

// Ответ списка абитуриентов с пагинацией.
export interface ApplicantListResponse {
  items: ApplicantWithProgram[];
  total: number;
  page: number;
  limit: number;
}

// Запись истории с данными о том, кто изменил.
export interface HistoryEntry {
  id: number;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date;
  changedBy: PublicUser;
}

// Единый формат ошибки API.
export interface ApiError {
  error: string;
  details?: unknown;
}
