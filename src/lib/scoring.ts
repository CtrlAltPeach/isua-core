// Расчёт общего балла абитуриента.
// total_score = СУММА трёх наибольших предметных баллов + доп. баллы (ВИ).
// math_base (оценка 2-5) НИКОГДА не входит. Если заполнено меньше 3 предметов — null.
// Баллы — целые. С доп. баллами итог может превышать 300 («переполнение»).

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

// Максимальная сумма предметных баллов без доп. баллов.
export const MAX_SUBJECT_SUM = 300;

/**
 * Сумма трёх наибольших предметных баллов + доп. баллы (ВИ).
 * Возвращает null, если заполнено меньше MIN_SUBJECTS предметов
 * (доп. баллы без минимума предметов не дают итогового балла).
 */
export function calculateTotalScore(
  applicant: ScoreInput,
  additionalScores: number | null | undefined = 0,
): number | null {
  const scores = SCORE_FIELDS.map((f) => applicant[f]).filter(
    (s): s is number => typeof s === "number" && !Number.isNaN(s),
  );

  if (scores.length < MIN_SUBJECTS) return null;

  const topThree = scores
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((a, b) => a + b, 0);

  const extra =
    typeof additionalScores === "number" && !Number.isNaN(additionalScores)
      ? additionalScores
      : 0;

  return Math.round(topThree + extra);
}
