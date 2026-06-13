// Простой in-memory rate-limiter (скользящее окно по количеству попыток).
// Подходит для одного инстанса (приёмная комиссия). При горизонтальном
// масштабировании заменить на Redis/БД.
//
// Использование: const r = checkRateLimit(key); if (!r.allowed) ... 429.
// При успешной операции можно вызвать resetRateLimit(key).

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
