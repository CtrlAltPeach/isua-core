# ИСУА: Контекст для ИИ-модели

## Проект
Веб-приложение для учёта абитуриентов в приёмной комиссии вуза. Next.js 16, TypeScript, PostgreSQL, Prisma, React.

## Текущее состояние (итерация 2)

### Технологии
- Фреймворк: Next.js 16 (App Router)
- Язык: TypeScript 5
- БД: PostgreSQL 17 + Prisma 6 ORM
- Frontend: React, Tailwind CSS 4, shadcn/ui, Lucide icons
- Состояние: Zustand
- Таблицы: TanStack Table 8
- Графики: Recharts 2
- Формы: React Hook Form 7 + Zod 4
- Аутентификация: bcrypt + JWT (custom, в cookie)
- Валидация: Zod runtime validation
- Рантайм: Bun

### Структура БД (5 моделей)
- User: id, email (uniq), username (uniq), passwordHash, createdAt, lastLogin
- Program: id, name (uniq), places (количество бюджетных мест), createdAt
- Applicant:
  - Основное: id, fullName, phone?, email?, programId (FK), status (applied|withdrawn), version (optimistic lock)
  - Экзамены: mathBase (2-5), mathProfile (0-100), russian, chemistry, physics, informatics, geography (0-100), totalScore (auto-avg, без mathBase)
  - Согласия: consentToEnroll (bool), documentsComplete (bool)
  - Персональные: registrationAddress?, inn?, snils?, notes?
  - Служебные: createdAt, updatedAt, createdByUserId (FK→User)
- History: id, applicantId (FK!), fieldName, oldValue?, newValue?, changedByUserId (FK), changedAt
- Lock: id, applicantId (unique FK!), userSessionId, lockedAt, lastHeartbeat (для совместного редактирования)

### Файловая структура (написанный код)
src/app/
  layout.tsx, page.tsx, globals.css
  login/page.tsx, register/page.tsx
  applicants/page.tsx, programs/page.tsx, statuses/page.tsx
  api/
    auth/: login, logout, register, me (routes)
    applicants/: [id]/route.ts (GET/PUT/DELETE), [id]/history/route.ts
    programs/route.ts
    stats/daily/route.ts

src/components/
  app-shell.tsx (навигация)
  header.tsx (профиль юзера)
  auth-guard.tsx (HOC защиты)
  dashboard.tsx (метрики + графики)
  applicant-table.tsx (основная таблица)
  applicant-form-modal.tsx (редактирование с вкладками)
  ui.tsx (shadcn компоненты)

src/lib/
  types.ts (TypeScript interfaces)
  store.ts (Zustand)
  db.ts (Prisma singleton)
  auth.ts (JWT + bcrypt utils)
  api.ts (fetch wrapper)
  http.ts (HTTP utils)
  validation.ts (Zod schemas)
  history.ts (логирование изменений)
  scoring.ts (расчёт totalScore)
  applicant-logic.ts (бизнес-логика)
  applicant-ui.ts (UI-утилиты)
  utils.ts (cn)

src/hooks/
  useAuth.ts (авторизация)
  use-mobile.ts, use-toast.ts

### API (13 endpoints)
POST /api/auth/register, /api/auth/login, /api/auth/logout
GET /api/auth/me
GET /api/applicants (фильтры, поиск, пагинация, сортировка)
POST /api/applicants
GET /api/applicants/[id], PUT /api/applicants/[id] (version-based optimistic lock), DELETE /api/applicants/[id]
GET /api/applicants/[id]/history
GET /api/programs
POST /api/programs
GET /api/stats/daily

### Экраны (5 + авторизация)
0. /login, /register (перенаправляют на / если уже авторизован)
1. / (дашборд): метрики (всего, applied, consentToEnroll, documentComplete), графики, таблица конкурса по программам
2. /applicants: поиск, фильтры (status, program), сортировка, пагинация, добавление/редактирование (вкладки: основное/баллы/контакты/персональное/история), удаление
3. /programs: карточки программ, места, конкурс, средний балл, прогресс, разбивка по статусам, топ-3
4. /statuses: Kanban, 2 колонки (applied/withdrawn)

### Статистика кода
~5500+ строк кода (без UI и hooks)
13 API endpoints
8 основных компонентов (+ 40+ shadcn/ui)
5 моделей БД
15+ TypeScript интерфейсов
3 хука
5 программ, 80+ абитуриентов (seed)
0 ESLint ошибок

## План следующих итераций (из NEXT_ITERATION.md)

### ПРИОРИТЕТ 1: Инфраструктура БД
1.1 Пересоздать БД с ICU/русской локалью (initdb с ru-RU и ICU-provider)
  - Проблема: текущий кластер C-locale, ILIKE/сортировка не учитывают кириллицу
  - Убрать костыль COLLATE "und-x-icu" из raw SQL
  - Вернуть mode: "insensitive" в Prisma

### ПРИОРИТЕТ 2: Завершить фазу 4 (вкладки + история)
2.1 Вкладка «Программы» (карточки) — места, абитуриенты, конкурс, средний балл, прогресс, статусы, топ-3, кнопка фильтра
2.2 Вкладка «Статусы» (Kanban) — 2 колонки (applied/withdrawn), мини-карточки с редактированием
2.3 Модаль истории — кнопка-часы в таблице, журнал с полем→старое→новое→кто→когда
  - Добавить кнопку истории в таблицу (сейчас только edit/delete)

### ПРИОРИТЕТ 3: Фаза 4 - Экспорт
3.1 PDF-отчёт: /api/export/pdf?type=daily_report|ranking|all_applicants (pdfkit или jsPDF)
3.2 CSV-экспорт (опционально)

### ПРИОРИТЕТ 4: Фаза 5 - Синхронизация (real-time)
- Выбрать механизм: REST-локи+polling vs Socket.io
- Схема Lock в БД готова
- API блокировок: POST/DELETE /api/locks/[id], POST .../heartbeat
- Heartbeat 10 сек, таймаут 30 сек
- UI: при открытии → lock, показывать «Редактирует: …», снятие при закрытии
- Если Socket.io: кастомный server.js + broadcast

### ПРИОРИТЕТ 5: Фаза 6 - Полировка
5.1 Временные зоны: сейчас stats/daily упрощён (МСК=UTC+3, прочие=UTC)
  - Корректный расчёт границ суток для любой зоны (date-fns-tz / Intl)
  - Меню выбора зоны в шапке (хранится в Zustand)
5.2 Toast-уведомления вместо alert/confirm
5.3 Retry/переподключение при потере соединения
5.4 Тесты: unit (calculateTotalScore, normalizeConsent, history) + интеграционные

## Технический долг
- RHF watch() даёт ESLint-warning incompatible-library (React Compiler). Решение: useWatch / контролируемые поля.
- Апгрейд Prisma 6→7 (требует prisma.config.ts + driver adapter) — не срочно.

## Известные баги
- mathBase score: ручной ввод влияет на балл в таблице (чинить в следующей итерации)
- ICU collation: нативный ILIKE не учитывает кириллицу (чинить Priority 1)

## Локальная разработка
PostgreSQL 17 portable на :5432
Запуск: pg_ctl -D path/to/data -l logfile start
DATABASE_URL=postgresql://user:pass@localhost:5432/isua

Бун, Next.js 16 dev:
bun run dev → http://localhost:3000

## Особенности и договорённости
- Зелёный акцент (emerald) + крупный шрифт в UI
- Имена md-файлов памяти заглавными буквами (FILE_NAMING.md)
- При внесении изменений: логировать в History, обновлять totalScore, снимать блокировку

## Где собирать идеи и требования
**REQUIREMENTS_BACKLOG.md** — систематизированный реестр всех требований для будущих итераций
- Организовано по модулям (БД, UI, логика, дашборд)
- Приоритеты и распределение по итерациям (3, 4, 5)
- Tracking: что сделано ✅, что в работе ⏳, что не начинали ❌
- Договорённости по цветам и стилям

**Процесс добавления требований:**
1. Требование добавляется в REQUIREMENTS_BACKLOG.md (в соответствующий раздел)
2. Ставится статус ❌ / ⏳ / ✅
3. Указывается приоритет (итерация 3, 4 или 5)
4. Перед началом итерации: читать раздел этой итерации в backlog
