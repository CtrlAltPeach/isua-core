// Расчёт общего балла абитуриента.
// Если задано ВИ (вступительные испытания вуза) — total = ВИ + доп. баллы,
// предметы ЕГЭ игнорируются (абитуриент поступает без ЕГЭ).
// Иначе total = СУММА трёх наибольших предметных баллов ЕГЭ + доп. баллы.
// math_base (оценка 2-5) НИКОГДА не входит. Без ВИ и при <3 предметах — null.
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

// Максимум доп. баллов (индивидуальные достижения).
export const MAX_ADDITIONAL_SCORES = 10;

// Максимум баллов ВИ (вступительные испытания вуза).
export const MAX_VI_SCORE = 300;

/**
 * Итоговый балл абитуриента.
 *  - Если задано viScore (ВИ) — возвращает viScore + доп. баллы (предметы ЕГЭ
 *    не учитываются; ВИ заменяет сумму ЕГЭ).
 *  - Иначе — сумма трёх наибольших предметных баллов ЕГЭ + доп. баллы; null,
 *    если заполнено меньше MIN_SUBJECTS предметов.
 */
export function calculateTotalScore(
  applicant: ScoreInput,
  additionalScores: number | null | undefined = 0,
  viScore: number | null | undefined = null,
): number | null {
  const extra =
    typeof additionalScores === "number" && !Number.isNaN(additionalScores)
      ? additionalScores
      : 0;

  // ВИ заменяет ЕГЭ: если ВИ задано — предметы ЕГЭ игнорируем.
  if (typeof viScore === "number" && !Number.isNaN(viScore)) {
    return Math.round(viScore + extra);
  }

  const scores = SCORE_FIELDS.map((f) => applicant[f]).filter(
    (s): s is number => typeof s === "number" && !Number.isNaN(s),
  );

  if (scores.length < MIN_SUBJECTS) return null;

  const topThree = scores
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((a, b) => a + b, 0);

  return Math.round(topThree + extra);
}
