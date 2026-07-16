// Сборка статистики по программам из БД-агрегатов — переиспользуется эндпоинтами
// /api/stats/daily (дашборд) и /api/programs/stats (вкладка «Программы»).
//
// Итерация 22: агрегаты (count/avg) считаются на уровне БД через Prisma
// groupBy/aggregate (см. program-stats-db.ts), сюда приходят уже готовые Map'ы.
// Эта функция — чистый мёрджер: метаданные программ + агрегаты → ProgramStatRow[].
import type {
  ProgramStatRow,
  ProgramGroupStats,
} from "@/lib/api";

// Метаданные программы без relation applicants. Соответствует тому, что грузит
// program.findMany без include.applicants.
export interface ProgramMeta {
  id: number;
  name: string;
  places: number;
  programGroup: { id: number; name: string; sortOrder: number } | null;
}

// Агрегаты из БД по programId. Программы без matching строк дают 0 / null.
export interface ProgramAggregatesInput {
  // Счётчик заявок по программе (всего).
  applicants: Map<number, number>;
  // Средний балл (null, если нет ни одного totalScore).
  avgScore: Map<number, number | null>;
  // Счётчики по флагам.
  withConsent: Map<number, number>;
  withDocuments: Map<number, number>;
  withPaid: Map<number, number>;
  withDistant: Map<number, number>;
  // Пересечение: isDistant && consentToEnroll (итер. 19.1).
  distantWithConsent: Map<number, number>;
  // Разбивка по статусам.
  applied: Map<number, number>;
  withdrawn: Map<number, number>;
  // Новые за день (только при dayWindow в options).
  newToday?: Map<number, number>;
}

export interface ProgramAggregationOptions {
  // Нетто-движение согласий за день по программам (из History).
  givenByProgram?: Map<number, number>;
  withdrawnByProgram?: Map<number, number>;
}

// Чистый мёрджер: по метаданным программ и БД-агрегатам собирает строки статистики.
// Не делает запросов к БД — все агрегаты уже посчитаны на стороне БД (итер. 22).
export function aggregateProgramStats(
  programs: ProgramMeta[],
  agg: ProgramAggregatesInput,
  options: ProgramAggregationOptions = {},
): ProgramStatRow[] {
  const { givenByProgram, withdrawnByProgram } = options;
  return programs.map((p) => {
    const applicantsCount = agg.applicants.get(p.id) ?? 0;
    const withConsent = agg.withConsent.get(p.id) ?? 0;
    return {
      programId: p.id,
      program: p.name,
      groupId: p.programGroup?.id ?? null,
      groupName: p.programGroup?.name ?? null,
      places: p.places,
      applicants: applicantsCount,
      competition:
        p.places > 0
          ? Math.round((applicantsCount / p.places) * 100) / 100
          : null,
      avgScore: agg.avgScore.get(p.id) ?? null,
      withConsent,
      withDocuments: agg.withDocuments.get(p.id) ?? 0,
      withPaid: agg.withPaid.get(p.id) ?? 0,
      withDistant: agg.withDistant.get(p.id) ?? 0,
      distantWithConsent: agg.distantWithConsent.get(p.id) ?? 0,
      newToday: agg.newToday?.get(p.id) ?? 0,
      // Нетто-согласия за день по этой программе (из History).
      consentGivenToday: givenByProgram?.get(p.id) ?? 0,
      consentWithdrawnToday: withdrawnByProgram?.get(p.id) ?? 0,
      // Укомплектованность бюджетных мест согласиями (%).
      consentFillPercent:
        p.places > 0 ? Math.round((withConsent / p.places) * 100) : 0,
      applied: agg.applied.get(p.id) ?? 0,
      withdrawn: agg.withdrawn.get(p.id) ?? 0,
    };
  });
}

// Группирует строки программ по группам (null = «Без группы») с подытогами.
// Порядок: реальные группы по sortOrder (затем имя), «Без группы» — в конце.
export function groupProgramStats(
  byProgram: ProgramStatRow[],
  programs: ProgramMeta[],
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
