// /api/program-groups/[id] — PUT (переименование/порядок), DELETE (admin).
// При удалении группы программы НЕ удаляются: FK onDelete: SetNull обнуляет
// programGroupId (программа становится «Без группы»).
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, forbidden, notFound } from "@/lib/http";
import { updateProgramGroupSchema } from "@/lib/validation";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin) return forbidden();

  const id = parseId((await params).id);
  if (!id) return fail("Некорректный id", 400);

  const body = await req.json().catch(() => null);
  const parsed = updateProgramGroupSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Ошибка валидации", 422, parsed.error.flatten());
  }

  const current = await prisma.programGroup.findUnique({ where: { id } });
  if (!current) return notFound("Группа");

  // Проверка уникальности имени, если меняется.
  if (parsed.data.name && parsed.data.name !== current.name) {
    const dup = await prisma.programGroup.findUnique({
      where: { name: parsed.data.name },
      select: { id: true },
    });
    if (dup) return fail("Группа с таким названием уже есть", 409);
  }

  const updated = await prisma.programGroup.update({
    where: { id },
    data: parsed.data,
  });
  return ok(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin) return forbidden();

  const id = parseId((await params).id);
  if (!id) return fail("Некорректный id", 400);

  const group = await prisma.programGroup.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!group) return notFound("Группа");

  // Программы остаются (SetNull). Просто удаляем группу.
  await prisma.programGroup.delete({ where: { id } });
  return ok({ success: true });
}
