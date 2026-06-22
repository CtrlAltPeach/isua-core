// /api/program-groups — GET список групп, POST создание (admin).
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { programGroupSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const groups = await prisma.programGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { _count: { select: { programs: true } } },
  });

  return ok(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      sortOrder: g.sortOrder,
      programCount: g._count.programs,
    })),
  );
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = programGroupSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Ошибка валидации", 422, parsed.error.flatten());
  }

  const existing = await prisma.programGroup.findUnique({
    where: { name: parsed.data.name },
    select: { id: true },
  });
  if (existing) return fail("Группа с таким названием уже есть", 409);

  const created = await prisma.programGroup.create({
    data: {
      name: parsed.data.name,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
  });
  return ok(created, 201);
}
