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

# 4. Применить миграции БД (создаст таблицы в Supabase)
npx prisma migrate dev

# 5. (Опционально) Залить тестовые данные:
#    одну категорию «футболка» и владельца из OWNER_TELEGRAM_ID
npx tsx scripts/seed.ts

# 6. Запустить в режиме разработки
npm run dev
```

Сайт откроется на [http://localhost:3000](http://localhost:3000).

---

## Переменные окружения (`.env`)

| Переменная | Откуда взять |
|---|---|
| `BOT_TOKEN` | Создать бота у [@BotFather](https://t.me/BotFather), скопировать токен |
| `OWNER_TELEGRAM_ID` | Получить у [@userinfobot](https://t.me/userinfobot) |
| `CHANNEL_ID` | Username канала без `@` или числовой chat_id (бот должен быть admin) |
| `SERVICE_CHAT_ID` | ID группового чата работников, куда бот шлёт копии с кнопками «Редактировать» / «Нет в наличии» |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (Transaction mode, порт 6543, `?pgbouncer=true`) — для рантайма |
| `DIRECT_URL` | Supabase → Settings → Database → Connection string (Session mode, порт 5432) — для миграций |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API Keys → secret key (`sb_secret_...`) |
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

## База данных

- Схема — `prisma/schema.prisma` (модели: `Worker`, `Category`, `Product`, `Photo`)
- Конфиг Prisma — `prisma.config.ts` (Prisma 7+ требует TS-конфиг вместо `package.json#prisma`)
- Миграции — `prisma/migrations/` (создаются командой `npx prisma migrate dev --name <name>`)
- Клиент — синглтон в `lib/db.ts`, использует `@prisma/adapter-pg` (Prisma 7 требует driver adapter)
- Seed — `scripts/seed.ts`, запускается вручную через `npx tsx scripts/seed.ts`

### Полезные команды

```bash
npx prisma migrate dev --name <name>   # создать миграцию и применить
npx prisma migrate deploy              # применить миграции в проде
npx prisma generate                    # перегенерить клиент после правок schema
npx prisma studio                      # GUI для просмотра данных
npx tsx scripts/seed.ts                # залить тестовые данные
```

---

## Telegram-бот

Бот живёт внутри Next.js — webhook от Telegram приходит на `POST /api/bot`.

### Архитектура

- `lib/bot/index.ts` — инициализация grammY бота, сборка middleware-цепочки
- `lib/bot/types.ts` — `AppContext` (расширение grammY-контекста полем `worker`)
- `lib/bot/middleware.ts` — `whitelist` (фильтр чужих) + `privateOnly` (только ЛС)
- `lib/bot/handlers/start.ts` — обработчик `/start`
- `lib/bot/handlers/stubs.ts` — заглушки для команд из следующих этапов
- `app/api/bot/route.ts` — Next.js Route Handler, отдаёт обновления в grammY
- `scripts/set-webhook.ts` — устанавливает webhook URL после деплоя

### Webhook

После каждого деплоя на новый домен (или смены `BOT_TOKEN`) нужно поставить webhook:

```bash
npx tsx scripts/set-webhook.ts
```

Скрипт читает `NEXT_PUBLIC_SITE_URL` из `.env` и регистрирует у Telegram адрес
`<NEXT_PUBLIC_SITE_URL>/api/bot`. Требования Telegram: HTTPS, публичный домен
(не localhost). Локально webhook не поставить — для локальной разработки бота
проще запустить временный туннель (например, через `cloudflared` или `ngrok`)
или поднимать только сайт, а тестировать бот после деплоя.

### Privacy mode

Бот работает с дефолтным privacy mode (ON). Кнопки в служебном чате присылают
`callback_query` независимо от privacy mode, так что нам этого хватает. Если в
будущем понадобится, чтобы бот видел все сообщения в группе, отключить через
`@BotFather → /mybots → <bot> → Bot Settings → Group Privacy → Turn off`.

## Этапы разработки

- [x] **Этап 0** — инициализация проекта, структура папок, конфиги
- [x] **Этап 1** — схема БД (`Worker`, `Category`, `Product`, `Photo`), `lib/db.ts`, миграция, seed
- [x] **Этап 2** — webhook бота, `whitelist` + `privateOnly` middleware, `/start`, заглушки команд, `set-webhook`
- [x] **Этап 3** — команды владельца: `/add_worker`, `/remove_worker`, `/list_workers`, `/add_category`, `/remove_category`, `/list_categories`. Подключён `@grammyjs/conversations`. Middleware `ownerOnly`. В диалогах работает `/cancel` для выхода.
- [x] **Этап 4** — `/add_product` (доступна WORKER и OWNER): 7-шаговый диалог. Фото 1..10 → категория (inline) → размер XS..XXL (inline) → состояние (1..10) → цена → превью альбомом → «Опубликовать»/«Отмена». При публикации: фото скачивается из Telegram, грузится в Supabase Storage, сохраняется `Product` + `Photo[]` в БД (telegramFileId сохраняется для будущих перепубликаций).
- [x] **Этап 5** — публикация товара в канал. `lib/bot/channel.ts` с `buildCaption` + `publishToChannel` (sendMediaGroup с telegramFileId) и заглушками `updateChannelCaption` / `deleteChannelPost` / `markChannelAsSold` / `restoreChannelFromSold` для Этапов 7-8. После публикации message_id сохраняются в `Product.channelMessageIds`.
- [x] **Этап 6** — копия товара в служебный чат. `lib/bot/service-chat.ts` с `sendToServiceChat` (альбом + отдельное сообщение с inline-кнопками «✏️ Редактировать» / «❌ Нет в наличии») и заглушками для Этапов 7-8. Callback-обработчики `edit:` / `sold:` отвечают «на следующем этапе». `Product.serviceMediaMessageIds` + `serviceMessageId` сохраняются.
- [x] **Этап 7** — редактирование товара через служебный чат. Клик «✏️ Редактировать» → бот ставит edit-lock в служебном чате + шлёт в ЛС работнику меню полей. После завершения — обновляются пост в канале и служебное сообщение. Поля: категория (inline), размер (inline), состояние/цена (текст), фото (in-place через editMessageMedia при том же количестве, иначе пересоздание). MVP без лока на параллельное редактирование двумя работниками.
- [x] **Этап 8** — SOLD-флоу. Кнопка «❌ Нет в наличии» в служебном чате → `Product.status = SOLD`, caption в канале дополняется «❌ ПРОДАНО», сообщение с кнопками в служебном чате меняется на «❌ ПРОДАНО · Товар №X · ...» + одна кнопка «✅ Вернуть в наличие». Восстановление статуса — зеркально. Idempotent (повторный клик отвечает «Уже продано» / «Уже в наличии»).
- [x] **Этап 9** — API товаров и категорий. `GET /api/products` с фильтрами (category/size/conditionMin/Max/priceMin/Max), сортировкой (new/price_asc/price_desc), пагинацией (page, limit до 60). `GET /api/products/[id]` — один товар (404 если SOLD). `GET /api/categories` — список категорий. SOLD-товары жёстко скрыты везде. Типы в `lib/api-types.ts` для последующего UI.
- [x] **Этап 10** — функциональные страницы сайта (без CSS). Главная (`app/page.tsx`) — client component с формой фильтров и списком карточек; страница товара (`app/products/[id]/page.tsx`) — server component с фото, описанием, заглушкой «Купить».
- [x] **Этап 11** — кнопка «Купить в Telegram» на странице товара. Deep link `https://t.me/{sellerUsername}?text=...` с pre-filled сообщением о товаре. Открывается в новой вкладке. `sellerUsername` берётся из `config.json`.
