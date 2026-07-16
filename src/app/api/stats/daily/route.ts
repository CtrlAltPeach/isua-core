// GET /api/stats/daily — агрегированная статистика приёмной кампании.
// query: date=YYYY-MM-DD (по умолчанию сегодня), timezone (по умолчанию Europe/Moscow)
//
// Оптимизация (итер. 21): раньше 10 запросов (7 дублирующих count + groupBy +
// history + programs). Верхнеуровневые метрики считались как побочный продукт
// загруженных applicants.
// Итерация 22: агрегаты переведены на БД (groupBy/aggregate) — applicants больше
// не грузятся в память. Структура: 2 count + 1 history + loadProgramStats
// (который сам делает Promise.all из ~9 groupBy).
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";
import { dayBoundsUTC, todayInTimeZone } from "@/lib/timezone";
import { loadProgramStats } from "@/lib/program-stats-db";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const timezone = sp.get("timezone") ?? "Europe/Moscow";
  // «Сегодня» — по локальной дате таймзоны, НЕ по UTC (иначе возле полуночи
  // в зонах ≠ UTC окно суток сдвигается на день).
  const dateStr = sp.get("date") ?? todayInTimeZone(timezone);
  const [dayStart, dayEnd] = dayBoundsUTC(dateStr, timezone);

  const [total, newToday, consentChangesToday] = await Promise.all([
    prisma.applicant.count(),
    // Новые заявления за день: созданные в этот день.
    prisma.applicant.count({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
    }),
    // Изменения согласия за день — из истории (для НЕТТО-итога за день).
    // Берём applicantId + значения + время, чтобы по каждому абитуриенту
    // сравнить состояние на начало дня с состоянием на конец дня.
    prisma.history.findMany({
      where: {
        fieldName: "consentToEnroll",
        changedAt: { gte: dayStart, lt: dayEnd },
      },
      select: {
        applicantId: true,
        oldValue: true,
        newValue: true,
        changedAt: true,
        // programId нужен, чтобы отнести нетто-согласие за день к программе.
        applicant: { select: { programId: true } },
      },
      orderBy: { changedAt: "asc" },
    }),
  ]);

  // Новые/снятые согласия сегодня — НЕТТО за день, а не сумма переключений.
  // По каждому абитуриенту: состояние на начало дня (oldValue первого изменения)
  // против состояния на конец дня (newValue последнего изменения).
  // Записи уже отсортированы по changedAt asc.
  const consentByApplicant = new Map<
    number,
    { first: string | null; last: string | null; programId: number | null }
  >();
  for (const h of consentChangesToday) {
    const cur = consentByApplicant.get(h.applicantId);
    if (cur) {
      cur.last = h.newValue; // более позднее изменение перетирает «конец дня»
    } else {
      consentByApplicant.set(h.applicantId, {
        first: h.oldValue, // состояние ДО первого изменения за день
        last: h.newValue,
        programId: h.applicant?.programId ?? null,
      });
    }
  }
  let consentGivenToday = 0;
  let consentWithdrawnToday = 0;
  // Нетто-согласия за день в разрезе программы (для столбца «Согласия»).
  const givenByProgram = new Map<number, number>();
  const withdrawnByProgram = new Map<number, number>();
  for (const { first, last, programId } of consentByApplicant.values()) {
    if (first === last) continue; // туда-сюда за день → нулевое движение
    if (last === "true") {
      consentGivenToday++;
      if (programId != null)
        givenByProgram.set(programId, (givenByProgram.get(programId) ?? 0) + 1);
    } else if (last === "false") {
      consentWithdrawnToday++;
      if (programId != null)
        withdrawnByProgram.set(
          programId,
          (withdrawnByProgram.get(programId) ?? 0) + 1,
        );
    }
  }

  // includeGroups=true: дашборду нужны подытоги по группам.
  const { byProgram, byGroup } = await loadProgramStats(
    prisma,
    {
      dayWindow: { start: dayStart, end: dayEnd },
      consentMovement: { givenByProgram, withdrawnByProgram },
    },
    true,
  );

  // Верхнеуровневые метрики — суммарно из byProgram.
  const totalApplications = byProgram.reduce((s, p) => s + p.applicants, 0);
  const totalPlaces = byProgram.reduce((s, p) => s + p.places, 0);
  const withConsent = byProgram.reduce((s, p) => s + p.withConsent, 0);
  const withDocuments = byProgram.reduce((s, p) => s + p.withDocuments, 0);
  const withPaid = byProgram.reduce((s, p) => s + p.withPaid, 0);
  const withDistant = byProgram.reduce((s, p) => s + p.withDistant, 0);
  const distantWithConsent = byProgram.reduce(
    (s, p) => s + p.distantWithConsent,
    0,
  );
  const applied = byProgram.reduce((s, p) => s + p.applied, 0);
  const withdrawn = byProgram.reduce((s, p) => s + p.withdrawn, 0);

  return ok({
    date: dateStr,
    timezone,
    totalApplicants: total,
    newApplications: newToday,
    applied,
    withdrawn,
    withConsent,
    withDocuments,
    withPaid,
    withDistant,
    distantWithConsent,
    consentGivenToday,
    consentWithdrawnToday,
    totalPlaces,
    totalApplications,
    // Конкурс в целом: заявлений на место.
    applicationsPerPlace:
      totalPlaces > 0
        ? Math.round((totalApplications / totalPlaces) * 100) / 100
        : null,
    // Доля согласий от заявлений.
    consentPerApplication:
      totalApplications > 0
        ? Math.round((withConsent / totalApplications) * 100)
        : 0,
    byProgram,
    byGroup,
  });
}
