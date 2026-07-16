// Оркестратор БД-агрегатов статистики по программам (итер. 22).
// Заменяет прежний `program.findMany({ include: { applicants } })`, который тащил
// все строки абитуриентов в память. Здесь агрегаты (count/avg) считаются на уровне
// БД через Prisma groupBy/aggregate — каждый запрос возвращает O(программ) строк,
// а не O(абитуриентов). Все запросы идут параллельно через Promise.all.
//
// Почему несколько groupBy, а не один: чистый Prisma groupBy не умеет условные
// count (count с разными where для каждого флага) в одном вызове → каждый флаг =
// отдельный groupBy. Индекс @@index([programId]) покрывает все агрегаты.
import type { PrismaClient } from "@prisma/client";
import {
  aggregateProgramStats,
  groupProgramStats,
  type ProgramAggregatesInput,
  type ProgramMeta,
} from "@/lib/program-stats";
import type { ProgramStatRow, ProgramGroupStats } from "@/lib/api";

export interface LoadProgramStatsOptions {
  // Окно «сегодня» — для newToday (заявления, созданные в этот день).
  // Если не задано — newToday всегда 0.
  dayWindow?: { start: Date; end: Date };
  // Нетто-движение согласий за день по программам (из History).
  consentMovement?: {
    givenByProgram: Map<number, number>;
    withdrawnByProgram: Map<number, number>;
  };
}

export interface ProgramStatsResult {
  byProgram: ProgramStatRow[];
  byGroup?: ProgramGroupStats[];
  programs: ProgramMeta[];
}

// Грузит метаданные программ (без applicants) + БД-агрегаты, собирает статистику.
// includeGroups=true → считает и подытоги по группам (нужно дашборду, не вкладке).
export async function loadProgramStats(
  prisma: PrismaClient,
  options: LoadProgramStatsOptions = {},
  includeGroups = false,
): Promise<ProgramStatsResult> {
  const dayWindow = options.dayWindow;

  const [programs, countAvg, consent, documents, paid, distant, distantConsent, byStatus, newTodayRows] =
    await Promise.all([
      // Метаданные программ без applicants.
      prisma.program.findMany({
        orderBy: { id: "asc" },
        include: {
          programGroup: { select: { id: true, name: true, sortOrder: true } },
        },
      }),
      // Счётчик заявок + средний балл (один groupBy с _count и _avg).
      prisma.applicant.groupBy({
        by: ["programId"],
        _count: { _all: true },
        _avg: { totalScore: true },
      }),
      prisma.applicant.groupBy({
        by: ["programId"],
        where: { consentToEnroll: true },
        _count: { _all: true },
      }),
      prisma.applicant.groupBy({
        by: ["programId"],
        where: { documentsComplete: true },
        _count: { _all: true },
      }),
      prisma.applicant.groupBy({
        by: ["programId"],
        where: { isPaid: true },
        _count: { _all: true },
      }),
      prisma.applicant.groupBy({
        by: ["programId"],
        where: { isDistant: true },
        _count: { _all: true },
      }),
      // Пересечение: дистант + согласие.
      prisma.applicant.groupBy({
        by: ["programId"],
        where: { isDistant: true, consentToEnroll: true },
        _count: { _all: true },
      }),
      // Разбивка по статусам: одна группировка по (programId, status).
      prisma.applicant.groupBy({
        by: ["programId", "status"],
        _count: { _all: true },
      }),
      // Новые за день (опционально).
      dayWindow
        ? prisma.applicant.groupBy({
            by: ["programId"],
            where: { createdAt: { gte: dayWindow.start, lt: dayWindow.end } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

  // Сборка Map'ов агрегатов.
  const applicants = new Map<number, number>();
  const avgScore = new Map<number, number | null>();
  for (const r of countAvg) {
    applicants.set(r.programId, r._count._all);
    const avg = r._avg.totalScore;
    avgScore.set(r.programId, avg == null ? null : Math.round(avg * 100) / 100);
  }
  const mapCount = (
    rows: { programId: number; _count: { _all: number } }[],
  ): Map<number, number> => {
    const m = new Map<number, number>();
    for (const r of rows) m.set(r.programId, r._count._all);
    return m;
  };
  const applied = new Map<number, number>();
  const withdrawn = new Map<number, number>();
  for (const r of byStatus) {
    if (r.status === "applied") applied.set(r.programId, r._count._all);
    else if (r.status === "withdrawn") withdrawn.set(r.programId, r._count._all);
  }

  const agg: ProgramAggregatesInput = {
    applicants,
    avgScore,
    withConsent: mapCount(consent),
    withDocuments: mapCount(documents),
    withPaid: mapCount(paid),
    withDistant: mapCount(distant),
    distantWithConsent: mapCount(distantConsent),
    applied,
    withdrawn,
    newToday: dayWindow ? mapCount(newTodayRows) : undefined,
  };

  const programMeta: ProgramMeta[] = programs.map((p) => ({
    id: p.id,
    name: p.name,
    places: p.places,
    programGroup: p.programGroup
      ? {
          id: p.programGroup.id,
          name: p.programGroup.name,
          sortOrder: p.programGroup.sortOrder,
        }
      : null,
  }));

  const byProgram = aggregateProgramStats(programMeta, agg, {
    givenByProgram: options.consentMovement?.givenByProgram,
    withdrawnByProgram: options.consentMovement?.withdrawnByProgram,
  });

  return {
    byProgram,
    byGroup: includeGroups ? groupProgramStats(byProgram, programMeta) : undefined,
    programs: programMeta,
  };
}
