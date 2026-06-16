// POST /api/auth/login — вход по email + паролю.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, signToken, setAuthCookie } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/http";
import { checkRateLimit, resetRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Ошибка валидации", 422, parsed.error.flatten());
  }
  const { email, password } = parsed.data;

  // Защита от перебора: лимит попыток по IP+email (10 за 15 минут).
  // IP берём с учётом доверенности прокси (H1).
  const ip = getClientIp(req);
  const rlKey = `login:${ip}:${email.toLowerCase()}`;
  const rl = checkRateLimit(rlKey, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    return fail(
      `Слишком много попыток входа. Повторите через ${rl.retryAfterSec} сек.`,
      429,
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Единое сообщение, чтобы не раскрывать существование email.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return fail("Неверный email или пароль", 401);
  }

  // Успешный вход — сбрасываем счётчик попыток.
  resetRateLimit(rlKey);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  const token = await signToken({
    sub: String(user.id),
    email: user.email,
    username: user.username,
    role: user.role,
    ver: user.tokenVersion,
  });
  await setAuthCookie(token);

  // Токен НЕ возвращаем в теле: он уже в httpOnly-cookie. Возврат в JSON
  // провоцировал бы хранение в localStorage (уязвимо к XSS).
  return ok({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
  });
}
