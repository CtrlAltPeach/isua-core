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
| **M3.** Ротация ключа шифрования | 16 | keyring `ENCRYPTION_KEY` + `ENCRYPTION_KEY_OLD` (trial-decrypt), скрипт `npm run crypto:rotate`, runbook ниже |

### Подтверждено как корректное (без изменений)
- Пароли: bcrypt cost 10, хеш не возвращается в API (`lib/auth.ts`, `schema.prisma`).
- JWT в httpOnly-cookie, **НЕ** в теле ответа login/register.
- Шифрование ПДн AES-256-GCM с проверкой GCM-tag, формат `enc:v1:iv:tag:ct` (`lib/crypto.ts`).
  Ротация ключа: keyring `ENCRYPTION_KEY` (+ `ENCRYPTION_KEY_OLD`), см. раздел «Ротация ключа» ниже.
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
1. **M4** (KMS/secret-manager) + **B** (смена боевых секретов) — ужесточение прод-секретов.
2. **M1** (rate-limit → Redis) — только при росте числа инстансов.
3. L1–L6, nonce-CSP — по мере подготовки к масштабированию.

---

## Ротация ключа шифрования (M3)

Keyring (`lib/crypto.ts`): `encrypt` всегда шифрует текущим `ENCRYPTION_KEY`; `decrypt`
пробует текущий ключ, затем старые из `ENCRYPTION_KEY_OLD` (несколько — через запятую) —
auth-tag GCM однозначно выявляет верный. Формат остаётся `enc:v1` (смена формата не нужна).

Порядок ротации (прод):
1. **Бэкап БД** (обязательно; см. `ops/DATABASE_ENVIRONMENTS.md`).
2. Новый ключ: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. В env: `ENCRYPTION_KEY_OLD` = СТАРЫЙ ключ, `ENCRYPTION_KEY` = НОВЫЙ. Redeploy. На этом шаге
   приложение читает старые данные старым ключом, а пишет новые — новым.
4. Предпросмотр: `npm run crypto:rotate -- --dry-run` (ничего не пишет; покажет объём работы).
5. Перешифровать все ПДн: `npm run crypto:rotate`. Идемпотентно (можно повторять); поля,
   которые не расшифровал ни один ключ, не трогаются (счётчик «НЕ расшифровано» → проверить OLD).
6. Убедиться: «НЕ расшифровано» = 0 и данные читаются в интерфейсе.
7. Убрать `ENCRYPTION_KEY_OLD` из env. Redeploy. Старый ключ вывести из обращения.

Скрипт берёт `DATABASE_URL` и ключи из окружения (локально — из `.env`). Для прод-прогона
указать прод-`DATABASE_URL` и оба ключа в окружении запуска.
