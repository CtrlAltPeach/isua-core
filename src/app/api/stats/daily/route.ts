// GET /api/stats/daily — агрегированная статистика приёмной кампании.
// query: date=YYYY-MM-DD (по умолчанию сегодня), timezone (по умолчанию Europe/Moscow)
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";
import { dayBoundsUTC, todayInTimeZone } from "@/lib/timezone";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const timezone = sp.get("timezone") ?? "Europe/Moscow";
  // «Сегодня» — по локальной дате таймзоны, НЕ по UTC (иначе возле полуночи
  // в зонах ≠ UTC окно суток сдвигается на день).
  const dateStr = sp.get("date") ?? todayInTimeZone(timezone);
  const [dayStart, dayEnd] = dayBoundsUTC(dateStr, timezone);

  const [
    total,
    byStatus,
    withConsent,
    withDocuments,
    withPaid,
    withDistant,
    distantWithConsent,
    newToday,
    consentChangesToday,
    programs,
  ] = await Promise.all([
    prisma.applicant.count(),
    prisma.applicant.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.applicant.count({ where: { consentToEnroll: true } }),
    prisma.applicant.count({ where: { documentsComplete: true } }),
    prisma.applicant.count({ where: { isPaid: true } }),
    prisma.applicant.count({ where: { isDistant: true } }),
    // Пересечение distant × consent (итер. 19.1): отдельный счётчик.
    prisma.applicant.count({
      where: { isDistant: true, consentToEnroll: true },
    }),
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
    prisma.program.findMany({
      orderBy: { id: "asc" },
      include: {
        programGroup: { select: { id: true, name: true, sortOrder: true } },
        applicants: {
          select: {
            fullName: true,
            status: true,
            totalScore: true,
            consentToEnroll: true,
            documentsComplete: true,
            isPaid: true,
            isDistant: true,
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
      groupId: p.programGroup?.id ?? null,
      groupName: p.programGroup?.name ?? null,
      places: p.places,
      applicants: apps.length,
      competition:
        p.places > 0 ? Math.round((apps.length / p.places) * 100) / 100 : null,
      avgScore,
      withConsent,
      withDocuments: apps.filter((a) => a.documentsComplete).length,
      withPaid: apps.filter((a) => a.isPaid).length,
      withDistant: apps.filter((a) => a.isDistant).length,
      // Пересечение: дистант + согласие (итер. 19.1).
      distantWithConsent: apps.filter((a) => a.isDistant && a.consentToEnroll).length,
      newToday,
      // Нетто-согласия за день по этой программе.
      consentGivenToday: givenByProgram.get(p.id) ?? 0,
      consentWithdrawnToday: withdrawnByProgram.get(p.id) ?? 0,
      // Укомплектованность бюджетных мест согласиями (%).
      consentFillPercent:
        p.places > 0 ? Math.round((withConsent / p.places) * 100) : 0,
      // Разбивка по статусам.
      applied: apps.filter((a) => a.status === "applied").length,
      withdrawn: apps.filter((a) => a.status === "withdrawn").length,
      topApplicants,
    };
  });

  // --- Группировка программ с подытогами ---
  // Метаданные групп (имя + порядок) из загруженных программ.
  const groupMeta = new Map<number, { name: string; sortOrder: number }>();
  for (const p of programs) {
    if (p.programGroup) {
      groupMeta.set(p.programGroup.id, {
        name: p.programGroup.name,
        sortOrder: p.programGroup.sortOrder,
      });
    }
  }
  // Раскладываем строки по группам (null = «Без группы»).
  const rowsByGroup = new Map<number | null, typeof byProgram>();
  for (const row of byProgram) {
    const key = row.groupId;
    if (!rowsByGroup.has(key)) rowsByGroup.set(key, []);
    rowsByGroup.get(key)!.push(row);
  }
  // Порядок: реальные группы по sortOrder (затем имя), «Без группы» — в конце.
  const realKeys = [...rowsByGroup.keys()]
    .filter((k): k is number => k !== null)
    .sort((a, b) => {
      const A = groupMeta.get(a)!;
      const B = groupMeta.get(b)!;
      return A.sortOrder - B.sortOrder || A.name.localeCompare(B.name);
    });
  const orderedKeys: (number | null)[] = [
    ...realKeys,
    ...(rowsByGroup.has(null) ? [null] : []),
  ];
  const byGroup = orderedKeys.map((key) => {
    const rows = rowsByGroup.get(key)!;
    const subtotal = rows.reduce(
      (s, r) => ({
        places: s.places + r.places,
        applicants: s.applicants + r.applicants,
        withConsent: s.withConsent + r.withConsent,
        withDocuments: s.withDocuments + r.withDocuments,
        withPaid: s.withPaid + r.withPaid,
        withDistant: s.withDistant + r.withDistant,
        distantWithConsent: s.distantWithConsent + r.distantWithConsent,
        newToday: s.newToday + r.newToday,
        consentGivenToday: s.consentGivenToday + r.consentGivenToday,
        consentWithdrawnToday:
          s.consentWithdrawnToday + r.consentWithdrawnToday,
      }),
      {
        places: 0,
        applicants: 0,
        withConsent: 0,
        withDocuments: 0,
        withPaid: 0,
        withDistant: 0,
        distantWithConsent: 0,
        newToday: 0,
        consentGivenToday: 0,
        consentWithdrawnToday: 0,
      },
    );
    // Конкурс по группе: суммарно абитуриентов на суммарные места.
    const competition =
      subtotal.places > 0
        ? Math.round((subtotal.applicants / subtotal.places) * 100) / 100
        : null;
    return {
      groupId: key,
      groupName: key === null ? null : groupMeta.get(key)!.name,
      programs: rows,
      subtotal: { ...subtotal, competition },
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
