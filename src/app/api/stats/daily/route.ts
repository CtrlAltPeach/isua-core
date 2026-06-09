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
    newToday,
    programs,
  ] = await Promise.all([
    prisma.applicant.count(),
    prisma.applicant.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.applicant.count({ where: { consentToEnroll: true } }),
    prisma.applicant.count({ where: { documentsComplete: true } }),
    // Новые заявления за день: созданные в этот день.
    prisma.applicant.count({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.program.findMany({
      orderBy: { id: "asc" },
      include: {
        applicants: {
          select: {
            totalScore: true,
            consentToEnroll: true,
            documentsComplete: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  const statusCount = (s: string) =>
    byStatus.find((g) => g.status === s)?._count._all ?? 0;

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
    return {
      program: p.name,
      places: p.places,
      applicants: apps.length,
      competition:
        p.places > 0 ? Math.round((apps.length / p.places) * 100) / 100 : null,
      avgScore,
      withConsent,
      withDocuments: apps.filter((a) => a.documentsComplete).length,
      newToday,
      // Укомплектованность бюджетных мест согласиями (%).
      consentFillPercent:
        p.places > 0 ? Math.round((withConsent / p.places) * 100) : 0,
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
    byProgram,
  });
}
