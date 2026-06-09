// /api/programs — GET список, POST создание.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";
import { programSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const programs = await prisma.program.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { applicants: true } } },
  });

  const result = programs.map((p) => ({
    id: p.id,
    name: p.name,
    places: p.places,
    applicantCount: p._count.applicants,
    // Конкурс: абитуриентов на место (0 мест → null).
    competition:
      p.places > 0
        ? Math.round((p._count.applicants / p.places) * 100) / 100
        : null,
  }));

  return ok(result);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = programSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Ошибка валидации", 422, parsed.error.flatten());
  }

  const existing = await prisma.program.findUnique({
    where: { name: parsed.data.name },
    select: { id: true },
  });
  if (existing) return fail("Программа с таким названием уже есть", 409);

  const created = await prisma.program.create({ data: parsed.data });
  return ok(created, 201);
}
