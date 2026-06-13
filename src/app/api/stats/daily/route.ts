// GET /api/stats/daily — агрегированная статистика приёмной кампании.
// query: date=YYYY-MM-DD (по умолчанию сегодня), timezone (по умолчанию Europe/Moscow)
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";

// Границы суток для указанной даты в заданной таймзоне, в UTC.
// Для MVP используем фиксированное смещение Москвы (UTC+3), если зона московская,
// иначе считаем по UTC-датам выбранного дня.
function dayBoundsUTC(dateStr: string, timezone: string): [Date, Date] {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Москва = UTC+3. Для других зон оставляем UTC (упрощение MVP).
  const offsetHours = timezone === "Europe/Moscow" ? 3 : 0;
  const start = new Date(Date.UTC(y, m - 1, d, -offsetHours, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 1, -offsetHours, 0, 0, 0));
  return [start, end];
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const timezone = sp.get("timezone") ?? "Europe/Moscow";
  const dateStr = sp.get("date") ?? new Date().toISOString().slice(0, 10);
  const [dayStart, dayEnd] = dayBoundsUTC(dateStr, timezone);

  const [
    total,
    byStatus,
    withConsent,
    withDocuments,
    withPaid,
    newToday,
    consentChangesToday,
    programs,
  ] = await Promise.all([
    prisma.applicant.count(),
    prisma.applicant.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.applicant.count({ where: { consentToEnroll: true } }),
    prisma.applicant.count({ where: { documentsComplete: true } }),
    prisma.applicant.count({ where: { isPaid: true } }),
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
      select: { applicantId: true, oldValue: true, newValue: true, changedAt: true },
      orderBy: { changedAt: "asc" },
    }),
    prisma.program.findMany({
      orderBy: { id: "asc" },
      include: {
        applicants: {
          select: {
            fullName: true,
            status: true,
            totalScore: true,
            consentToEnroll: true,
            documentsComplete: true,
            isPaid: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  const statusCount = (s: string) =>
    byStatus.find((g) => g.status === s)?._count._all ?? 0;

  // Новые/снятые согласия сегодня — НЕТТО за день, а не сумма переключений.
  // По каждому абитуриенту: состояние на начало дня (oldValue первого изменения)
  // против состояния на конец дня (newValue последнего изменения).
  // Записи уже отсортированы по changedAt asc.
  const consentByApplicant = new Map<
    number,
    { first: string | null; last: string | null }
  >();
  for (const h of consentChangesToday) {
    const cur = consentByApplicant.get(h.applicantId);
    if (cur) {
      cur.last = h.newValue; // более позднее изменение перетирает «конец дня»
    } else {
      consentByApplicant.set(h.applicantId, {
        first: h.oldValue, // состояние ДО первого изменения за день
        last: h.newValue,
      });
    }
  }
  let consentGivenToday = 0;
  let consentWithdrawnToday = 0;
  for (const { first, last } of consentByApplicant.values()) {
    if (first === last) continue; // туда-сюда за день → нулевое движение
    if (last === "true") consentGivenToday++;
    else if (last === "false") consentWithdrawnToday++;
  }

  const totalPlaces = programs.reduce((s, p) => s + p.places, 0);
  const totalApplications = programs.reduce(
    (s, p) => s + p.applicants.length,
    0,
  );

  const byProgram = programs.map((p) => {
    const apps = p.applicants;
    const scores = apps
      .map((a) => a.totalScore)
      .filter((v): v is number => typeof v === "number");
    const avgScore =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) /
          100
        : null;
    const withConsent = apps.filter((a) => a.consentToEnroll).length;
    // Новые заявления сегодня на эту программу.
    const newToday = apps.filter(
      (a) => a.createdAt >= dayStart && a.createdAt < dayEnd,
    ).length;
    // Топ-3 абитуриента по баллу.
    const topApplicants = apps
      .filter((a) => typeof a.totalScore === "number")
      .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))
      .slice(0, 3)
      .map((a) => ({ fullName: a.fullName, totalScore: a.totalScore }));
    return {
      programId: p.id,
      program: p.name,
      places: p.places,
      applicants: apps.length,
      competition:
        p.places > 0 ? Math.round((apps.length / p.places) * 100) / 100 : null,
      avgScore,
      withConsent,
      withDocuments: apps.filter((a) => a.documentsComplete).length,
      withPaid: apps.filter((a) => a.isPaid).length,
      newToday,
      // Укомплектованность бюджетных мест согласиями (%).
      consentFillPercent:
        p.places > 0 ? Math.round((withConsent / p.places) * 100) : 0,
      // Разбивка по статусам.
      applied: apps.filter((a) => a.status === "applied").length,
      withdrawn: apps.filter((a) => a.status === "withdrawn").length,
      topApplicants,
    };
  });

  return ok({
    date: dateStr,
    timezone,
    totalApplicants: total,
    newApplications: newToday,
    applied: statusCount("applied"),
    withdrawn: statusCount("withdrawn"),
    withConsent,
    withDocuments,
    withPaid,
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
  });
}
