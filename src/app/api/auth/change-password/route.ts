// POST /api/auth/change-password — смена СВОЕГО пароля (D2).
// Требует авторизации. Проверяет текущий пароль, сохраняет новый, инкрементит
// tokenVersion (отзывает все прежние JWT — в т.ч. на других устройствах) и
// перевыдаёт свежий cookie, чтобы текущая сессия не разлогинилась.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  getCurrentUser,
  verifyPassword,
  hashPassword,
  signToken,
  setAuthCookie,
} from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validation";
import { ok, fail, unauthorized } from "@/lib/http";

export async function POST(req: NextRequest) {
  const current = await getCurrentUser(req);
  if (!current) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Ошибка валидации", 422, parsed.error.flatten());
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: current.id },
    select: { id: true, passwordHash: true, tokenVersion: true },
  });
  if (!user) return unauthorized();

  // Проверяем текущий пароль.
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return fail("Текущий пароль неверен", 400);
  }

  // Новый пароль не должен совпадать со старым.
  if (await verifyPassword(newPassword, user.passwordHash)) {
    return fail("Новый пароль не должен совпадать с текущим", 400);
  }

  const passwordHash = await hashPassword(newPassword);
  const newVersion = user.tokenVersion + 1;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, tokenVersion: newVersion },
    select: { id: true, email: true, username: true, role: true },
  });

  // Перевыдаём токен с новой версией — иначе текущий клиент тут же стал бы 401.
  const token = await signToken({
    sub: String(updated.id),
    email: updated.email,
    username: updated.username,
    role: updated.role,
    ver: newVersion,
  });
  await setAuthCookie(token);

  return ok({ success: true });
}
