// POST /api/users/[id]/reset-password — сброс пароля пользователя администратором.
// Только admin. Хеширует новый пароль и инкрементит tokenVersion целевого юзера,
// что отзывает все его прежние JWT (на всех устройствах). Cookie админа не трогаем —
// меняется чужой пароль, своя сессия остаётся.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { adminResetPasswordSchema } from "@/lib/validation";
import { ok, fail, forbidden, notFound } from "@/lib/http";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin) return forbidden();

  const id = parseId((await params).id);
  if (!id) return fail("Некорректный id", 400);

  const body = await req.json().catch(() => null);
  const parsed = adminResetPasswordSchema.safeParse(body);
  if (!parsed.success) return fail("Ошибка валидации", 422, parsed.error.flatten());

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, tokenVersion: true },
  });
  if (!target) return notFound("Пользователь");

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id },
    data: { passwordHash, tokenVersion: target.tokenVersion + 1 },
  });

  return ok({ success: true });
}
