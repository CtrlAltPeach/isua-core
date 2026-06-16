# Базы данных и среды (main/prod ↔ dev/preview)

Цель: миграции схемы воспроизводимы и НЕ ломают прод. Прод (ветка `main`) и
preview (ветка `dev`) ходят в РАЗНЫЕ базы.

## Среды

| Ветка | Vercel-среда | База данных | DATABASE_URL |
|-------|--------------|-------------|--------------|
| `main` | Production   | прод-БД (боевые данные) | значение для **Production** |
| `dev`  | Preview      | dev-БД (тестовые данные) | значение для **Preview** |
| локально | —          | PostgreSQL portable :5432 | из `.env` |

## Разовая настройка preview-БД (делается в Vercel + у провайдера БД)

1. Создать вторую базу у провайдера (Neon/Supabase/…), напр. `isua_dev`.
   Получить её connection string.
2. Vercel → Settings → Environment Variables, переменная `DATABASE_URL`:
   - прод-строка → отметить **Production**;
   - dev-строка → отдельная запись, отметить **Preview** (и Development при желании).
   Одна переменная может иметь разные значения per-environment.
3. Накатить схему и (опц.) данные на dev-БД — см. ниже.
4. Те же `JWT_SECRET` и `ENCRYPTION_KEY` должны быть заданы для среды Preview
   (можно те же значения, что в Production, ИЛИ отдельные для dev).
   ⚠️ Если ENCRYPTION_KEY на dev отличается от прод — зашифрованные ПДн из прод-дампа
   на dev не расшифруются. Для чистой dev-БД это неважно.

## Применение миграций (ВРУЧНУЮ — Vercel их НЕ запускает)

Vercel при деплое НЕ выполняет миграции. Накатывать командой `migrate deploy`
(она применяет недостающие миграции, НЕ удаляет данные):

```bash
# прод
DATABASE_URL="<prod-url>" npx prisma migrate deploy

# dev / preview
DATABASE_URL="<dev-url>" npx prisma migrate deploy
```

Сидинг (только если нужны тестовые данные — НЕ на прод с боевыми):

```bash
DATABASE_URL="<dev-url>" ENCRYPTION_KEY="<key>" npm run db:seed
```

## Порядок при изменении схемы (рабочий цикл)

1. В ветке `dev` правлю `prisma/schema.prisma`, создаю миграцию в
   `prisma/migrations/<timestamp>_<name>/migration.sql` (вручную в этой среде:
   интерактивный `migrate dev` недоступен → пишем SQL + `migrate deploy` локально).
2. Тестирую локально (`migrate deploy` на portable-БД).
3. Коммит в `dev` → Vercel поднимает preview. Перед/после — накатываю миграцию
   на **dev-БД** (`DATABASE_URL=<dev-url> migrate deploy`). Preview не падает.
4. Когда готово к проду: слить `dev → main` → Vercel деплоит прод. Накатить
   миграцию на **прод-БД** (`DATABASE_URL=<prod-url> migrate deploy`).
   Порядок: сначала миграция БД, потом/одновременно код (чтобы код не обращался
   к ещё не существующей колонке).

## Чистое обнуление локальной БД (полностью пустая, без seed)

```bash
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Yes" \
  npx prisma migrate reset --force --skip-seed
```

## Накопленные миграции (на 2026-06-17)

init → simplify_statuses → add_passport_quota_paid_additional →
add_program_min_scores → lock_username → add_user_role → add_special_right
