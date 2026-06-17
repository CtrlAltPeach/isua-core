# Безопасность ИСУА

Источник: статический аудит 2026-06-17 (все эндпоинты, auth/crypto/rate-limit, схема,
валидация, `.env`, `next.config`). Система обрабатывает **специальную категорию ПДн**
(паспорт/ИНН/СНИЛС) → требования повышенные.

Закрытые находки — с указанием итерации (детали — в `CHANGELOG.md`).
Открытые — с приоритетом и условием «когда актуально».

---

## Закрыто

| Находка | Итер. | Решение |
|---------|-------|---------|
| **K1.** Мутации без контроля доступа | 8 | роли admin/operator, `requireAdmin` на деструктивных эндпоинтах (programs CRUD, bulk-delete, удаление абитуриента, /api/users) |
| **K2.** Открытая регистрация | 8 | `/register` закрыт; bootstrap первого admin под rate-limit; 409 без enumeration |
| **H1.** Обход rate-limit через X-Forwarded-For | 10 | `getClientIp`: `x-vercel-forwarded-for` / `TRUST_PROXY` / `x-real-ip` |
| **H2.** JWT не отзывается | 10 | `User.tokenVersion` + claim `ver`; logout отзывает токены |
| **H3.** Нет security-заголовков / CSP | 10 | `next.config` `headers()`: CSP, HSTS, XFO=DENY, nosniff, Referrer, Permissions |
| **M2.** SameSite=Lax | 10 | auth-cookie `SameSite=Strict` |
| **M5.** additionalScores без cap | 10 | `.max(100)` в validation |
| **L4.** Демо-админ в seed на проде | 10 | не сеется без `SEED_ADMIN_PASSWORD` при `NODE_ENV=production` |

### Подтверждено как корректное (без изменений)
- Пароли: bcrypt cost 10, хеш не возвращается в API (`lib/auth.ts`, `schema.prisma`).
- JWT в httpOnly-cookie, **НЕ** в теле ответа login/register.
- Шифрование ПДн AES-256-GCM с проверкой GCM-tag, формат `enc:v1:iv:tag:ct` (`lib/crypto.ts`).
- История: ПДн логируются маской `•••`.
- Защита от SQL-инъекций: параметризованный `$queryRaw`, whitelist колонок сортировки (`SORTABLE`).
- Нет mass-assignment: обновление по явному whitelist + Zod.
- Оптимистичная блокировка (version → 409). Единое сообщение ошибки логина.
- `.env` в `.gitignore`, не в git.

---

## Осталось (не начато)

| # | Приоритет | Что | Когда актуально |
|---|-----------|-----|-----------------|
| **M1** | 🟡 | rate-limit in-memory → Redis/БД | при горизонтальном масштабировании (на Vercel serverless — частично уже) |
| **M3** | 🟡 | ротация ключа шифрования: `enc:v2:` + dual-key decrypt + фоновая миграция | если планируется смена ENCRYPTION_KEY (связано с B) |
| **M4** | 🟡 | ENCRYPTION_KEY в KMS/secret-manager (сейчас env) | ужесточение прод-секретов |
| **L1** | 🟢 | `iss`/`aud` claims в JWT | при появлении второго сервиса |
| **L2** | 🟢 | сложность пароля / проверка по словарю утёкших | по желанию |
| **L3** | 🟢 | не отдавать `parsed.error.flatten()` клиенту на проде | по желанию |
| **L5** | 🟢 | серверный middleware (сейчас auth в каждом route + клиентский guard) | надёжнее, но текущее работает |
| **L6** | 🟢 | polling 20с → SSE при росте нагрузки | при росте числа пользователей |
| — | 🟢 | полноценный nonce-CSP (сейчас умеренный с `'unsafe-inline'`) | требует dynamic rendering всех страниц |
| **B** | — | заменить боевые JWT_SECRET / ENCRYPTION_KEY | на пользователе (Vercel env) |

---

## Рекомендуемый порядок устранения (из остатка)
1. **M3** (ротация ключа шифрования) — снимает боль «сменил ENCRYPTION_KEY → данные нечитаемы»;
   связано с B.
2. **M4** (KMS/secret-manager) + **B** (смена боевых секретов) — ужесточение прод-секретов.
3. **M1** (rate-limit → Redis) — только при росте числа инстансов.
4. L1–L6, nonce-CSP — по мере подготовки к масштабированию.
