# ИСУА: Контекст для ИИ-модели

## Проект
Веб-приложение для учёта абитуриентов в приёмной комиссии вуза. Next.js 16, TypeScript, PostgreSQL, Prisma, React.

## Текущее состояние (итерация 13 завершена — версия 0.13.0, ветка dev)
> Работа ведётся в ветке `dev` (main = стабильный прод, Vercel автодеплоит main).
> Preview-деплой использует dev-БД (см. `ops/DATABASE_ENVIRONMENTS.md`).

### Технологии (фактические)
- Фреймворк: Next.js 16.2 (App Router, src-dir)
- Язык: TypeScript 5
- БД: PostgreSQL 17 portable (:5432, ICU locale ru-RU) + Prisma 6.19 ORM
- Frontend: React 19, Tailwind CSS 4, Lucide icons
  - ВНИМАНИЕ: shadcn/ui, TanStack Table, Recharts **НЕ** используются.
    UI — собственные лёгкие компоненты в `src/components/ui.tsx`,
    таблица — нативная `<table>` с table-fixed, графики — простые div-бары.
- Состояние: Zustand 5
- Формы: React Hook Form 7 + Zod 4
- Аутентификация: bcryptjs + jose (JWT HS256, httpOnly-cookie `isua_token`)
  - rate-limit на login/register (`lib/rate-limit.ts`, `getClientIp` с trust-proxy), cookie SameSite=Strict
  - токен только в cookie; отзыв через `User.tokenVersion` (logout инкрементит → старые JWT невалидны)
  - Роли admin/operator (`lib/auth.ts` `requireAdmin`): деструктивные операции и /manage — admin;
    регистрация закрыта (только admin создаёт юзеров; bootstrap первого admin на пустой БД)
  - Security-заголовки/CSP в `next.config.ts`
- Шифрование ПДн: AES-256-GCM (`lib/crypto.ts`), поля passport/inn/snils зашифрованы
  в БД, ключ ENCRYPTION_KEY. Шифрование на границе БД (`lib/applicant-pii.ts`).
- Рантайм: Node.js (npm), НЕ Bun

### Структура БД (5 моделей)
- **User:** id, email (uniq), username (uniq), passwordHash, role (admin|operator), tokenVersion (отзыв JWT), createdAt, lastLogin
- **Program:** id, name (uniq), places (количество бюджетных мест), createdAt
- **Applicant:**
  - Основное: id, fullName, phone?, email?, programId (FK), status (applied|withdrawn), version (optimistic lock)
  - Экзамены: mathBase (2-5, в балл НЕ входит), mathProfile (0-100), russian, chemistry, physics, informatics, geography (0-100), additionalScores, totalScore (auto: сумма топ-3 предметов + доп.баллы, без mathBase)
  - Согласия: consentToEnroll (bool), documentsComplete (bool); квоты: specialQuota, isPaid
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
  crypto.ts, rate-limit.ts, timezone.ts, toast.ts, confirm.ts
  utils.ts (cn)

src/hooks/
  useAuth.ts, use-mobile.ts, use-toast.ts
```

### API (15+ endpoints)
```
POST /api/auth/register, /api/auth/login, /api/auth/logout
GET  /api/auth/me
GET  /api/applicants          (фильтры, поиск, пагинация, сортировка)
POST /api/applicants
GET  /api/applicants/[id]
PUT  /api/applicants/[id]     (version-based optimistic lock)
DELETE /api/applicants/[id]
GET  /api/applicants/[id]/history
POST /api/applicants/bulk-delete
GET  /api/programs            POST /api/programs
PUT  /api/programs/[id]       DELETE /api/programs/[id]
GET  /api/stats/daily
GET  /api/users               PATCH /api/users/[id] (role)   DELETE /api/users/[id]
GET  /api/locks/[id]          POST /api/locks/[id]/heartbeat
```

### Экраны (6 + авторизация + отчёт)
0. `/login`, `/register` (перенаправляют на `/` если уже авторизован)
1. `/` (дашборд): метрики, графики (div-бары), таблица конкурса по программам
2. `/applicants`: поиск, фильтры, сортировка, пагинация, группировка по дням,
   строка-деталь (ПДн/заметка), история (часы), маркеры Б/О(ОК)/П
3. `/programs`: карточки программ, места, конкурс, средний балл, топ-3
4. `/statuses`: Kanban, 2 колонки (applied/withdrawn)
5. `/manage`: программы CRUD + пороги, bulk-delete, UserManager (admin-only)
6. `/report`: PDF-отчёт (печать браузера)

### Статистика кода
~5500+ строк кода (без UI и hooks)
15+ API endpoints
8 основных компонентов
5 моделей БД
15+ TypeScript интерфейсов
3 хука
62 теста (vitest: unit + интеграционные API)
0 ESLint ошибок

---

## Связанные документы (в `.ai/`)

| Документ | Содержание |
|----------|-----------|
| `CHANGELOG.md` | История итераций 1–13 (каноничный chanelog) |
| `REQUIREMENTS_BACKLOG.md` | Реестр требований по модулям, tracking-таблица |
| `NEXT_ITERATION.md` | План следующей итерации (кандидаты 14) |
| `SECURITY.md` | Аудит безопасности: закрыто / осталось |
| `ops/DATABASE_ENVIRONMENTS.md` | Среды БД, ICU-локаль, миграции, squash |

Договорённости по проекту (цвета, именование, процесс) — в `AGENTS.md` (корень).

---

## Локальная разработка
PostgreSQL 17 portable на :5432
Запуск: `pg_ctl -D path/to/data -l logfile start`
`DATABASE_URL=postgresql://user:pass@localhost:5432/isua`

Next.js 16 dev:
`npm run dev` → http://localhost:3000
