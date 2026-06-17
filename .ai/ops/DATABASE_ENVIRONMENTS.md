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
$env:DATABASE_URL="<prod-url>" npx prisma migrate deploy
$env:DATABASE_URL="<prod-url>" npx prisma migrate reset --force

# dev / preview
$env:DATABASE_URL="<dev-url>" npx prisma migrate deploy
$env:DATABASE_URL="<dev-url>" npx prisma migrate reset --force
```

Сидинг (только если нужны тестовые данные — НЕ на прод с боевыми):

```bash
$env:DATABASE_URL="<dev-url>" ENCRYPTION_KEY="<key>" npm run db:seed
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

## Локаль БД: ICU ru-RU (12A) — ВАЖНО при создании любой новой базы

С итерации 12A база ИСУА должна создаваться с **ICU-локалью `ru-RU`**, иначе
регистронезависимый поиск по кириллице (`ILIKE` / Prisma `mode:"insensitive"`)
не сворачивает регистр русских букв (БД в C-locale → «ПЕТРОВ» не найдётся по «петр»).
Локаль — свойство БАЗЫ, не схемы: миграции Prisma её НЕ задают, задаётся при `CREATE DATABASE`.

**Новая база (managed-провайдер: Neon/Supabase/…):** создавать БД с ICU ru-RU.
Если провайдер не даёт указать локаль в UI — выполнить SQL под суперпользователем:

```sql
CREATE DATABASE isua
  TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER icu ICU_LOCALE 'ru-RU' LOCALE 'C';
```

(Neon: при создании проекта выбрать locale provider = ICU, locale = ru-RU; либо
создать БД отдельным `CREATE DATABASE …` как выше.) Затем обычный цикл:
`migrate deploy` → (опц.) `db:seed`.

**Проверка, что локаль верная** (provider должен быть `i`, datlocale = `ru-RU`):

```sql
SELECT datname, datlocprovider, datlocale FROM pg_database WHERE datname='isua';
-- быстрый тест: должно вернуть true
SELECT 'ПЕТРОВ' ILIKE '%петр%';
```

**Локальный portable-кластер (как сделано в 12A):** кластер остаётся в C-locale
(template0/1 не трогаем — это безопаснее и не задевает чужой PG КОМПАС-3D на :5433),
но саму БД `isua` пересоздали с ICU. Процедура (для воспроизведения/отката):

```bash
PG="$LOCALAPPDATA/isua-pg/pgsql/bin"; export PGPASSWORD=postgres
# 1) бэкап
"$PG/pg_dump.exe" -U postgres -h 127.0.0.1 -p 5432 -d isua -Fc -f isua.dump
# 2) новая БД с ICU ru-RU
"$PG/psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d postgres -c \
  "CREATE DATABASE isua_icu TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'ru-RU' LOCALE 'C';"
# 3) restore данных
"$PG/pg_restore.exe" -U postgres -h 127.0.0.1 -p 5432 -d isua_icu --no-owner isua.dump
# 4) swap имён (нет активных соединений!): старую сохраняем как бэкап
"$PG/psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d postgres -c \
  "ALTER DATABASE isua RENAME TO isua_c_backup; ALTER DATABASE isua_icu RENAME TO isua;"
```

Старая C-locale БД сохранена как `isua_c_backup` (откат: обратный RENAME).
DATABASE_URL не меняется (имя БД осталось `isua`). Бэкап-дамп: `%LOCALAPPDATA%\isua-pg\backups\`.

## Миграции (на 2026-06-18 — после squash)

История миграций схлопнута в одну `20260618030000_init` (squash), т.к. все 8
прежних были накатаны только локально на пустой БД. Новая init сгенерирована из
текущей schema.prisma командой `prisma migrate diff --from-empty
--to-schema-datamodel prisma/schema.prisma --script` и даёт ровно ту же схему.

⚠️ Squash безопасен только потому, что прод/dev-preview БД ещё не накатаны. Если
такая БД появится — на ней `migrate deploy` применит init с нуля (на пустой БД).
Делать squash повторно, когда есть БД с данными, НЕЛЬЗЯ без `migrate resolve`.
