# Онлайн-витрина магазина одежды + Telegram бот

Универсальная связка: сайт-витрина с фильтрами, Telegram-бот для работников магазина и автопостинг в Telegram-канал. Один кодовый репозиторий — несколько магазинов с разными `.env` и `config.json`.

## Стек

- **Next.js** (App Router, TypeScript) — сайт + API + webhook бота
- **Supabase** — PostgreSQL + Storage для фото
- **Prisma** — ORM
- **grammY** — Telegram бот
- **Vercel** — хостинг

---

## Установка и запуск

```bash
# 1. Клонировать репозиторий
git clone <repo-url>
cd <repo-folder>

# 2. Установить зависимости
npm install

# 3. Скопировать и заполнить переменные окружения
cp .env.example .env
# Открыть .env и вставить реальные значения (см. ниже)

# 4. Сгенерировать Prisma client
npx prisma generate

# 5. Запустить в режиме разработки
npm run dev
```

Сайт откроется на [http://localhost:3000](http://localhost:3000).

---

## Переменные окружения (`.env`)

| Переменная | Откуда взять |
|---|---|
| `BOT_TOKEN` | Создать бота у [@BotFather](https://t.me/BotFather), скопировать токен |
| `OWNER_TELEGRAM_ID` | Получить у [@userinfobot](https://t.me/userinfobot) |
| `CHANNEL_ID` | Username канала без `@` (бот должен быть admin) |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (Transaction mode, порт 6543) |
| `DIRECT_URL` | Supabase → Settings → Database → Connection string (Direct, порт 5432) |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role` key |
| `SUPABASE_BUCKET` | Название bucket для фото — создать вручную в Supabase Storage |
| `NEXT_PUBLIC_SITE_URL` | URL деплоя (локально: `http://localhost:3000`) |

---

## Настройки магазина (`config.json`)

Несекретные настройки конкретного магазина. Меняются при деплое нового магазина.

| Поле | Значение |
|---|---|
| `storeName` | Название магазина (отображается на сайте) |
| `sellerUsername` | Telegram username продавца без `@` |
| `channelUsername` | Username канала без `@` |
| `currency` | Символ валюты (по умолчанию `₽`) |

---

## Этапы разработки

- [x] **Этап 0** — инициализация проекта, структура папок, конфиги
