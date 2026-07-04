# Деплой ИСУА на VPS из GitHub

Пошаговая инструкция развёртывания боевого экземпляра ИСУА на собственном VPS
(Ubuntu 22.04+/Debian 12) из репозитория GitHub. Стек: Next.js 16 (Node.js) +
PostgreSQL 17+/18 + Prisma, фронтенд через nginx с TLS.

> Справочно: проект НЕ использует `output: "standalone"`, поэтому сборка и запуск
> (`npm run build` → `npm start`) выполняются прямо на сервере. Порт приложения —
> `3000`, nginx терминирует HTTPS и проксирует на `127.0.0.1:3000`.

---

## 0. Требования

- **VPS:** 2 vCPU / 2 ГБ RAM / 20 ГБ диск (минимум для приёмной комиссии одного вуза).
- **ОС:** Ubuntu 22.04+ или Debian 12.
- **Домен:** запись `A`指向 IP сервера (напр. `isua.example.ru → 203.0.113.10`).
- **Доступ:** root/sudo-пользователь по SSH; репозиторий на GitHub (публичный или
  доступ по deploy key/токену для приватного).
- **Локально:** клиент `psql`/`pg_dump` версии ≥ серверной (для бэкапов/манипуляций).

Проверка портов — должны быть свободны до старта:

```bash
sudo ss -tlnp | grep -E ':(80|443|3000|5432)\b'
```

---

## 1. Установка системного ПО

Обновляем пакеты и ставим Node.js 20, PostgreSQL, nginx, git, certbot.

```bash
sudo apt update && sudo apt -y upgrade

# Node.js 20 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
node -v   # должно быть v20.x

# PostgreSQL 17 (официальный репозиторий)
sudo sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
sudo apt update
sudo apt -y install postgresql-17 postgresql-client-17
sudo systemctl enable --now postgresql

# nginx, git, certbot + плагин nginx
sudo apt -y install nginx git certbot python3-certbot-nginx
```

---

## 2. Создание базы данных с ICU-локалью `ru-RU` (критично)

> ⚠️ Без ICU-локали регистронезависимый поиск по кириллице (`ILIKE`,
> Prisma `mode:"insensitive"`) **не работает**: «ПЕТРОВ» не найдётся по «петр».
> Локаль — свойство БАЗЫ, миграции Prisma её не задают. Подробности —
> `DATABASE_ENVIRONMENTS.md`, раздел «Локаль БД».

```bash
sudo -u postgres psql
```

В консоли `psql` (замените пароль `CHANGE_ME_STRONG` на свой):

```sql
CREATE ROLE isua LOGIN PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE isua
  OWNER isua
  TEMPLATE template0
  ENCODING 'UTF8'
  LOCALE_PROVIDER icu
  ICU_LOCALE 'ru-RU'
  LOCALE 'C';
\q
```

Проверка (provider должен быть `i`, тест — `true`):

```bash
sudo -u postgres psql -d isua -c "SELECT datname, datlocprovider, datlocale FROM pg_database WHERE datname='isua';"
sudo -u postgres psql -d isua -c "SELECT 'ПЕТРОВ' ILIKE '%петр%' AS ok;"
```

---

## 3. Создание системного пользователя и клонирование репозитория

Приложение работает от непривилегированного пользователя `isua`.

```bash
sudo useradd -m -s /bin/bash isua
sudo -u isua -i        # дальше работаем от имени isua
```

```bash
cd ~
git clone <URL_РЕПОЗИТОРИЯ> isua-core
cd isua-core
git checkout main      # боевая ветка
```

Для **приватного** репозитория: настройте deploy key или используйте HTTPS с
fine-grained PAT (токен в URL: `https://<token>@github.com/org/repo.git`).

---

## 4. Переменные окружения (`.env`)

На VPS файл `.env` **читается** приложением (в отличие от Vercel). Генерируем
секреты и записываем.

Генерация (выполнить однажды, сохранить значения вне сервера — в менеджере паролей):

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

Создать `~/isua-core/.env` (вставить свои значения, БЕЗ кавычек вокруг значения
не обязательно, но кавычки допустимы):

```dotenv
# БД (пароль из шага 2)
DATABASE_URL="postgresql://isua:CHANGE_ME_STRONG@127.0.0.1:5432/isua?schema=public"

# JWT
JWT_SECRET="<64-символьный hex из генерации>"
JWT_EXPIRY="24h"

# Шифрование ПДн (AES-256-GCM). Хранить как пароль от БД. Бэкапить ОТДЕЛЬНО.
ENCRYPTION_KEY="<64-символьный hex из генерации>"

# За nginx — доверять X-Forwarded-For (иначе rate-limit по IP работать не будет)
TRUST_PROXY="1"

# Сидинг на проде ВЫКЛЮЧЕН (боевые данные заводятся вручную)
# SEED_DATA="1"
# SEED_ADMIN_PASSWORD="..."

LOG_LEVEL="info"
```

Зафиксировать права (читать только владельцу — там секреты):

```bash
chmod 600 .env
```

> ⚠️ `ENCRYPTION_KEY` — это ключ к зашифрованным ПДн (паспорт/ИНН/СНИЛС). Потеря
> ключа = необратимая потеря данных. Сохраните его в надёжном месте ОТДЕЛЬНО от
> сервера. Ротация — через `ENCRYPTION_KEY_OLD` + `npm run crypto:rotate`
> (runbook: `../SECURITY.md`).

---

## 5. Установка зависимостей и сборка

```bash
cd ~/isua-core
npm ci              # строго по package-lock.json
npm run build       # = prisma generate && next build
```

Сборка пишет артефакты в `.next/`. Успешное завершение = можно запускать.

Проверка запуска вручную (Ctrl+C чтобы остановить):

```bash
npm start           # http://<IP-сервера>:3000  (пока только локально)
```

---

## 6. Миграции БД

Миграции накатываются вручную (в проде — **до** рестарта приложения, чтобы код не
обратился к ещё не существующей колонке):

```bash
cd ~/isua-core
npx prisma migrate deploy
npx prisma generate     # синхронизирует клиент со схемой
```

`migrate deploy` применяет только недостающие миграции, данные не удаляет.

> Первый пользователь, зарегистрировавшийся на пустой БД через `/register`,
> автоматически становится администратором (bootstrap). Дальше пользователей
> создаёт только админ (раздел «Управление»).

---

## 7. Systemd-сервис (автозапуск и перезапуск)

Выйти из оболочки `isua` обратно к sudo-пользователю:

```bash
exit
```

Создать unit-файл `/etc/systemd/system/isua.service`:

```ini
[Unit]
Description=ISUA Next.js app
After=network.target postgresql.service

[Service]
Type=simple
User=isua
WorkingDirectory=/home/isua/isua-core
EnvironmentFile=/home/isua/isua-core/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
# Лимиты (Next.js любит память)
MemoryMax=1.5G
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Включить и запустить:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now isua
sudo systemctl status isua        # active (running)
sudo journalctl -u isua -f        # логи в реальном времени (Ctrl+C выход)
```

Проверка локально на сервере:

```bash
curl -I http://127.0.0.1:3000     # 200/302 — приложение отвечает
```

---

## 8. Nginx (reverse-proxy + HTTPS)

Создать `/etc/nginx/sites-available/isua` (замените `isua.example.ru` на домен):

```nginx
server {
    listen 80;
    server_name isua.example.ru;

    # ACME-challenge для certbot (ставится им автоматически)
    location /.well-known/acme-challenge/ { root /var/www/html; }

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
    }

    client_max_body_size 20m;
}
```

Включить сайт и проверить конфиг:

```bash
sudo ln -s /etc/nginx/sites-available/isua /etc/nginx/sites-enabled/isua
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Получить TLS-сертификат (домен уже должен смотреть на сервер по HTTP):

```bash
sudo certbot --nginx -d isua.example.ru --redirect --agree-tos -m admin@example.ru --no-eff-email
```

Certbot поставит сертификат, допишет HTTPS-блок и включит редирект 80→443.
Проверка: открыть `https://isua.example.ru` — должна открыться страница логина ИСУА.

> Security-заголовки (CSP, HSTS, X-Frame-Options и др.) проставляет само
> приложение (`next.config.ts`, `headers()`). Дублировать их в nginx не нужно.

---

## 9. Файрвол

Открыть только нужное; БД слушать только на localhost (по умолчанию так и есть):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status verbose
```

PostgreSQL не должен быть виден извне — проверить:

```bash
sudo ss -tlnp | grep 5432   # должен слушать только 127.0.0.1:5432
```

---

## 10. Бэкапы

**Перед любым изменением прода** (миграция, обновление кода) — делать дамп.

```bash
# разовый дамп (custom format, сжатый)
sudo -u postgres pg_dump -d isua -Fc -f /var/backups/isua/isua_$(date +%Y%m%d_%H%M%S).dump
```

Регулярные бэкапы — cron от `postgres` (`sudo -u postgres crontab -e`), напр.
ежедневно в 03:00 с хранением 14 дней:

```cron
0 3 * * * pg_dump -d isua -Fc -f /var/backups/isua/isua_$(date +\%Y\%m\%d).dump && find /var/backups/isua -name '*.dump' -mtime +14 -delete
```

Восстановление в пустую БД:

```bash
sudo -u postgres pg_restore --no-owner -d isua /var/backups/isua/isua_ГГГГММДД.dump
```

> Дамп содержит **зашифрованные** ПДн (`enc:v1:…`). Для расшифровки при
> восстановлении на другой сервер нужен тот же `ENCRYPTION_KEY`. Дамп —
> чувствительный файл: каталог бэкапов вне репозитория, права `chmod 700`.

Каталог бэкапов:

```bash
sudo mkdir -p /var/backups/isua && sudo chown postgres:postgres /var/backups/isua && sudo chmod 700 /var/backups/isua
```

---

## 11. Обновление (новый коммит из GitHub)

Шаблон деплоя новой версии. ~2–5 минут при небольших изменениях.

1. Бэкап БД (раздел 10).
2. Забрать код и пересобрать:
   ```bash
   sudo -u isua -i
   cd ~/isua-core
   git pull --ff-only
   npm ci
   npm run build
   ```
3. Накатить миграции (если есть новые):
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```
4. Перезапустить сервис:
   ```bash
   exit                       # обратно к sudo-пользователю
   sudo systemctl restart isua
   sudo journalctl -u isua -n 50
   ```
5. Проверить: `curl -I https://isua.example.ru` → 200/302.

> Порядок при миграции схемы: **сначала БД, потом рестарт приложения** — иначе код
> может обратиться к несуществующей колонке.

---

## 12. Если что-то сломалось

- **`npm run build` падает** → `sudo journalctl -u isua -n 200`; типичные причины:
  нехватка RAM (поднимите `MemoryMax`/swap), несовместимая версия Node (`node -v`
  должно быть 20+), рассинхрон `schema.prisma` и миграций.
- **502 Bad Gateway от nginx** → приложение не отвечает на `:3000`:
  `sudo systemctl status isua`; `curl -I http://127.0.0.1:3000`.
- **Поиск по кириллице не регистронезависимый** → БД создана не с ICU-локалью.
  Проверка — раздел 2. Пересоздание БД с ICU — `DATABASE_ENVIRONMENTS.md`.
- **Rate-limit не работает / все запросы с одного IP** → не задан `TRUST_PROXY=1`
  (приложение не видит реальный IP за nginx).
- **Не могу войти после рестарта** → изменился `JWT_SECRET` (все токены
  инвалидированы) ИЛИ упал `TRUST_PROXY`/cookie SameSite за неправильной схемой.

---

## 13. Чек-лист первого деплоя

- [ ] Node.js 20+, PostgreSQL 17+, nginx, certbot установлены
- [ ] БД `isua` создана с `LOCALE_PROVIDER icu ICU_LOCALE 'ru-RU'`
- [ ] Репозиторий склонирован, ветка `main`
- [ ] `.env` заполнен (свои `JWT_SECRET`, `ENCRYPTION_KEY`, `TRUST_PROXY=1`), `chmod 600`
- [ ] `npm ci` + `npm run build` прошли без ошибок
- [ ] `npx prisma migrate deploy` выполнен
- [ ] systemd-сервис `isua` активен, `curl http://127.0.0.1:3000` отвечает
- [ ] nginx проксирует, certbot выдал сертификат, `https://<домен>` открывается
- [ ] UFW включён, PostgreSQL слушает только `127.0.0.1`
- [ ] Cron-бэкап БД настроен, `ENCRYPTION_KEY` сохранён в менеджере паролей
- [ ] Создан первый admin через `/register`
