// Расчёт общего балла абитуриента.
//
// examType="ege" (по умолчанию): total = СУММА трёх наибольших предметов ЕГЭ + доп. баллы;
//   при <3 предметах — null. math_base (оценка 2-5) НИКОГДА не входит.
//
// examType="vi": total считается по вступит. испытаниям вуза:
//   - если задан общий viScore (0-300) — viScore + доп. баллы;
//   - иначе СУММА трёх наибольших предметов ВИ + доп. баллы (нужно ≥3); иначе null.
// Предметы ЕГЭ при examType="vi" игнорируются (взаимоисключение enforced на API-границе).
//
// Баллы — целые. С доп. баллами итог может превышать 300 («переполнение»).

// Вид экзамена.
export const EXAM_TYPES = ["ege", "vi"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

// Предметы ЕГЭ, входящие в рейтинг (без mathBase).
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

// Предметы ВИ (те же, что ЕГЭ).
export const VI_SCORE_FIELDS = [
  "viMathProfile",
  "viRussian",
  "viChemistry",
  "viPhysics",
  "viInformatics",
  "viGeography",
] as const;

export type ViScoreField = (typeof VI_SCORE_FIELDS)[number];

export type ViScoreInput = Partial<Record<ViScoreField, number | null | undefined>>;

// Минимальное число предметов для расчёта суммы (ЕГЭ и ВИ).
export const MIN_SUBJECTS = 3;

// Максимальная сумма предметных баллов без доп. баллов.
export const MAX_SUBJECT_SUM = 300;

// Максимум доп. баллов (индивидуальные достижения).
export const MAX_ADDITIONAL_SCORES = 10;

// Максимум баллов ВИ — общий балл (вступительные испытания вуза).
export const MAX_VI_SCORE = 300;

function isNum(v: unknown): v is number {
  return typeof v === "number" && !Number.isNaN(v);
}

function topThreeSum(scores: number[]): number {
  return scores
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((a, b) => a + b, 0);
}

/**
 * Итоговый балл абитуриента.
 *  - examType="vi": viScore (если задан) + extra; иначе топ-3 vi-предметов + extra
 *    (null, если < MIN_SUBJECTS vi-предметов). Предметы ЕГЭ игнорируются.
 *  - иначе (ege): топ-3 предметов ЕГЭ + extra (null, если < MIN_SUBJECTS предметов).
 */
export function calculateTotalScore(
  applicant: ScoreInput,
  additionalScores: number | null | undefined = 0,
  viScore: number | null | undefined = null,
  examType: ExamType | null | undefined = "ege",
  viScores?: ViScoreInput,
): number | null {
  const extra = isNum(additionalScores) ? additionalScores : 0;

  // ВИ: общий балл или топ-3 vi-предметов. Предметы ЕГЭ игнорируются.
  if (examType === "vi") {
    if (isNum(viScore)) return Math.round(viScore + extra);
    if (viScores) {
      const scores = VI_SCORE_FIELDS.map((f) => viScores[f]).filter(isNum);
      if (scores.length >= MIN_SUBJECTS) return Math.round(topThreeSum(scores) + extra);
    }
    return null;
  }

  // ЕГЭ: топ-3 предметов.
  const scores = SCORE_FIELDS.map((f) => applicant[f]).filter(isNum);
  if (scores.length < MIN_SUBJECTS) return null;

  return Math.round(topThreeSum(scores) + extra);
}
