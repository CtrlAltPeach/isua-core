// Простой in-memory rate-limiter (скользящее окно по количеству попыток).
// Подходит для одного инстанса (приёмная комиссия). При горизонтальном
// масштабировании заменить на Redis/БД.
//
// Использование: const r = checkRateLimit(key); if (!r.allowed) ... 429.
// При успешной операции можно вызвать resetRateLimit(key).
import type { NextRequest } from "next/server";

interface Bucket {
  count: number;
  resetAt: number; // epoch ms — когда окно сбрасывается
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number; // сколько ждать до сброса (если заблокировано)
}

/**
 * Регистрирует попытку для ключа и сообщает, не превышен ли лимит.
 * @param key уникальный идентификатор (например, "login:<ip>:<email>")
 * @param limit максимум попыток за окно
 * @param windowMs длина окна в мс
 */
export function checkRateLimit(
  key: string,
  limit = 10,
  windowMs = 15 * 60 * 1000,
): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  b.count++;
  if (b.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
    };
  }
  return { allowed: true, remaining: limit - b.count, retryAfterSec: 0 };
}

/** Сбрасывает счётчик (например, после успешного входа). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

// Периодическая очистка протухших корзин, чтобы Map не рос бесконечно.
// (один таймер на процесс; unref — чтобы не держать event loop)
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
}, 10 * 60 * 1000);
if (typeof cleanup === "object" && "unref" in cleanup) cleanup.unref();

/**
 * Клиентский IP для rate-limit с учётом доверенности прокси (H1).
 *
 * Проблема: `x-forwarded-for` клиент может подделать → обойти лимит.
 * Решение по приоритету:
 *  1) `x-vercel-forwarded-for` — проставляется инфраструктурой Vercel,
 *     извне не подделывается (доверенный на Vercel).
 *  2) Если задан TRUST_PROXY=1 (за известным reverse-proxy) — берём ПЕРВЫЙ
 *     элемент `x-forwarded-for` (реальный клиент перед нашим прокси).
 *  3) Иначе XFF не доверяем; используем `x-real-ip` или "unknown".
 */
export function getClientIp(req: NextRequest): string {
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();

  if (process.env.TRUST_PROXY === "1") {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
  }

  return req.headers.get("x-real-ip") || "unknown";
}
