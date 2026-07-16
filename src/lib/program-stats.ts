// Агрегация статистики по программам — переиспользуется эндпоинтами
// /api/stats/daily (дашборд) и /api/programs/stats (вкладка «Программы»).
// Вынесена в lib, чтобы не дублировать логику и не тянуть её в клиентский api.ts.
import type {
  ProgramStatRow,
  ProgramGroupStats,
} from "@/lib/api";

// Минимальный набор полей программы с relation applicants, достаточный для
// агрегации. Соответствует select, который делают эндпоинты.
export interface ProgramWithApplicants {
  id: number;
  name: string;
  places: number;
  programGroup: { id: number; name: string; sortOrder: number } | null;
  applicants: {
    fullName: string;
    status: string;
    totalScore: number | null;
    consentToEnroll: boolean;
    documentsComplete: boolean;
    isPaid: boolean;
    isDistant: boolean;
    createdAt: Date;
  }[];
}

export interface ProgramAggregationOptions {
  // Окно «сегодня» — для newToday (заявления, созданные в этот день).
  // Если не задано — newToday всегда 0.
  dayStart?: Date;
  dayEnd?: Date;
  // Нетто-движение согласий за день по программам (из History).
  givenByProgram?: Map<number, number>;
  withdrawnByProgram?: Map<number, number>;
}

// Считает по каждой программе: applicants/competition/avgScore/withConsent/
// withDocuments/withPaid/withDistant/distantWithConsent/newToday/
// consentGivenToday/consentWithdrawnToday/consentFillPercent/applied/withdrawn/
// topApplicants. Все агрегаты — из уже загруженных applicants (без доп. запросов).
export function aggregateProgramsToStats(
  programs: ProgramWithApplicants[],
  options: ProgramAggregationOptions = {},
): ProgramStatRow[] {
  const { dayStart, dayEnd, givenByProgram, withdrawnByProgram } = options;
  return programs.map((p) => {
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
    // Новые заявления сегодня на эту программу (только если задано окно дня).
    const newToday =
      dayStart && dayEnd
        ? apps.filter(
            (a) => a.createdAt >= dayStart && a.createdAt < dayEnd,
          ).length
        : 0;
    // Топ-3 абитуриента по баллу (используется на вкладке «Программы»).
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
      distantWithConsent: apps.filter(
        (a) => a.isDistant && a.consentToEnroll,
      ).length,
      newToday,
      // Нетто-согласия за день по этой программе.
      consentGivenToday: givenByProgram?.get(p.id) ?? 0,
      consentWithdrawnToday: withdrawnByProgram?.get(p.id) ?? 0,
      // Укомплектованность бюджетных мест согласиями (%).
      consentFillPercent:
        p.places > 0 ? Math.round((withConsent / p.places) * 100) : 0,
      // Разбивка по статусам.
      applied: apps.filter((a) => a.status === "applied").length,
      withdrawn: apps.filter((a) => a.status === "withdrawn").length,
      topApplicants,
    };
  });
}

// Группирует строки программ по группам (null = «Без группы») с подытогами.
// Порядок: реальные группы по sortOrder (затем имя), «Без группы» — в конце.
export function groupProgramStats(
  byProgram: ProgramStatRow[],
  programs: ProgramWithApplicants[],
): ProgramGroupStats[] {
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
  const rowsByGroup = new Map<number | null, ProgramStatRow[]>();
  for (const row of byProgram) {
    const key = row.groupId;
    if (!rowsByGroup.has(key)) rowsByGroup.set(key, []);
    rowsByGroup.get(key)!.push(row);
  }
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
  return orderedKeys.map((key) => {
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
        consentWithdrawnToday: s.consentWithdrawnToday + r.consentWithdrawnToday,
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
}
