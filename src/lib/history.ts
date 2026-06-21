// Формирование записей истории изменений абитуриента.
// Сравнивает старое и новое состояние по логируемым полям.
import type { Prisma } from "@prisma/client";

// Поля, изменения которых логируются (BACKEND_PROMPT, раздел 3).
// Служебные (createdAt, updatedAt, version) и totalScore — НЕ логируются.
export const LOGGED_FIELDS = [
  "fullName",
  "phone",
  "email",
  "programId",
  "status",
  "consentToEnroll",
  "documentsComplete",
  "specialQuota",
  "specialRight",
  "isPaid",
  "isDistant",
  "documentType",
  "citizenship",
  "passportSeries",
  "passportNumber",
  "mathBase",
  "mathProfile",
  "russian",
  "chemistry",
  "physics",
  "informatics",
  "geography",
  "additionalScores",
  "registrationAddress",
  "inn",
  "snils",
  "notes",
] as const;

export type LoggedField = (typeof LOGGED_FIELDS)[number];

type AnyRecord = Record<string, unknown>;

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

/**
 * Строит массив записей History для изменившихся полей.
 * `before` — текущее состояние из БД, `after` — применённые изменения (только переданные поля).
 */
export function buildHistoryEntries(
  applicantId: number,
  changedByUserId: number,
  before: AnyRecord,
  after: AnyRecord,
): Prisma.HistoryCreateManyInput[] {
  const entries: Prisma.HistoryCreateManyInput[] = [];

  for (const field of LOGGED_FIELDS) {
    if (!(field in after)) continue; // поле не передавалось — пропускаем
    const oldVal = toStr(before[field]);
    const newVal = toStr(after[field]);
    if (oldVal === newVal) continue; // без изменений

    entries.push({
      applicantId,
      changedByUserId,
      fieldName: field,
      oldValue: oldVal,
      newValue: newVal,
    });
  }

  return entries;
}
