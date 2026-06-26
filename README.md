# ИСУА — учёт абитуриентов вуза

Информационная система учёта абитуриентов приёмной комиссии: ведение карточек
абитуриентов, расчёт баллов и конкурса, статусы заявлений, дашборд с аналитикой,
управление программами и пользователями, журнал изменений и PDF-отчёт.

Интерфейс — русскоязычный, адаптивный (десктоп и мобильный).

## Стек

- **Next.js 16** (App Router, `src/`, Turbopack) + **React 19** + **TypeScript 5**
- **PostgreSQL** + **Prisma 6** (ORM)
- **Tailwind CSS 4**, иконки Lucide, состояние — Zustand 5
- Формы — React Hook Form 7 + Zod 4
- Аутентификация — JWT (jose, HS256) в httpOnly-cookie + bcryptjs
- ПДн (паспорт/ИНН/СНИЛС) шифруются в БД (AES-256-GCM)
- Тесты — Vitest

## Требования

- Node.js 20+
- PostgreSQL 17+ (локально используется 18), **созданный с ICU-локалью `ru-RU`** —
  иначе регистронезависимый поиск по кириллице не работает (см. ниже и
  `.ai/ops/DATABASE_ENVIRONMENTS.md`).

## Быстрый старт (локально)

```bash
# 1. Зависимости
npm install

# 2. Переменные окружения
cp .env.example .env
#   заполните DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY (подсказки по генерации — в .env.example)

# 3. Схема БД
npx prisma migrate deploy
npx prisma generate

# 4. (опц.) тестовые данные: 4 программы, 60 абитуриентов, демо-админ
npm run db:seed

# 5. Запуск
npm run dev   # http://localhost:3000
```

Демо-вход после сидинга: `admin@isua.local` / `admin12345`.

> Первый пользователь на пустой БД становится администратором (страница `/register`).
> Дальше новых пользователей создаёт только админ (раздел «Управление»).

## База данных: ICU-локаль (важно)

База должна быть создана с провайдером локали ICU и локалью `ru-RU`:

```sql
CREATE DATABASE isua
  TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER icu ICU_LOCALE 'ru-RU' LOCALE 'C';
```

Проверка (`datlocprovider` должен быть `i`, тест должен вернуть `true`):

```sql
SELECT datname, datlocprovider, datlocale FROM pg_database WHERE datname = 'isua';
SELECT 'ПЕТРОВ' ILIKE '%петр%';
```

Локальный portable-PostgreSQL и пошаговая миграция C-locale → ICU описаны в
`.ai/ops/DATABASE_ENVIRONMENTS.md`.

## Скрипты

| Команда | Назначение |
|---|---|
| `npm run dev` | Dev-сервер (Turbopack) |
| `npm run build` | Прод-сборка |
| `npm start` | Запуск прод-сборки |
| `npm run lint` | ESLint |
| `npm test` | Unit + интеграционные тесты (Vitest) |
| `npm run test:watch` | Vitest в watch-режиме |
| `npm run db:migrate` | `prisma migrate dev` (создать миграцию) |
| `npm run db:seed` | Сидинг тестовых данных |
| `npm run db:studio` | Prisma Studio |
| `npm run crypto:rotate` | Перешифрование ПДн при ротации ключа |

## Переменные окружения

Описаны в `.env.example`. Ключевые:

- `DATABASE_URL` — строка подключения к PostgreSQL.
- `JWT_SECRET`, `JWT_EXPIRY` — подпись и срок жизни токена.
- `ENCRYPTION_KEY` — 32 байта (hex) для AES-256-GCM. ⚠️ Храните как пароль от БД;
  для смены ключа без потери данных используйте `ENCRYPTION_KEY_OLD` + `npm run crypto:rotate`
  (runbook: `.ai/SECURITY.md`).
- `ENCRYPTION_KEY_OLD` — предыдущий ключ (или несколько через запятую) на время ротации.
- `TRUST_PROXY` — доверять `X-Forwarded-For` (только за известным reverse-proxy).
- `SEED_DATA` — `1` чтобы засеять тестовые данные (4 программы + 60 абитуриентов + демо-админ).
- `SEED_ADMIN_PASSWORD` — пароль демо-админа при сидинге на проде.

## Тесты

```bash
npm test            # одноразовый прогон
npm run test:watch  # watch-режим
```

Покрытие: расчёт баллов, бизнес-логика согласий, шифрование, журнал изменений,
таймзоны (включая «сегодня» по локальной дате), retry клиентской fetch-обёртки,
интеграционные тесты API-роутов (`/api/applicants`, `/api/programs`,
`/api/program-groups`, история с событием создания).

## Деплой (Vercel)

- Переменные окружения задаются в Vercel (Settings → Environment Variables),
  раздельно для Production / Preview — файл `.env` на хостинге не читается.
- Миграции Vercel **не** запускает автоматически: накатывать вручную
  `DATABASE_URL=<url> npx prisma migrate deploy`.
- Ветка `main` → Production, `dev` → Preview (разные БД).

Подробности — `.ai/ops/DATABASE_ENVIRONMENTS.md`.

## Структура

```
src/
  app/          — страницы (App Router) и API-роуты (app/api/**)
  components/   — UI-компоненты
  lib/          — бизнес-логика, утилиты, клиентский API
  hooks/        — React-хуки
prisma/         — schema.prisma, миграции, seed
.ai/            — контекст для ИИ: CHANGELOG, бэклог, безопасность, план итераций
  ops/          — эксплуатационные документы (среды БД, ICU-локаль, миграции)
AGENTS.md       — правила разработки
README.md       — этот файл
```
