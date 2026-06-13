// POST /api/auth/register — регистрация пользователя.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, signToken, setAuthCookie } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/http";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Ошибка валидации", 422, parsed.error.flatten());
  }
  const { email, username, password } = parsed.data;

  // Проверяем уникальность email и username.
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true },
  });
  if (existing) {
    const field = existing.email === email ? "email" : "имя пользователя";
    return fail(`Такой ${field} уже занят`, 409);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, username, passwordHash, lastLogin: new Date() },
    select: { id: true, email: true, username: true },
  });

  const token = await signToken({
    sub: String(user.id),
    email: user.email,
    username: user.username,
  });
  await setAuthCookie(token);

  // Токен только в httpOnly-cookie, в теле не отдаём (см. login).
  return ok({ user }, 201);
}
