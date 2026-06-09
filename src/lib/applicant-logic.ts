// Бизнес-правила состояния абитуриента (согласие ↔ статус).
import type { ApplicantStatus } from "@/lib/types";

/**
 * Приводит согласие на зачисление к допустимому по статусу значению.
 * Правила:
 *  - согласие может быть true при статусе "applied" (подал заявление);
 *  - при "withdrawn" (забрал заявление) согласие принудительно false.
 */
export function normalizeConsent(
  status: ApplicantStatus,
  requestedConsent: boolean,
): boolean {
  if (status === "withdrawn") return false;
  return requestedConsent;
}
