// /api/programs/[id] — PUT (переименование/места/пороги), DELETE.
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, forbidden, notFound } from "@/lib/http";
import { updateProgramSchema } from "@/lib/validation";

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
  const parsed = updateProgramSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Ошибка валидации", 422, parsed.error.flatten());
  }

  const current = await prisma.program.findUnique({ where: { id } });
  if (!current) return notFound("Программа");

  // Проверка уникальности имени, если меняется.
  if (parsed.data.name && parsed.data.name !== current.name) {
    const dup = await prisma.program.findUnique({
      where: { name: parsed.data.name },
      select: { id: true },
    });
    if (dup) return fail("Программа с таким названием уже есть", 409);
  }

  // Json-поле: null нужно передавать как Prisma.JsonNull.
  const { minScores, programGroupId, ...rest } = parsed.data;
  const data: Prisma.ProgramUpdateInput = { ...rest };
  if (minScores !== undefined) {
    data.minScores = minScores === null ? Prisma.JsonNull : minScores;
  }
  // Группа: null → отвязать, число → привязать, undefined → не трогать.
  if (programGroupId !== undefined) {
    data.programGroup =
      programGroupId === null
        ? { disconnect: true }
        : { connect: { id: programGroupId } };
  }

  const updated = await prisma.program.update({ where: { id }, data });
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

  const program = await prisma.program.findUnique({
    where: { id },
    select: { _count: { select: { applicants: true } } },
  });
  if (!program) return notFound("Программа");

  // Нельзя удалить программу с абитуриентами (FK + смысл).
  if (program._count.applicants > 0) {
    return fail(
      `Нельзя удалить: на программе ${program._count.applicants} абитуриент(ов)`,
      409,
    );
  }

  await prisma.program.delete({ where: { id } });
  return ok({ success: true });
}
