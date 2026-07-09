# ИСУА: Контекст для ИИ-модели

## Проект
Веб-приложение для учёта абитуриентов в приёмной комиссии вуза. Next.js 16, TypeScript, PostgreSQL, Prisma, React.

## Текущее состояние (патч 0.19.1 — ветка dev → main)
> Патч 0.19.1 (2026-07-09): баг-фиксы (чипы `true→"1"`, пагинация «Все»/Infinity, `limit=0`
> подменялся на 50) + метрика «дистант × согласие» (`distantWithConsent` в stats/daily,
> составная карточка дашборда, XLSX COUNTIFS). Тесты 136 → 143.
> Итерация 19: UX таблицы — сортировка `NULLS LAST`, чипы-тогглы, сброс пароля админом.
> Патч 0.18.2: нормализация регистра ФИО (`name-case.ts`). Патч 0.18.3: опция «Все» в
> размере страницы. Итерация 18: дата рождения + подытоги/итог в таблице конкурса.
> Итерация 17: разделение «Доп. баллы / ВИ» (`viScore` 0–300, заменяет ЕГЭ в total).

### Технологии (фактические)
- Фреймворк: Next.js 16.2 (App Router, src-dir)
- Язык: TypeScript 5
- БД: PostgreSQL 18 (локально — системный сервис :5432; БД должна быть с ICU-локалью ru-RU) + Prisma 6.19 ORM
- Frontend: React 19, Tailwind CSS 4, Lucide icons
  - ВНИМАНИЕ: shadcn/ui, TanStack Table, Recharts **НЕ** используются.
    UI — собственные лёгкие компоненты в `src/components/ui.tsx`,
    таблица — нативная `<table>` с table-fixed, графики — простые div-бары.
- Состояние: Zustand 5
- Формы: React Hook Form 7 + Zod 4
- Аутентификация: bcryptjs + jose (JWT HS256, httpOnly-cookie `isua_token`)
  - rate-limit на login/register (`lib/rate-limit.ts`, `getClientIp` с trust-proxy), cookie SameSite=Strict
  - токен только в cookie; отзыв через `User.tokenVersion` (logout и смена пароля инкрементят → старые JWT невалидны)
  - смена своего пароля: `POST /api/auth/change-password` (инкремент tokenVersion + перевыдача cookie)
  - email регистронезависим (нормализация trim+lower в Zod-схеме register/login)
  - Роли admin/operator (`lib/auth.ts` `requireAdmin`): деструктивные операции и /manage — admin;
    регистрация закрыта (только admin создаёт юзеров; bootstrap первого admin на пустой БД)
  - Security-заголовки/CSP в `next.config.ts`
- Шифрование ПДн: AES-256-GCM (`lib/crypto.ts`), поля passport/inn/snils зашифрованы
  в БД. Шифрование на границе БД (`lib/applicant-pii.ts`). Keyring: текущий ключ
  `ENCRYPTION_KEY` + (на время ротации) `ENCRYPTION_KEY_OLD`; ротация — `npm run crypto:rotate`.
- Рантайм: Node.js (npm), НЕ Bun

### Структура БД (6 моделей)
- **User:** id, email (uniq), username (uniq), passwordHash, role (admin|operator), tokenVersion (отзыв JWT), createdAt, lastLogin
- **ProgramGroup:** id, name (uniq), sortOrder, createdAt — категория программ (группировка статистики/отчётов)
- **Program:** id, name (uniq), places (количество бюджетных мест), minScores (Json?), programGroupId (FK→ProgramGroup, onDelete SetNull), createdAt
- **Applicant:**
  - Основное: id, fullName, phone?, email?, programId (FK), status (applied|withdrawn), version (optimistic lock)
  - Экзамены: mathBase (2-5, в балл НЕ входит), mathProfile (0-100), russian, chemistry, physics, informatics, geography (0-100); additionalScores (доп. баллы 0-10); viScore? (ВИ — вступит. испытания вуза 0-300, если задано — ЗАМЕНЯЕТ сумму ЕГЭ); totalScore (auto: (viScore ?? сумма топ-3 предметов без mathBase) + доп.баллы)
  - Согласия: consentToEnroll (bool), documentsComplete (bool); флаги: specialQuota, specialRight, isPaid, isDistant (дистант)
  - Дата рождения: birthDate? (DATE, без времени; не шифруется)
  - Документы: documentType (diploma|certificate), citizenship, passportSeries, passportNumber
  - Персональные: registrationAddress?, inn?, snils?, notes?
  - ⚠️ passportSeries/passportNumber/inn/snils хранятся ЗАШИФРОВАННЫМИ (AES-256-GCM, enc:v1:…)
  - Служебные: createdAt, updatedAt, createdByUserId (FK→User)
- **History:** id, applicantId (FK!), fieldName, oldValue?, newValue?, changedByUserId (FK), changedAt
- **Lock:** id, applicantId (unique FK!), userSessionId, lockedAt, lastHeartbeat (совместное редактирование)

### Файловая структура
```
src/app/
  layout.tsx, page.tsx, globals.css
  login/page.tsx, register/page.tsx
  applicants/page.tsx, programs/page.tsx, statuses/page.tsx
  api/
    auth/: login, logout, register, me
    applicants/: [id]/route.ts (GET/PUT/DELETE), [id]/history/route.ts
    programs/route.ts, programs/[id]/route.ts
    users/route.ts, users/[id]/route.ts
    locks/[id]/route.ts, locks/[id]/heartbeat/route.ts
    stats/daily/route.ts
    applicants/bulk-delete/route.ts

src/components/
  app-shell.tsx, header.tsx, auth-guard.tsx
  dashboard.tsx, applicant-table.tsx, applicant-form-modal.tsx
  ui.tsx (собственные UI-компоненты)

src/lib/
  types.ts, store.ts, db.ts, auth.ts, api.ts, http.ts
  validation.ts, history.ts, scoring.ts
  applicant-logic.ts, applicant-ui.ts, applicant-pii.ts
  name-case.ts, crypto.ts, rate-limit.ts, timezone.ts, toast.ts, confirm.ts
  utils.ts (cn)

src/hooks/
  useAuth.ts, use-mobile.ts, use-toast.ts
```

### API (15+ endpoints)
```
POST /api/auth/register, /api/auth/login, /api/auth/logout
GET  /api/auth/me             POST /api/auth/change-password
GET  /api/applicants/export   (XLSX: лист данных + лист статистики с формулами; ПДн только admin)
GET  /api/applicants          (фильтры: status/program/search + чипы ok/op/consent/docs/paid/distant; поиск, пагинация, сортировка NULLS LAST)
POST /api/applicants
GET  /api/applicants/[id]
PUT  /api/applicants/[id]     (version-based optimistic lock)
DELETE /api/applicants/[id]
GET  /api/applicants/[id]/history
POST /api/applicants/bulk-delete
GET  /api/programs            POST /api/programs   (отдаёт groupId/groupName, принимает programGroupId)
PUT  /api/programs/[id]       DELETE /api/programs/[id]
GET  /api/program-groups      POST /api/program-groups            (admin)
PUT  /api/program-groups/[id] DELETE /api/program-groups/[id]     (admin, SetNull)
GET  /api/stats/daily         (byProgram + byGroup с подытогами places/абит/согл/док/платн/дистант/distantWithConsent/конкурс; согласия сегодня в разрезе программы)
GET  /api/users               PATCH /api/users/[id] (role)   DELETE /api/users/[id]
POST /api/users/[id]/reset-password (admin: хеш + tokenVersion++, отзыв сессий)
GET  /api/locks/[id]          POST /api/locks/[id]/heartbeat
```

### Экраны (6 + авторизация + отчёт)
0. `/login`, `/register` (перенаправляют на `/` если уже авторизован)
1. `/` (дашборд): метрики, графики (div-бары), таблица конкурса по программам
2. `/applicants`: поиск, фильтры, сортировка, пагинация, группировка по дням,
   строка-деталь (ПДн/заметка), история (часы), маркеры Б/О(ОК)/П
3. `/programs`: карточки программ, места, конкурс, средний балл, топ-3
4. `/statuses`: Kanban, 2 колонки (applied/withdrawn)
5. `/manage`: группы программ CRUD, программы CRUD + пороги + назначение группы, bulk-delete, UserManager (admin-only; сброс пароля — итер. 19)
6. `/report`: PDF-отчёт (печать браузера)

### Статистика кода
~5500+ строк кода (без UI и hooks)
15+ API endpoints
8 основных компонентов
6 моделей БД
15+ TypeScript интерфейсов
3 хука
124 теста (vitest: unit + интеграционные API; актуально 143 — см. CHANGELOG)
0 ESLint ошибок

---

## Связанные документы (в `.ai/`)

| Документ | Содержание |
|----------|-----------|
| `CHANGELOG.md` | История итераций 1–18 (каноничный changelog) |
| `REQUIREMENTS_BACKLOG.md` | Реестр требований по модулям, tracking-таблица |
| `NEXT_ITERATION.md` | План следующей итерации (кандидаты 19) |
| `SECURITY.md` | Аудит безопасности: закрыто / осталось |
| `ops/DATABASE_ENVIRONMENTS.md` | Среды БД, ICU-локаль, миграции, squash |

Договорённости по проекту (цвета, именование, процесс) — в `AGENTS.md` (корень).

---

## Локальная разработка
PostgreSQL 18 (системный сервис `postgresql-x64-18`) на :5432.
`DATABASE_URL=postgresql://postgres:<пароль>@127.0.0.1:5432/isua` (пароль роли задан
при установке PG18). Раньше был portable PG17 (`%LOCALAPPDATA%\isua-pg`) — удалён.
Запуск node/npm в этом окружении: `node` в `C:\Program Files\nodejs` (не в PATH).

Next.js 16 dev:
`npm run dev` → http://localhost:3000
