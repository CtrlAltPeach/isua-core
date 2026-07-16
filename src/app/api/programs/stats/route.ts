// GET /api/programs/stats — агрегированная статистика по программам.
// Лёгкий эндпоинт для вкладки «Программы»: один запрос к БД, без history
// и без верхнеуровневых метрик дашборда. Использует переиспользуемую агрегацию
// из lib/program-stats (та же логика, что в /api/stats/daily, но без дневных окон).
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";
import {
  aggregateProgramsToStats,
  type ProgramWithApplicants,
} from "@/lib/program-stats";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const programs = (await prisma.program.findMany({
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
  })) as ProgramWithApplicants[];

  // newToday/consentGivenToday/consentWithdrawnToday не запрашиваем — вкладке
  // «Программы» они не нужны (не отображаются). aggregator вернёт для них 0.
  const byProgram = aggregateProgramsToStats(programs);

  return ok({ byProgram });
}
