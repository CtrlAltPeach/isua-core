// POST /api/auth/register — создание пользователя.
// Публичная регистрация ЗАКРЫТА. Два сценария:
//  1) Bootstrap: если в системе ещё НЕТ пользователей — создаётся первый admin
//     и сразу логинится (первичная настройка пустого деплоя).
//  2) Иначе — создавать юзеров может ТОЛЬКО admin; новый юзер получает указанную
//     роль (по умолчанию operator), БЕЗ автологина (админ остаётся собой).
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  hashPassword,
  signToken,
  setAuthCookie,
  requireAdmin,
} from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { ok, fail, forbidden } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Ошибка валидации", 422, parsed.error.flatten());
  }
  const { email, username, password, role } = parsed.data;

  const userCount = await prisma.user.count();
  const isBootstrap = userCount === 0;

  // Вне bootstrap — создавать юзеров может только админ.
  if (!isBootstrap) {
    const admin = await requireAdmin(req);
    if (!admin) {
      return forbidden("Создавать пользователей может только администратор");
    }
  } else {
    // Bootstrap-эндпоинт публичен (создание первого админа) — лимитируем,
    // чтобы его нельзя было обстреливать. По IP, 5 попыток за 15 минут.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "local";
    const rl = checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return fail(
        `Слишком много попыток. Повторите через ${rl.retryAfterSec} сек.`,
        429,
      );
    }
  }

  // Проверяем уникальность email и username. Единое сообщение, чтобы не
  // раскрывать, какое именно поле занято (защита от enumeration учёток).
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { id: true },
  });
  if (existing) {
    return fail("Пользователь с такими данными уже существует", 409);
  }

  // Первый юзер всегда admin; далее — указанная роль (по умолчанию operator).
  const newRole = isBootstrap ? "admin" : (role ?? "operator");

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
      role: newRole,
      lastLogin: isBootstrap ? new Date() : null,
    },
    select: { id: true, email: true, username: true, role: true },
  });

  // Автологин только при bootstrap (первичная настройка). При создании юзера
  // админом — НЕ перелогиниваем админа.
  if (isBootstrap) {
    const token = await signToken({
      sub: String(user.id),
      email: user.email,
      username: user.username,
      role: user.role,
    });
    await setAuthCookie(token);
  }

  return ok({ user }, 201);
}
