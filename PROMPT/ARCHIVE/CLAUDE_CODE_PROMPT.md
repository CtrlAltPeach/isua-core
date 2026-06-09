# ИСУА (isua_core): Промпт для Claude Code

**Информационная система учёта абитуриентов вуза**

---

## Обзор проекта

Вы разрабатываете веб-приложение для управления приёмом абитуриентов в вуз.

**Стек:** Next.js 16 (TypeScript) + Prisma + SQLite/PostgreSQL

**Структура:** Монолитное приложение (frontend + backend в одном repo)

---

## Основные файлы проекта

- **PLAN.md** — общая архитектура, требования, риски, развёртывание
- **BACKEND_PROMPT.md** — спецификация backend (API, БД, логика)
- **FRONTEND_PROMPT.md** — спецификация frontend (UI, компоненты, формы)
- **ANALYSIS.md** — сравнение текущей реализации с планом
- **RESULT/RESULT_v1, RESULT_v2, ...** — результаты итераций генерации кода (создавать после каждой фазы), после итерации промпты перенести в ARCHIVE/

---

## Порядок разработки

### Фаза 1: Инфраструктура (День 1)
**Что делать:**
1. Создать Next.js проект (с TypeScript)
2. Настроить Prisma схему (см. BACKEND_PROMPT.md, раздел 8)
3. Создать `.env` с DATABASE_URL (SQLite для разработки)
4. Запустить `npx prisma migrate dev --name init`
5. Создать API routes для авторизации

**Файлы для создания:**
- `prisma/schema.prisma` — полная схема БД
- `src/lib/types.ts` — TypeScript типы
- `src/app/api/auth/register/route.ts` — регистрация
- `src/app/api/auth/login/route.ts` — вход
- `src/lib/store.ts` — Zustand store

### Фаза 2: Backend основной (День 1-2)
**Что делать:**
1. Создать CRUD endpoints для абитуриентов
2. Реализовать логирование в таблицу `history`
3. Добавить расчёт `total_score`
4. Реализовать автоматическое снятие согласия
5. API для статистики за день

**Файлы для создания:**
- `src/app/api/applicants/route.ts` — GET (список), POST (создание)
- `src/app/api/applicants/[id]/route.ts` — GET, PUT, DELETE
- `src/app/api/stats/daily/route.ts` — статистика
- `src/app/api/ranking/route.ts` — рейтинг по программам
- `src/lib/api.ts` — fetch функции на фронте

### Фаза 3: Frontend основной (День 2-3)
**Что делать:**
1. Создать layout и навигацию (Header + Tabs)
2. Экран авторизации (login/register)
3. Dashboard с метриками
4. Таблица абитуриентов с фильтрацией
5. Модальное окно редактирования

**Файлы для создания:**
- `src/app/page.tsx` — Dashboard
- `src/app/login/page.tsx` — вход
- `src/app/register/page.tsx` — регистрация
- `src/app/applicants/page.tsx` — таблица абитуриентов
- `src/components/dashboard.tsx`
- `src/components/applicant-table.tsx`
- `src/components/applicant-form-modal.tsx`
- `src/components/header.tsx`
- `src/hooks/useAuth.ts`, `useApplicants.ts`, `useStats.ts`

### Фаза 4: Дополнительные вкладки (День 3-4)
**Что делать:**
1. Вкладка "По программам" (карточки)
2. Вкладка "По статусам" (Kanban)
3. Модальное окно истории изменений
4. Экспорт в PDF

**Файлы для создания:**
- `src/app/programs/page.tsx`
- `src/app/statuses/page.tsx`
- `src/components/programs-view.tsx`
- `src/components/statuses-kanban.tsx`
- `src/components/history-modal.tsx`
- `src/app/api/export/pdf/route.ts`

### Фаза 5: Синхронизация и блокировки (День 4-5)
**Что делать:**
1. API для блокировок (`POST /api/locks/{id}`, `DELETE`)
2. Heartbeat механизм (таймаут 30 сек)
3. WebSocket для real-time синхронизации (Socket.io)
4. Показать "Редактирует: Иван" в UI

**Файлы для создания:**
- `src/app/api/locks/[id]/route.ts` — POST (lock), DELETE (unlock)
- `src/app/api/locks/[id]/heartbeat/route.ts` — heartbeat
- `src/lib/websocket.ts` — Socket.io клиент
- `src/hooks/useWebSocket.ts`
- `src/hooks/useLock.ts`

### Фаза 6: Полировка (День 5-6)
**Что делать:**
1. Добавить временные зоны в меню
2. Обработка ошибок и валидация
3. Retry логика при потере соединения
4. Toast уведомления
5. Тестирование

**Файлы для создания:**
- `src/hooks/useTimezone.ts`
- `src/lib/timezone.ts`
- Обновить `src/components/header.tsx` с меню

---

## Ключевые требования (для помощи Claude Code)

### База данных
**Таблица `programs` — 5 программ:**
- ИСД
- ТГСВ
- ЗиК
- ЗиК-КИ
- ЗиК-ГК

**Таблица `applicants` — обязательные поля:**
- `id`, `full_name`, `program_id`, `status`
- Экзамены: `math_base` (оценка 2-5), `math_profile`, `russian`, `chemistry`, `physics`, `informatics`, `geography` (баллы 0-100)
- `total_score` (автоматически, исключить `math_base`)
- `consent_to_enroll` (снимается при `status="withdrawn"`)
- `documents_complete`, `registration_address`, `inn`, `snils`, `notes`

**Таблица `history` — логирование:**
- Формат: `field | new_value | changed_by | changed_at | old_value`

**Таблица `locks` — синхронизация:**
- `applicant_id`, `user_session_id`, `locked_at`, `last_heartbeat`

### API

**Минимальный набор endpoints:**

```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me

GET  /api/applicants (с фильтрами, сортировкой, пагинацией)
POST /api/applicants
GET  /api/applicants/{id}
PUT  /api/applicants/{id}
DELETE /api/applicants/{id}

POST /api/locks/{applicant_id}
POST /api/locks/{applicant_id}/heartbeat
DELETE /api/locks/{applicant_id}

GET  /api/stats/daily
GET  /api/ranking
GET  /api/applicants/{id}/history

GET  /api/export/pdf
GET  /api/programs
```

### Логика

1. **Статусы абитуриента:** `new`, `applied`, `withdrawn`, `accepted`, `rejected`
2. **Согласие на зачисление:**
   - Может быть только если статус = `accepted`
   - Автоматически снимается при `status="withdrawn"`
   - Оператор может вернуть согласие при возврате статуса
3. **Общий балл:** `total_score = sum(баллы) / кол-во` (исключить `math_base`)
4. **История:** логировать все изменения с указанием кто, когда, старое и новое значение
5. **Блокировка:** при открытии записи → lock, при закрытии → unlock, таймаут 30 сек
6. **Статистика за день:** новые заявления выделяются отдельно

### UI

**4 вкладки:**
1. **Dashboard** — метрики за день, графики
2. **Абитуриенты** — таблица с CRUD, фильтры, пагинация
3. **Программы** — карточки с рейтингом
4. **Статусы** — Kanban доска

**Важно:**
- Таблица с 8+ колонками: ФИО, программа, статус, баллы, согласие, документы, телефон, дата
- Форма редактирования: все поля, включая результаты экзаменов (выпадающий список для math_base)
- История изменений: модальное окно с полным логом

---

## Команды для начала

```bash
# Создать проект
npx create-next-app@latest isua_core --typescript --tailwind --eslint

# Перейти в папку
cd isua_core

# Установить зависимости
npm install prisma @prisma/client
npm install zustand socket.io-client
npm install react-hook-form zod
npm install shadcn-ui @radix-ui/react-select

# Инициализировать Prisma
npx prisma init

# Запустить dev сервер
npm run dev
# → http://localhost:3000
```

---

## Вопросы для уточнения

**Перед началом убедитесь:**
1. ✅ Прочитали BACKEND_PROMPT.md (раздел 2, 3, 4 — БД и API)
2. ✅ Прочитали FRONTEND_PROMPT.md (раздел 2, 3 — компоненты и форма)
3. ✅ Понимаете схему Prisma (программы, абитуриенты, история, блокировки)
4. ✅ Знаете порядок разработки (фазы 1-6)
5. ✅ Помните про автоматический расчёт total_score и снятие согласия

---

## Советы для разработки

1. **Начните с Prisma schema** — это фундамент
2. **API endpoints перед компонентами** — тогда UI не зависит от деталей
3. **Zustand store для состояния** — избежите prop drilling
4. **shadcn/ui компоненты** — готовые, доступные, кастомизируемые
5. **Тестируйте каждый endpoint** в Postman/Insomnia перед UI
6. **WebSocket в конце** — это опционально, основной функционал без неё работает
7. **SQLite для разработки** — потом просто измените `provider` в schema.prisma

---

## Файлы с требованиями

**Используйте эти файлы как справку:**

- **BACKEND_PROMPT.md** — для API, БД, логики
- **FRONTEND_PROMPT.md** — для UI, компонентов, форм
- **PLAN.md** — для архитектуры и развёртывания
