# Backend промпт: ИСУА (isua_core)

**Информационная система учёта абитуриентов**

---

## 1. Требования

### Функциональные
- Хранение данных абитуриентов (макс 1000)
- CRUD операции (добавление, редактирование, удаление записей)
- Фильтрация, сортировка, пагинация
- Работа с нескольких ПК одновременно (синхронизация)
- Система авторизации (пользователи регистрируются сами)
- Статистика за день (кол-во новых заявлений, статусы, согласия, документы, баллы)
- Генерация PDF отчёта с статистикой и рейтингом по программам
- История изменений (логирование всех изменений)
- Экспорт в PDF

### Нефункциональные
- Пиковая нагрузка: 100 человек/день
- Хостинг на выделенном сервере малой мощности (1-2 ГБ ОЗУ)
- Bare-metal развёртывание (без Docker)
- Временная зона: МСК по умолчанию, выбирается в меню

---

## 2. База данных

### Таблица `programs` (5 программ)
```
id (PK)
name (string, unique): ИСД, ТГСВ, ЗиК, ЗиК-КИ, ЗиК-ГК
places (int) — количество бюджетных мест
created_at (timestamp)
```

### Таблица `users` (авторизация)
```
id (PK)
email (string, unique)
password_hash (string) — bcrypt хеширование
username (string)
created_at (timestamp)
last_login (timestamp)
```

### Таблица `applicants`
```
id (PK)
full_name (string, NOT NULL)
phone (string, nullable)
email (string, nullable)
program_id (FK to programs, NOT NULL)
status (enum: new, applied, withdrawn, accepted, rejected)
consent_to_enroll (boolean, default: false)
documents_complete (boolean, default: false)

— Результаты экзаменов —
math_base (int 2-5) — оценка, исключается из рейтинга
math_profile (float 0-100, nullable)
russian (float 0-100, nullable)
chemistry (float 0-100, nullable)
physics (float 0-100, nullable)
informatics (float 0-100, nullable)
geography (float 0-100, nullable)
total_score (float) — автоматически считается (сумма/кол-во, без math_base)

— Персональные данные —
registration_address (string) — прописка
inn (string) — ИНН
snils (string) — СНИЛС
notes (text, nullable)

— Служебные —
created_at (timestamp)
updated_at (timestamp)
created_by_user_id (FK to users)
```

### Таблица `history` (лог изменений)
```
id (PK)
applicant_id (FK to applicants)
field_name (string) — какое поле изменилось
old_value (string, nullable)
new_value (string)
changed_by_user_id (FK to users)
changed_at (timestamp)
```

### Таблица `locks` (синхронизация, real-time)
```
id (PK)
applicant_id (FK to applicants, unique)
user_session_id (string)
locked_at (timestamp)
last_heartbeat (timestamp)
```

---

## 3. Логика приложения

### Статусы и переходы
- **new** → **applied** → **accepted** или **rejected**
- **applied** → **withdrawn**
- Любой статус → любой (оператор может изменить)
- Переход new → applied создаёт событие для статистики (новое заявление)

### Согласие на зачисление
- Поле `consent_to_enroll` (bool)
- Может быть поставлено только если статус = **accepted**
- При переходе статуса на **withdrawn** — согласие автоматически **false**
- При возврате статуса обратно на **accepted** — оператор может вернуть согласие
- История изменения согласия логируется

### Общий балл
- **total_score = (sum(баллы предметов) / кол-во выбранных предметов)**
- **Исключить:** math_base (только логируется, в рейтинг не входит)
- **Считать:** math_profile, russian, chemistry, physics, informatics, geography (если заполнены)
- **Пересчитывается автоматически** при каждом изменении баллов
- Если баллы не заполнены → total_score = null

### История изменений
**Формат логирования:** `field | new_value | who (user) | when (timestamp) | old_value`

**Логировать все изменения:**
- ФИО, телефон, email, программа, статус
- Баллы (все 7 экзаменов)
- Прописка, ИНН, СНИЛС
- Документы, согласие на зачисление
- Заметки

**Не логировать:**
- Служебные поля (created_at, updated_at)
- Поле total_score (авто считается)

### Синхронизация (WebSocket + heartbeat)
- При открытии записи на редактирование: `lock_applicant`
- При закрытии: `unlock_applicant`
- Heartbeat каждые 10 сек (клиент)
- Таймаут блокировки: 30 сек без heartbeat
- При снятии лока → broadcast всем клиентам
- При потере соединения → автоматическое снятие всех локов пользователя

---

## 4. API Endpoints

### Авторизация
```
POST /api/auth/register
  body: { email, password, username }
  response: { user_id, email, username, token }

POST /api/auth/login
  body: { email, password }
  response: { user_id, email, username, token }

POST /api/auth/logout
  headers: { Authorization: Bearer <token> }
  response: { success }

GET /api/auth/me
  headers: { Authorization: Bearer <token> }
  response: { user_id, email, username }
```

### Абитуриенты (CRUD)
```
GET /api/applicants
  query: {
    program_id: (optional),
    status: (optional),
    search: (optional, по ФИО/email/phone),
    sort_by: (default: created_at),
    order: (asc/desc),
    page: 1,
    limit: 50
  }
  response: { items: [...], total, page, limit }

POST /api/applicants
  body: { full_name, program_id, phone, email, ... }
  response: { id, ... full data }

GET /api/applicants/{id}
  response: { full applicant data + history }

PUT /api/applicants/{id}
  body: { ... changed fields, version }
  response: { updated applicant }
  — Оптимистичная блокировка: если version не совпадает → 409 Conflict

DELETE /api/applicants/{id}
  response: { success }
```

### Блокировки (WebSocket + REST)
```
POST /api/locks/{applicant_id}
  body: { user_session_id }
  response: { locked: true, locked_by_user: "user@email.com" }

POST /api/locks/{applicant_id}/heartbeat
  body: { user_session_id }
  response: { success }

DELETE /api/locks/{applicant_id}
  response: { unlocked: true }

WS /ws
  — WebSocket канал для broadcast событий
  — Сообщения: { type: 'lock', 'unlock', 'update' }
```

### Статистика за день
```
GET /api/stats/daily
  query: { date: YYYY-MM-DD (default: today), timezone: "Europe/Moscow" }
  response: {
    total_applicants: int,
    new_applications: int,
    applied: int,
    withdrawn: int,
    accepted: int,
    rejected: int,
    with_consent: int,
    with_documents: int,
    top_scores: [{ program, avg_score }],
    by_program: [
      {
        program: "ИСД",
        places: 50,
        applicants: 120,
        competition: 2.4,
        avg_score: 75.5,
        with_consent: 40,
        with_documents: 35
      }
    ]
  }
```

### Рейтинг по программам
```
GET /api/ranking
  query: { program_id: (optional), sort_by: total_score (default), order: desc }
  response: [
    {
      rank: 1,
      full_name: "...",
      program: "ИСД",
      total_score: 85.5,
      status: "accepted",
      consent_to_enroll: true,
      documents_complete: true
    }
  ]
```

### История изменений
```
GET /api/applicants/{id}/history
  query: { limit: 50, offset: 0 }
  response: [
    {
      field_name: "status",
      old_value: "new",
      new_value: "applied",
      changed_by: { user_id, username },
      changed_at: "2026-06-09T15:30:00Z"
    }
  ]
```

### Экспорт PDF
```
GET /api/export/pdf
  query: {
    type: "daily_report" | "ranking" | "all_applicants",
    program_id: (optional),
    date: (optional, for daily_report),
    timezone: "Europe/Moscow"
  }
  response: [PDF binary]
```

### Программы
```
GET /api/programs
  response: [{ id, name, places, applicant_count, competition }]

POST /api/programs
  body: { name, places }
  response: { id, name, places }
```

### Конфигурация
```
GET /api/config
  response: { timezones: ["Europe/Moscow", "Asia/Yekaterinburg", ...] }
```

---

## 5. Технологический стек

| Слой | Технология |
|------|-----------|
| **Фреймворк** | Next.js 16 (API Routes) |
| **Язык** | TypeScript |
| **ORM** | Prisma |
| **БД** | SQLite (разработка) → PostgreSQL (продакшн) |
| **Авторизация** | JWT + bcrypt |
| **WebSocket** | Socket.io на Next.js |
| **PDF генерация** | PDFKit или ReportLab (Python service) |
| **Валидация** | Zod |
| **Логирование** | winston или pino |

---

## 6. PDF Отчёт (структура)

### Формат: Daily Report (дата в названии)
```
Отчёт о статистике приёма абитуриентов
Дата: 09.06.2026
Временная зона: Europe/Moscow

====== ОБЩИЕ СТАТИСТИКИ ======
Всего абитуриентов в системе: 450
Новых заявлений сегодня: 12 ⭐ (выделить)
Статус "Подал заявление": 380
Статус "Забрал заявление": 15
Статус "Зачислен": 40
Статус "Отклонен": 25

Согласия на зачисление: 38 (из 40 принятых)
Документы собраны: 350 (из 450, 77.8%)

====== ПО ПРОГРАММАМ ======
Программа | Мест | Абитур. | Конкурс | Сред. балл | Согласия | Документы
ИСД       | 100  | 180     | 1.8    | 78.5      | 30       | 160
ТГСВ      | 80   | 140     | 1.75   | 76.2      | 20       | 130
ЗиК       | 50   | 70      | 1.4    | 72.1      | 15       | 65
ЗиК-КИ    | 30   | 40      | 1.33   | 74.3      | 10       | 38
ЗиК-ГК    | 20   | 20      | 1.0    | 79.1      | 5        | 19

====== РЕЙТИНГ ПО ПРОГРАММАМ ======

Программа: ИСД (топ-10)
Место | ФИО              | Баллы | Статус    | Согласие | Документы
1     | Иванов Иван      | 95.0  | Зачислен  | ✓        | ✓
2     | Петров Петр      | 93.5  | Зачислен  | ✓        | ✓
...
10    | Сидоров Сидор    | 81.2  | На проверке | -    | ✓

[Аналогично для остальных программ]
```

---

## 7. Middleware и безопасность

### Аутентификация
- JWT токены (HS256)
- Токен в хедере: `Authorization: Bearer <token>`
- TTL токена: 24 часа
- Refresh token опционально

### Авторизация
- Все пользователи равноправны
- Пользователь может видеть только свою историю действий в логе

### Хеширование паролей
- bcrypt с солью (rounds: 10+)
- Пароль не должен передаваться в ответах API

### Лог операций
- Все изменения абитуриентов логируются в таблицу `history`
- user_id в логе для отслеживания кто что изменил

---

## 8. Пример Prisma Schema (фрагмент)

```prisma
datasource db {
  provider = "sqlite"  // или "postgresql" для продакшна
  url      = env("DATABASE_URL")
}

model Program {
  id          Int       @id @default(autoincrement())
  name        String    @unique
  places      Int
  applicants  Applicant[]
  createdAt   DateTime  @default(now())
}

model User {
  id        Int       @id @default(autoincrement())
  email     String    @unique
  passwordHash String
  username  String    @unique
  applicants Applicant[] @relation("CreatedBy")
  histories History[] @relation("ChangedBy")
  locks     Lock[]
  createdAt DateTime  @default(now())
  lastLogin DateTime?
}

model Applicant {
  id              Int       @id @default(autoincrement())
  fullName        String
  phone           String?
  email           String?
  programId       Int
  program         Program   @relation(fields: [programId], references: [id])
  status          String    @default("new") // new, applied, withdrawn, accepted, rejected
  consentToEnroll Boolean   @default(false)
  documentsComplete Boolean @default(false)
  
  // Экзамены
  mathBase        Int?      // оценка 2-5
  mathProfile     Float?    // баллы 0-100
  russian         Float?
  chemistry       Float?
  physics         Float?
  informatics     Float?
  geography       Float?
  totalScore      Float?    // считается автоматически
  
  // Персональные данные
  registrationAddress String?
  inn             String?
  snils           String?
  notes           String?
  
  // Служебные
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  createdByUserId Int
  createdBy       User      @relation("CreatedBy", fields: [createdByUserId], references: [id])
  
  history         History[]
  lock            Lock?
}

model History {
  id              Int       @id @default(autoincrement())
  applicantId     Int
  applicant       Applicant @relation(fields: [applicantId], references: [id], onDelete: Cascade)
  fieldName       String
  oldValue        String?
  newValue        String
  changedByUserId Int
  changedBy       User      @relation("ChangedBy", fields: [changedByUserId], references: [id])
  changedAt       DateTime  @default(now())
}

model Lock {
  id              Int       @id @default(autoincrement())
  applicantId     Int       @unique
  applicant       Applicant @relation(fields: [applicantId], references: [id], onDelete: Cascade)
  userSessionId   String
  lockedAt        DateTime  @default(now())
  lastHeartbeat   DateTime  @default(now())
}
```

---

## 9. Основные функции для реализации

### calculateTotalScore()
```typescript
function calculateTotalScore(applicant: Applicant): number | null {
  const scores = [
    applicant.mathProfile,
    applicant.russian,
    applicant.chemistry,
    applicant.physics,
    applicant.informatics,
    applicant.geography
  ].filter(s => s !== null && s !== undefined);
  
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b) / scores.length;
}
```

### handleStatusChange()
```typescript
// При изменении статуса:
// 1. Логировать в history
// 2. Если статус → "withdrawn": consentToEnroll = false
// 3. Если статус → "applied": это событие новой заявки (для статистики)
// 4. Trigger WebSocket broadcast
```

### generatePDFReport()
```typescript
// Получить статистику за день
// Сгенерировать PDF с таблицами и рейтингом
// Вернуть binary PDF
```

---

## 10. Конфигурация окружения

```env
# .env.local
DATABASE_URL=file:./dev.db              # SQLite для разработки
# DATABASE_URL=postgresql://user:pass@localhost/isua  # PostgreSQL для продакшна

JWT_SECRET=<random_long_string>
JWT_EXPIRY=24h

# WebSocket
WS_URL=http://localhost:3000
WS_SECRET=<random_string>

# PDF генерация (если используется external service)
PDF_SERVICE_URL=http://localhost:5000

# Логирование
LOG_LEVEL=info
```

---

## 11. Тестирование

### Unit тесты
- calculateTotalScore()
- handleStatusChange()
- History логирование
- Lock/unlock механика

### Интеграционные тесты
- CRUD операции с applicants
- Авторизация и JWT
- WebSocket sync между клиентами
- PDF генерация

### Нагрузочное тестирование
- 1000 абитуриентов в БД
- 100 одновременных запросов
- Пагинация (limit 50) на таблицах

---

## 12. Развёртывание (Bare-metal)

```bash
# На сервер:
1. PostgreSQL установка
2. Node.js 18+
3. git clone <repo>
4. npm install
5. npx prisma migrate deploy
6. npm run build
7. Systemd сервис или PM2 для Next.js
8. Nginx проксирование на localhost:3000
```

**Systemd сервис:**
```ini
[Unit]
Description=ISUA Core
After=network.target postgresql.service

[Service]
Type=simple
User=isua
WorkingDirectory=/opt/isua_core
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /opt/isua_core/.next/standalone/server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

---

## Итого

**Основной фокус backend:**
1. Авторизация (JWT + bcrypt)
2. CRUD с логированием в history
3. Синхронизация (WebSocket)
4. Автоматический расчёт total_score
5. Автоматическое снятие согласия при смене статуса
6. PDF отчёт за день
7. Оптимистичная блокировка версионированием
8. История всех изменений
