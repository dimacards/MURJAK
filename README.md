# Онлайн-витрина магазина одежды + Telegram бот

Универсальная связка: сайт-витрина с фильтрами, Telegram-бот для работников
магазина и автопостинг в Telegram-канал. **Один кодовый репозиторий — несколько
магазинов** с разными `.env` и `config.json`.

## Стек

- **Next.js 16** (App Router, TypeScript) — сайт + API + webhook бота
- **Supabase** — PostgreSQL + Storage для фото
- **Prisma 7** (с `@prisma/adapter-pg`) — ORM
- **grammY** + `@grammyjs/conversations` — Telegram бот
- **Vercel** — хостинг

---

## Установка и запуск

```bash
git clone <repo-url>
cd <repo-folder>
npm install                       # postinstall запустит prisma generate

cp .env.example .env              # заполни значениями (см. ниже)

npx prisma migrate deploy         # применить миграции в БД
npx tsx scripts/seed.ts           # (опц.) seed: категория «футболка» + владелец

npm run dev                       # http://localhost:3000
```

После деплоя на Vercel — установить webhook бота:

```bash
npx tsx scripts/set-webhook.ts    # читает NEXT_PUBLIC_SITE_URL из .env
```

---

## Переменные окружения (`.env`)

Секретное, **никогда не коммитим**.

| Переменная | Откуда взять |
|---|---|
| `BOT_TOKEN` | Создать бота у [@BotFather](https://t.me/BotFather), скопировать токен |
| `OWNER_TELEGRAM_ID` | Получить у [@userinfobot](https://t.me/userinfobot) |
| `CHANNEL_ID` | Username канала без `@` или числовой chat_id (бот должен быть admin с правом постинга/редактирования/удаления) |
| `SERVICE_CHAT_ID` | ID супергруппы работников (бот — admin), куда уходят копии товаров с кнопками управления |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string → **Session mode** (порт 5432). Не Transaction pooler 6543 — adapter-pg не дружит с ним |
| `DIRECT_URL` | Та же строка, что DATABASE_URL (нужна Prisma 7 для миграций отдельно) |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API Keys → **secret** key (`sb_secret_...`), НЕ publishable |
| `SUPABASE_BUCKET` | Имя публичного бакета для фото (создать вручную в Supabase Storage) |
| `NEXT_PUBLIC_SITE_URL` | Публичный URL деплоя (`https://your-shop.vercel.app`). Используется для webhook и server-side fetch |

---

## Настройки магазина (`config.json`)

Несекретное, коммитится в репозиторий.

| Поле | Значение |
|---|---|
| `storeName` | Название магазина (заголовок сайта, метаданные) |
| `sellerUsername` | Telegram username продавца без `@`. Используется в кнопке «Купить в Telegram» на странице товара |
| `channelUsername` | Username канала без `@`. Используется в футере сайта (ссылка) и в сообщении бота после публикации товара |
| `currency` | Символ валюты — отображается в подписях постов и на сайте (по умолчанию `₽`) |

---

## База данных

- Схема — `prisma/schema.prisma` (модели: `Worker`, `Category`, `Product`, `Photo`, `BotSession`)
- Конфиг Prisma — `prisma.config.ts` (Prisma 7+ требует TS-конфиг вместо `package.json#prisma`)
- Клиент — `lib/db.ts`: синглтон `PrismaClient` с `@prisma/adapter-pg`,
  TCP keepAlive (чтобы Supabase pooler не закрывал idle коннект),
  retry-обёртка на P1017 ConnectionClosed.

### Полезные команды

```bash
npx prisma migrate dev --name <name>   # создать миграцию (в dev)
npx prisma migrate deploy              # применить в проде
npx prisma generate                    # перегенерить клиент
npx prisma studio                      # GUI на http://localhost:5555
npx tsx scripts/seed.ts                # seed тестовых данных
```

---

## Telegram-бот

Бот живёт внутри Next.js — webhook от Telegram приходит на `POST /api/bot`.

### Архитектура

```
lib/bot/
├── index.ts                — инициализация Bot, регистрация middleware и команд
├── types.ts                — AppContext (worker + conversations flavor)
├── middleware.ts           — whitelist + privateOnly + ownerOnly
├── storage.ts              — Prisma-based storage для @grammyjs/conversations
├── channel.ts              — публикация / редактирование / SOLD в канале
├── service-chat.ts         — то же для служебного чата (с inline-кнопками)
├── upload.ts               — pipeline: Telegram getFile → fetch → Supabase Storage
├── telegram-utils.ts       — isNotModifiedError (катча 400 «message is not modified»)
├── handlers/
│   ├── start.ts            — /start (список команд для роли)
│   ├── owner.ts            — /add_worker, /remove_worker, /list_workers,
│   │                         /add_category, /remove_category, /list_categories
│   ├── edit.ts             — onEditClick + onEditCancel (вход в редактирование)
│   └── sold.ts             — onSoldClick + onRestockClick (SOLD-флоу)
└── conversations/
    ├── add-product.ts      — пошаговое добавление товара
    └── edit-product.ts     — пошаговое редактирование товара
```

### Webhook

После каждого деплоя на новый домен (или смены `BOT_TOKEN`):

```bash
npx tsx scripts/set-webhook.ts
```

Скрипт читает `NEXT_PUBLIC_SITE_URL` из `.env` и регистрирует у Telegram
`<NEXT_PUBLIC_SITE_URL>/api/bot`. Требуется HTTPS и публичный домен (не localhost).

### Privacy mode

Дефолтный (ON). Кнопки в служебном чате присылают `callback_query`
независимо от privacy mode — этого хватает. Если в будущем понадобится,
чтобы бот видел все сообщения в группе, отключи через
`@BotFather → /mybots → <bot> → Bot Settings → Group Privacy → Turn off`.

---

## Как развернуть ещё один магазин по этому же коду

1. **Сделать форк репозитория** (или клонировать в новый репо). Желательно
   менять только `.env` и `config.json` — код остаётся общим. Так фиксы и
   фичи можно подтягивать `git pull upstream`.
2. **Создать новый проект в Supabase** ([dashboard.supabase.com](https://supabase.com)) →
   получить connection string (Session mode, порт 5432) и `service_role`
   secret-key (Settings → API Keys → secret).
3. **Создать нового бота** через [@BotFather](https://t.me/BotFather) →
   скопировать `BOT_TOKEN`.
4. **Создать канал** в Telegram (приватный или публичный), добавить бота
   **админом** с правами: пост сообщений, редактирование, удаление.
5. **Создать служебный чат** (супергруппу) в Telegram, добавить туда бота
   (как **админа** с правом удалять сообщения — нужно для смены фото
   товара) и всех работников магазина. Получить chat_id через [@getidsbot](https://t.me/getidsbot)
   (id супергруппы начинается с `-100...`).
6. **Заполнить `.env`** (см. таблицу выше) и **`config.json`**:
   ```json
   {
     "storeName": "Название магазина",
     "sellerUsername": "telegram_username_продавца",
     "channelUsername": "telegram_username_канала",
     "currency": "₽"
   }
   ```
7. **Задеплоить на Vercel**:
   - Import Git Repository → выбрать форк
   - Framework Preset: **Next.js**
   - В **Settings → Environment Variables** скопировать **все** переменные
     из `.env` (Vercel не читает локальный `.env` — нужно вставить руками)
   - Deploy → получить production URL
   - Обновить `NEXT_PUBLIC_SITE_URL` (в Vercel и локально) на production URL
     → Redeploy
8. **Применить миграции** к новой Supabase БД:
   ```bash
   npx prisma migrate deploy
   ```
9. **Залить seed** (одна категория + владелец):
   ```bash
   npx tsx scripts/seed.ts
   ```
10. **Установить webhook бота**:
    ```bash
    npx tsx scripts/set-webhook.ts
    ```
11. **Создать публичный bucket в Supabase Storage** с именем из
    `SUPABASE_BUCKET` (по умолчанию `product-photos`). В настройках бакета
    включить **Public bucket = ON** (иначе картинки не отдадутся на сайт).
12. **Проверка**:
    - В Telegram: написать боту `/start` (от владельца) → должен ответить меню команд OWNER
    - На сайте: открыть `https://<твой-домен>.vercel.app` → должна показаться витрина

Готово. Магазины полностью независимы — каждый со своей БД, своим хранилищем,
своим ботом и своим доменом, но из одного кодовой базы.

---

## Этапы разработки

- [x] **Этап 0** — инициализация: Next.js, структура папок, конфиги
- [x] **Этап 1** — схема БД (Worker, Category, Product, Photo, BotSession), миграции, seed
- [x] **Этап 2** — webhook бота, whitelist + privateOnly, `/start`, `set-webhook.ts`
- [x] **Этап 3** — команды владельца через `@grammyjs/conversations`, middleware `ownerOnly`
- [x] **Этап 4** — `/add_product` (фото 1..10 → категория → размер → состояние → цена → превью → публикация). Pipeline upload Telegram→Supabase Storage
- [x] **Этап 5** — публикация товара в канал (`sendMediaGroup`), сохранение channelMessageIds
- [x] **Этап 6** — копия в служебный чат (альбом + сообщение с кнопками «Редактировать»/«Нет в наличии»)
- [x] **Этап 7** — редактирование товара через служебный чат. Для смены фото — `editMessageMedia` in-place при том же количестве, иначе пересоздание поста
- [x] **Этап 8** — SOLD-флоу: «❌ Нет в наличии» / «✅ Вернуть в наличие», метка в канале и в служебном чате
- [x] **Этап 9** — API товаров и категорий (`GET /api/products`, `/api/products/[id]`, `/api/categories`)
- [x] **Этап 10** — функциональные страницы сайта (главная с фильтрами, страница товара) без CSS
- [x] **Этап 11** — кнопка «Купить в Telegram» — deep link с pre-filled сообщением продавцу
- [x] **Этап 12** — финальная универсализация: всё магазин-зависимое в `config.json` / `.env`, метаданные сайта из config, ссылка на канал, README с инструкцией про второй магазин

---

## MVP-ограничения (документированы для будущей работы)

- **Параллельное редактирование двумя работниками**: первый завершивший
  перетирает работу второго. Нужно поле `Product.editingByWorkerId` с
  таймаутом.
- **`@grammyjs/conversations` storage**: Prisma-based, всё через таблицу
  `BotSession`. На большой нагрузке (>10 одновременных диалогов) стоит
  заменить на Redis.
- **Supabase pooler + adapter-pg**: на бесплатном тарифе изредка случаются
  flap'ы (P1017 ConnectionClosed). Митигировано через TCP keepAlive +
  retry. Радикально решает Prisma Accelerate или Neon serverless адаптер.
