// /api/users/[id] — PATCH (смена роли), DELETE. Только admin.
// Защита: нельзя удалить себя; нельзя снять/удалить последнего админа.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, forbidden, notFound } from "@/lib/http";
import { z } from "zod";

const patchSchema = z.object({ role: z.enum(["admin", "operator"]) });

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin) return forbidden();

  const id = parseId((await params).id);
  if (!id) return fail("Некорректный id", 400);

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return fail("Ошибка валидации", 422, parsed.error.flatten());

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return notFound("Пользователь");

  // Понижение последнего админа до operator запрещено (иначе никто не админ).
  if (target.role === "admin" && parsed.data.role === "operator") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      return fail("Нельзя снять роль с последнего администратора", 409);
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role: parsed.data.role },
    select: { id: true, email: true, username: true, role: true },
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

  // Нельзя удалить самого себя.
  if (id === admin.id) {
    return fail("Нельзя удалить собственную учётную запись", 409);
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, _count: { select: { applicants: true } } },
  });
  if (!target) return notFound("Пользователь");

  // Нельзя удалить последнего админа.
  if (target.role === "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      return fail("Нельзя удалить последнего администратора", 409);
    }
  }

  // У пользователя могут быть созданные им абитуриенты (FK createdByUserId,
  // без onDelete). Блокируем удаление, чтобы не нарушить связь/историю.
  if (target._count.applicants > 0) {
    return fail(
      `Нельзя удалить: пользователь создал ${target._count.applicants} записей абитуриентов`,
      409,
    );
  }

  await prisma.user.delete({ where: { id } });
  return ok({ success: true });
}
