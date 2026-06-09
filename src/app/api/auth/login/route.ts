// POST /api/auth/login — вход по email + паролю.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, signToken, setAuthCookie } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/http";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Ошибка валидации", 422, parsed.error.flatten());
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Единое сообщение, чтобы не раскрывать существование email.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return fail("Неверный email или пароль", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  const token = await signToken({
    sub: String(user.id),
    email: user.email,
    username: user.username,
  });
  await setAuthCookie(token);

  return ok({
    user: { id: user.id, email: user.email, username: user.username },
    token,
  });
}
