# План разработки: ИСУА (isua_core)

**Информационная система учёта абитуриентов**

---

## 1. Требования

### Функциональные
- Хранение данных абитуриентов (макс 1000)
- Добавление, редактирование, удаление записей
- Вкладки с таблицами (общий список, по программам, по статусам)
- Dashboard со статистикой и расчетами
- Фильтрация и сортировка
- Работа с нескольких ПК одновременно
- Экспорт данных (CSV, Excel)

### Нефункциональные
- Пиковая нагрузка: 100 человек/день
- Один разработчик (Claude Code)
- Хостинг на выделенном сервере малой мощности
- Синхронизация в реальном времени

---

## 2. Архитектура

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Браузер 1 │         │   Браузер 2 │         │   Браузер N │
│   (React)   │         │   (React)   │         │   (React)   │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       └───────────────────────┼───────────────────────┘
                               │
                        ┌──────▼──────┐
                        │   Nginx     │
                        │  (reverse   │
                        │   proxy)    │
                        └──────┬──────┘
                               │
                        ┌──────▼──────────┐
                        │   FastAPI       │
                        │   (Gunicorn)    │
                        └──────┬──────────┘
                               │
                        ┌──────▼──────────┐
                        │  PostgreSQL     │
                        │  (на сервере)   │
                        └─────────────────┘
```

---

## 3. Стек технологий

| Слой | Технология |
|------|-----------|
| **Backend** | FastAPI + SQLAlchemy |
| **БД** | PostgreSQL |
| **Frontend** | React + TanStack Table + Tailwind CSS |
| **Прокси** | Nginx |
| **Сервер приложений** | Gunicorn |
| **Контейнеризация** | Docker (опционально) |
| **WebSocket** | FastAPI WebSocket для real-time |

---

## 4. База данных

### Таблица `applicants`

```sql
id (PK)
full_name (string, не nullable)
phone (string)
email (string)
program (string, не nullable)
status (enum: new, review, accepted, rejected)
scores (float)
documents_complete (boolean)
notes (text)
created_at (timestamp)
updated_at (timestamp)
```

### Таблица `programs`

```sql
id (PK)
name (string, unique)
places (int)
```

### Таблица `locks`

```sql
id (PK)
applicant_id (FK to applicants)
user_session_id (string)
locked_at (timestamp)
last_heartbeat (timestamp)
```

---

## 5. API endpoints

### Абитуриенты
- `GET /api/applicants` — список с фильтрами/сортировкой
- `POST /api/applicants` — создание
- `GET /api/applicants/{id}` — получение
- `PUT /api/applicants/{id}` — редактирование
- `DELETE /api/applicants/{id}` — удаление

### Статистика
- `GET /api/stats` — общая статистика
- `GET /api/stats/by-program` — по программам
- `GET /api/stats/by-status` — по статусам

### Экспорт
- `GET /api/export/csv` — экспорт в CSV
- `GET /api/export/excel` — экспорт в Excel

### WebSocket
- `WS /ws` — real-time обновления (подписка на изменения)

---

## 6. Frontend структура

### Маршруты
- `/` — Dashboard
- `/list` — Общий список абитуриентов
- `/programs` — Таблица по программам
- `/statuses` — Таблица по статусам

### Компоненты
- `Dashboard` — главная вкладка (статистика, графики)
- `ApplicantTable` — таблица с данными
- `ApplicantForm` — форма добавления/редактирования
- `ApplicantModal` — модальное окно
- `StatCard` — карточка статистики
- `FilterBar` — фильтры и поиск

### Состояние (React Context)
- `applicants` — список абитуриентов
- `programs` — список программ
- `stats` — статистика
- `loading`, `error` — состояния

---

## 7. Фазы разработки

### Фаза 1: Backend базовая
- FastAPI boilerplate
- PostgreSQL подключение
- SQLAlchemy модели
- CRUD endpoints для абитуриентов
- Валидация данных

### Фаза 2: Frontend базовый
- React setup (Vite)
- Компоненты для списка
- Форма добавления абитуриента
- Модальное окно
- Интеграция с API

### Фаза 3: Расширенные функции
- Фильтрация и сортировка
- Dashboard со статистикой
- Вкладки (программы, статусы)
- WebSocket для real-time

### Фаза 4: Экспорт и полировка
- Экспорт в CSV/Excel
- Оптимизация производительности
- Обработка ошибок

### Фаза 5: Развёртывание
- Docker образ
- Nginx конфигурация
- Systemd сервис
- Миграции БД

---

## 8. Синхронизация между клиентами

### Real-time обновления (WebSocket)
```
Клиент A редактирует → FastAPI → WebSocket broadcast → Клиент B, C, N
```

### Обработка конфликтов
- Версионирование записей (`version` поле в таблице)
- При сохранении проверяем версию
- Если версия не совпадает → ошибка, пересчитываем

### Блокировка записей
- При открытии записи на редактирование → отправляем `lock_applicant`
- При закрытии → `unlock_applicant`
- Если запись заблокирована → показываем `"Редактирует: Иван"`

### Механизм heartbeat и таймаут
- **Проблема**: Если клиент потеряет соединение (закроет вкладку/пропадет интернет), запись останется заблокированной
- **Решение**: 
  - Клиент отправляет heartbeat (пинг) каждые 10 сек для активных блокировок
  - Сервер отслеживает последний heartbeat для каждого лока
  - Если нет сигнала 30 сек → сервер автоматически снимает блокировку
  - При снятии лока — broadcast событие всем клиентам
- **Реализация**: Таблица `locks` с полями `applicant_id`, `user_session_id`, `locked_at`, `last_heartbeat`

---

## 9. Развёртывание

### Рекомендация: Bare-metal вместо Docker
**Риск**: Docker и Docker Compose потребляют часть ресурсов слабого сервера (ОЗУ, CPU).

**Решение**: Для маломощного сервера (1-2 ГБ ОЗУ) — прямой запуск через `systemd` без контейнеризации более эффективен по памяти и производительности.

### Структура сервера (bare-metal)
```
/opt/isua_core/
├── backend/
│   ├── isua_core/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── api/
│   │   └── db/
│   ├── migrations/
│   ├── requirements.txt
│   └── venv/
├── frontend/
│   ├── src/
│   ├── dist/ (собранные файлы)
│   └── package.json
├── systemd/
│   └── isua_core.service
├── nginx/
│   └── isua_core.conf
└── .env
```

### Переменные окружения
```
DATABASE_URL=postgresql://user:pass@localhost/applicants_db
SECRET_KEY=<random_string>
ENVIRONMENT=production
GUNICORN_WORKERS=2
GUNICORN_THREADS=2
```

### Запуск (bare-metal)
```bash
# 1. Установка зависимостей
cd /opt/isua_core/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Миграции БД
alembic upgrade head

# 3. Systemd сервис
sudo systemctl enable isua_core
sudo systemctl start isua_core

# 4. Nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Systemd сервис (`/etc/systemd/system/isua_core.service`)
```ini
[Unit]
Description=ISUA Core Application
After=network.target postgresql.service

[Service]
Type=notify
User=isua
WorkingDirectory=/opt/isua_core/backend
Environment="PATH=/opt/isua_core/backend/venv/bin"
ExecStart=/opt/isua_core/backend/venv/bin/gunicorn \
  --workers 2 --threads 2 --bind 127.0.0.1:8000 \
  isua_core.main:app

Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Nginx конфиг
```nginx
upstream isua_backend {
    server 127.0.0.1:8000;
}

server {
    listen 80;
    server_name _;
    client_max_body_size 10M;

    location / {
        root /opt/isua_core/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://isua_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /ws {
        proxy_pass http://isua_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## 10. Тестирование

### Unit тесты
- Backend: pytest
- Frontend: Vitest

### Интеграционные тесты
- Создание/редактирование абитуриента
- Синхронизация между клиентами
- Экспорт данных

### Нагрузочное тестирование
- 100 одновременных запросов
- 1000 записей в таблице

### Оптимизация фильтрации и сортировки
- Все фильтры и сортировка должны выполняться на уровне БД (SQLAlchemy query)
- **Никогда не выгружать** весь список в память для фильтрации на бэкенде или фронтенде
- Использовать пагинацию: `LIMIT 50 OFFSET <offset>`
- Фронтенд запрашивает порции по 50-100 записей при прокрутке

### Управление памятью при экспорте
- Экспорт в Excel (openpyxl) может потребить много ОЗУ на слабом сервере
- **Решение**:
  - Для больших выборок генерировать CSV (облегчённый формат)
  - Для Excel ограничивать выборку максимум 500 записей
  - Использовать streaming для больших файлов (если возможно)
  - Добавить предупреждение в UI: "Экспорт более 500 записей может быть медленным"

---

## 11. Документация

- README с инструкциями развёртывания
- API документация (Swagger в FastAPI)
- Инструкция пользователя

---

## 12. Риски и mitigation

| Риск | Mitigation |
|------|-----------|
| «Зависший замок» при потере соединения | Heartbeat + таймаут 30 сек для автоснятия блокировки |
| Перегрузка памяти на слабом сервере | Bare-metal вместо Docker, пагинация при фильтрации |
| Медленные запросы с фильтрацией | Использовать SQL-уровень (SQLAlchemy), индексы на БД |
| Потребление ОЗУ при экспорте Excel | Ограничить выборку 500 записей, предложить CSV для больших объёмов |
| Потеря данных | Регулярные бэкапы PostgreSQL (ежедневно) |
| Отсутствие heartbeat на клиенте | Закрытие WebSocket → автоматическое снятие всех локов пользователя |

