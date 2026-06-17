# ИСУА: Контекст для ИИ-модели

## Проект
Веб-приложение для учёта абитуриентов в приёмной комиссии вуза. Next.js 16, TypeScript, PostgreSQL, Prisma, React.

## Текущее состояние (итерация 11 завершена — версия 0.11.1, ветка dev)
> Работа ведётся в ветке `dev` (main = стабильный прод, Vercel автодеплоит main).
> Преview-деплой использует dev-БД (см. PROMPT/DATABASE_ENVIRONMENTS.md).

### Технологии (фактические — НЕ как в старом плане)
- Фреймворк: Next.js 16.2 (App Router, src-dir)
- Язык: TypeScript 5
- БД: PostgreSQL 17 portable (:5432, locale=C) + Prisma 6.19 ORM
- Frontend: React 19, Tailwind CSS 4, Lucide icons
  - ВНИМАНИЕ: shadcn/ui, TanStack Table, Recharts НЕ используются.
    UI — собственные лёгкие компоненты в src/components/ui.tsx,
    таблица — нативная <table> с table-fixed, графики — простые div-бары.
- Состояние: Zustand 5
- Формы: React Hook Form 7 + Zod 4
- Аутентификация: bcryptjs + jose (JWT HS256, httpOnly-cookie isua_token)
  - rate-limit на login/register (lib/rate-limit.ts, getClientIp с trust-proxy), cookie SameSite=Strict
  - токен только в cookie; отзыв через User.tokenVersion (logout инкрементит → старые JWT невалидны)
  - Роли admin/operator (lib/auth.ts requireAdmin): деструктивные операции и /manage — admin;
    регистрация закрыта (только admin создаёт юзеров; bootstrap первого admin на пустой БД)
  - Security-заголовки/CSP в next.config.ts (H3)
- Шифрование ПДн: AES-256-GCM (lib/crypto.ts), поля passport/inn/snils зашифрованы
  в БД, ключ ENCRYPTION_KEY. Шифрование на границе БД (lib/applicant-pii.ts).
- Рантайм: Node.js (npm), НЕ Bun

### Структура БД (5 моделей)
- User: id, email (uniq), username (uniq), passwordHash, role (admin|operator), tokenVersion (отзыв JWT), createdAt, lastLogin
- Program: id, name (uniq), places (количество бюджетных мест), createdAt
- Applicant:
  - Основное: id, fullName, phone?, email?, programId (FK), status (applied|withdrawn), version (optimistic lock)
  - Экзамены: mathBase (2-5, в балл НЕ входит), mathProfile (0-100), russian, chemistry, physics, informatics, geography (0-100), additionalScores, totalScore (auto: сумма топ-3 предметов + доп.баллы, без mathBase)
  - Согласия: consentToEnroll (bool), documentsComplete (bool); квоты: specialQuota, isPaid
  - Документы: documentType (diploma|certificate), citizenship, passportSeries, passportNumber
  - Персональные: registrationAddress?, inn?, snils?, notes?
  - ⚠️ passportSeries/passportNumber/inn/snils хранятся ЗАШИФРОВАННЫМИ (AES-256-GCM, enc:v1:…)
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

### Экраны (6 + авторизация + отчёт)
0. /login, /register (перенаправляют на / если уже авторизован)
1. / (дашборд): метрики, графики (div-бары), таблица конкурса по программам
2. /applicants: поиск, фильтры (status, program), сортировка, пагинация,
   добавление/редактирование (вкладки), группировка по дням, история (часы),
   клик по строке = редактирование, маркеры Б/О/П, предупреждение о баллах ниже порога
3. /programs: карточки программ, места, конкурс, средний балл, прогресс, статусы, топ-3
4. /statuses: Kanban, 2 колонки (applied/withdrawn), клик по карточке = редактирование
5. /manage: управление программами (CRUD + пороги) + массовое удаление абитуриентов
6. /report: PDF-отчёт (печать браузера)

### Статистика кода
~5500+ строк кода (без UI и hooks)
13 API endpoints
8 основных компонентов (+ 40+ shadcn/ui)
5 моделей БД
15+ TypeScript интерфейсов
3 хука
5 программ, 80+ абитуриентов (seed)
0 ESLint ошибок

## Что уже сделано (итерации 1–11)
- ✅ Backend, авторизация, дашборд, таблица абитуриентов (итер. 1)
- ✅ Поля абитуриента (паспорт, гражданство, тип документа, особая квота, платное),
     вкладки в карточке, маркеры в таблице (Б/О/П) (итер. 3)
- ✅ История-модал (часы в строке), новые метрики дашборда, группировка по дням (итер. 4)
- ✅ Минимальный порог баллов по программам, PDF-отчёт (window.print + print-CSS),
     блокировки записей (REST-локи + heartbeat 10с + таймаут 30с) (итер. 5)
- ✅ Вкладка «Программы» (карточки с аналитикой)
- ✅ Вкладка «Статусы» (Kanban, 2 колонки applied/withdrawn)
- ✅ Таблица: резиновая раскладка → фикс-ширина ФИО (w-72), фикс-шапка (sticky),
     внутренний скролл, клик по строке = редактирование, убран карандаш (итер. 6)
- ✅ Управление: /manage (program-manager + bulk-delete + пороги)
- ✅ Исправлен баг Zod coerce (пустые баллы сохранялись как 0) — z.preprocess(emptyToNull)
- ✅ Итерация 7: нетто-согласия за день (7A), карточка секциями вместо вкладок (7B),
     шифрование ПДн паспорт/ИНН/СНИЛС AES-256-GCM (7C), раскрывающаяся строка-деталь
     в таблице с заметкой/ПДн (7D), авто-обновление таблицы polling 20с (7F), имя
     программы в истории (7G), аудит безопасности (rate-limit login, token не в теле),
     seed с зашифрованными ПДн. ФИО без fade (w-auto+truncate), колонка «Телефон».

- ✅ Итерация 8 (безопасность): роли admin/operator (enum Role, requireAdmin), серверные
     ограничения на деструктивные операции (programs CRUD, bulk-delete, удаление абитуриента,
     /api/users — только admin), закрытие публичной регистрации (только admin создаёт юзеров,
     bootstrap первого admin), UI управления пользователями (UserManager в /manage),
     rate-limit на register, анти-enumeration в 409. Закрыты A/C/K1/K2 (см. §13 бэклога).
- ✅ Особое право (0.8.1): поле specialRight, чекбокс, маркеры ОК/ОП (две градации жёлтого).
- ✅ Итерация 9 (полировка+инфра): unit-тесты (vitest, 36 тестов — scoring/consent/crypto/
     history/timezone); корректные таймзоны (lib/timezone.ts через Intl, убран хардкод
     МСК=UTC+3); toast вместо alert/confirm (lib/toast + Toaster, lib/confirm + ConfirmDialog);
     техдолг RHF watch()→useWatch (ESLint 0 проблем); документация сред БД
     (PROMPT/DATABASE_ENVIRONMENTS.md — preview-БД для dev).
- ✅ Итерация 10 (безопасность H/M/L): security-заголовки/CSP (next.config.ts, H3);
     отзыв JWT через tokenVersion + logout (H2); trust-proxy getClientIp (H1);
     SameSite=Strict (M2); cap additionalScores≤100 (M5); демо-админ не на проде (L4).
- ✅ Итерация 11 (мобильный интерфейс): mobile-first адаптив без отдельной версии.
     Header — нижняя панель-таб-бар (4 иконки + «Ещё» с профилем/выходом/«Управление»)
     на <lg, верхняя навигация на ≥lg (граница перенесена md→lg: при 768 десктоп-шапка
     не помещалась). Таблица абитуриентов → карточный режим на <lg (вынесены общие
     Markers/ApplicantDetails; убран горизонтальный скролл страницы). Modal — адаптивные
     отступы, footer переносится. Дашборд — header кнопок переносится, широкие таблицы
     в overflow-x-auto. Проверено Playwright на 375/768/1280: горизонтального скролла
     страницы нет, нав/таблица/карточки переключаются корректно. build + lint чисто.
- ✅ Патч 0.11.1 (фиксы после ревью): CSP в dev получил 'unsafe-eval' (React/Turbopack
     требуют eval для HMR; в проде — без него); убран спейсер h-14 из header (давал зазор
     между header и main) → нижний отступ перенесён в main (pb-24 lg:pb-6), nav больше не
     перекрывает контент; дата+время в карточке абитуриента — в строке кнопок, на уровне
     «История»; кнопка массового удаления в /manage на мобильном — только иконка+счётчик;
     heartbeat локов останавливает интервал при 401 (истёкшая сессия не долбит эндпоинт).

## Остаточный бэклог (не начато)

### ПРИОРИТЕТ 0: Безопасность (остаток аудита §13)
- M1: rate-limit in-memory → Redis при горизонтальном масштабировании.
- M3: ротация ключа шифрования (enc:v2 + dual-key) — связано с болью про ENCRYPTION_KEY.
- M4: ENCRYPTION_KEY в KMS/Vault (сейчас env). L1-L3, L5-L6, nonce-CSP — мелкие.
- B: заменить боевые JWT_SECRET/ENCRYPTION_KEY (на пользователе; задокументировано).

### ПРИОРИТЕТ 1: Инфраструктура БД
1.1 Пересоздать БД с ICU/русской локалью (initdb с ru-RU и ICU-provider)
  - Проблема: текущий кластер C-locale, ILIKE/сортировка не учитывают кириллицу
  - Сейчас обойдено костылём lower(... COLLATE "und-x-icu") в raw SQL
  - После пересоздания: вернуть mode: "insensitive" в Prisma

### ПРИОРИТЕТ 2: Полировка
5.1 ✅ Временные зоны (lib/timezone.ts через Intl, итер.9)
5.2 ✅ Toast вместо alert/confirm (итер.9)
5.3 Retry/переподключение при потере соединения — НЕ начато
5.4 ✅ Тесты unit (vitest, 36 тестов, итер.9); интеграционные — позже

## Технический долг
- ✅ RHF watch()→useWatch (итер.9) — warning устранён, ESLint 0 проблем.
- Апгрейд Prisma 6→7 (требует prisma.config.ts + driver adapter) — не срочно.

## Известные баги
- ✅ ИСПРАВЛЕНО: mathBase / пустые баллы сохранялись как 0 (Zod coerce). Решено z.preprocess(emptyToNull).
- ICU collation: нативный ILIKE не учитывает кириллицу, обойдено COLLATE-костылём (чинить Priority 1)

## Локальная разработка
PostgreSQL 17 portable на :5432
Запуск: pg_ctl -D path/to/data -l logfile start
DATABASE_URL=postgresql://user:pass@localhost:5432/isua

Next.js 16 dev:
npm run dev → http://localhost:3000

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
