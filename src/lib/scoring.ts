// Расчёт общего балла абитуриента.
// total_score = СУММА трёх наибольших предметных баллов (макс 300).
// math_base (оценка 2-5) ИСКЛЮЧАЕТСЯ. Если заполнено меньше 3 предметов — null.
// Баллы — целые числа.

// Предметы, входящие в рейтинг (без mathBase).
export const SCORE_FIELDS = [
  "mathProfile",
  "russian",
  "chemistry",
  "physics",
  "informatics",
  "geography",
] as const;

export type ScoreField = (typeof SCORE_FIELDS)[number];

export type ScoreInput = Partial<Record<ScoreField, number | null | undefined>>;

// Минимальное число предметов для расчёта суммы.
export const MIN_SUBJECTS = 3;

/**
 * Сумма трёх наибольших предметных баллов.
 * Возвращает null, если заполнено меньше MIN_SUBJECTS предметов.
 */
export function calculateTotalScore(applicant: ScoreInput): number | null {
  const scores = SCORE_FIELDS.map((f) => applicant[f]).filter(
    (s): s is number => typeof s === "number" && !Number.isNaN(s),
  );

  if (scores.length < MIN_SUBJECTS) return null;

  const topThree = scores
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((a, b) => a + b, 0);

  return Math.round(topThree);
}
