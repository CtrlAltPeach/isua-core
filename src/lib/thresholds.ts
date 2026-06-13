// Минимальные баллы по предметам (порог per-program).
import { SCORE_FIELDS, type ScoreField } from "@/lib/scoring";

// Карта порогов: предмет → минимальный балл. Отсутствие ключа = порог не задан.
export type MinScores = Partial<Record<ScoreField, number>>;

// Метки предметов для UI редактора порогов.
export const SUBJECT_LABELS: Record<ScoreField, string> = {
  mathProfile: "Математика (профиль)",
  russian: "Русский язык",
  chemistry: "Химия",
  physics: "Физика",
  informatics: "Информатика",
  geography: "География",
};

// Нормализует произвольный JSON в MinScores (только валидные предметы и числа).
export function parseMinScores(raw: unknown): MinScores {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: MinScores = {};
  for (const f of SCORE_FIELDS) {
    const v = src[f];
    if (typeof v === "number" && !Number.isNaN(v)) out[f] = v;
  }
  return out;
}

// Список предметов абитуриента, не дотягивающих до порога программы.
// Возвращает [{ field, value, min }]. Пустые баллы не проверяются.
export function failingSubjects(
  applicant: Partial<Record<ScoreField, number | null | undefined>>,
  minScores: MinScores,
): { field: ScoreField; value: number; min: number }[] {
  const result: { field: ScoreField; value: number; min: number }[] = [];
  for (const f of SCORE_FIELDS) {
    const min = minScores[f];
    const value = applicant[f];
    if (typeof min === "number" && typeof value === "number" && value < min) {
      result.push({ field: f, value, min });
    }
  }
  return result;
}
