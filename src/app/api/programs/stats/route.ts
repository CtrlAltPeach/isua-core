// GET /api/programs/stats — агрегированная статистика по программам.
// Лёгкий эндпоинт для вкладки «Программы»: агрегаты считаются на уровне БД
// (Prisma groupBy/aggregate), без history и без верхнеуровневых метрик дашборда.
// Итерация 22: раньше один findMany с include:{applicants} грузил все строки
// абитуриентов; теперь 8 мелких запросов, каждый возвращает O(программ) строк.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";
import { loadProgramStats } from "@/lib/program-stats-db";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  // Без dayWindow и consentMovement: newToday/consentGiven/consentWithdrawn = 0.
  const { byProgram } = await loadProgramStats(prisma);

  return ok({ byProgram });
}
