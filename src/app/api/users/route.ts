// GET /api/users — список пользователей (только admin).
// Создание пользователей — через POST /api/auth/register (admin-сценарий).
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden } from "@/lib/http";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return forbidden();

  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      createdAt: true,
      lastLogin: true,
    },
  });
  return ok(users);
}
