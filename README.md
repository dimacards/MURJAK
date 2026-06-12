# MURJAK

Онлайн-витрина бренда одежды + Telegram-бот для управления товарами.

- Сайт-витрина: фото, название, цена, особенности.
- Покупка — через переход в Telegram продавца из карточки товара.
- Бот: добавление, редактирование, наличие/нет, удаление товара.
- Канала нет. Категорий нет. Работник один.

## Стек

- **Next.js 16** (App Router, TypeScript) — сайт + API + webhook бота в одном проекте.
- **Postgres на Supabase** — БД.
- **Supabase Storage** — фото товаров.
- **Prisma 7** + `@prisma/adapter-pg` — ORM (session pooler 5432).
- **grammY** + `@grammyjs/conversations` — Telegram-бот.
- **Vercel** — хостинг.

## Структура

```
/app
  /page.tsx                    — главная (сетка карточек)
  /products/[id]/page.tsx      — карточка товара
  /api
    /bot/route.ts              — webhook Telegram
    /products/route.ts         — список товаров (JSON)
    /products/[id]/route.ts    — один товар (JSON)
  /layout.tsx                  — метатеги, шрифты
/components                    — UI: ProductCard, Gallery, BuyButton, …
/lib
  /bot
    /index.ts                  — инициализация бота
    /middleware.ts             — whitelist по WORKER_TELEGRAM_ID
    /handlers/
      /start.ts                — /start
      /products.ts             — /products, callback-кнопки меню товара
    /conversations/
      /add-product.ts          — пошаговое добавление
      /edit-product.ts         — редактирование (name/price/photos/features)
    /storage.ts                — Prisma-storage для @grammyjs/conversations
    /upload.ts                 — загрузка фото из Telegram в Supabase
  /db.ts                       — Prisma client (с retry на P1017)
  /supabase.ts                 — Supabase Storage client
  /config.ts                   — чтение config.json
  /api-types.ts                — типы ProductDto / ProductListResponse
/prisma
  /schema.prisma               — Product, Photo, Feature, BotSession
  /migrations
/scripts
  /set-bot-commands.ts         — установить меню команд бота
  /set-webhook.ts              — поставить webhook на URL Vercel
config.json                    — storeName, sellerUsername, currency
.env / .env.example
```

## Доменная модель

### Работник
Один. Его `telegram_id` хранится в `.env` как `WORKER_TELEGRAM_ID`.
Бот игнорирует всех, кроме него. Никакой таблицы Worker нет.

### Product
- `name` — название (строка)
- `price` — целое число рублей
- `inStock` — boolean; при `false` товар остаётся на сайте с плашкой «нет в наличии»
- `photos` — 1..10 фото в Supabase Storage; у каждого `kind`: `MODEL` (на человеке) / `ITEM` (сама вещь)
- `videoPublicUrl` и др. — опциональное видео вещи (одно, до 20 МБ)
- `features` — упорядоченный список «особенностей»; показываются ТОЛЬКО на странице товара, не в сетке

### Сайт
- Главная: сетка карточек (фото + название + цена) + toggle «На модели / Вещь» (какой тип фото показывать в сетке).
- Карточка: галерея, название, цена, список features, кнопка «Написать продавцу». Видео уже в API (`videoUrl`), отображение на странице — позже.
- Если `inStock=false` — плашка «нет в наличии» и кнопка дисэйблится.

### Бот
Команды (все в ЛС):
- `/start` — приветствие
- `/add_product` — добавить товар (фото на модели → фото вещи → видео → название → цена → features → превью → опубликовать)
- `/products` — список товаров с inline-меню редактирования (вкл. «🎥 Видео»: заменить/удалить)

На превью можно редактировать любое поле. На любом шаге — кнопка «Отмена» или текст `/cancel`.

## Локальная разработка

```bash
npm install
npm run dev
```

Перед первым запуском:

1. **`.env`** — скопируй `.env.example`, заполни:
   - `BOT_TOKEN` — из @BotFather
   - `WORKER_TELEGRAM_ID` — твой telegram_id (узнать у @userinfobot)
   - `DATABASE_URL` / `DIRECT_URL` — Supabase session pooler (порт 5432)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`
   - `NEXT_PUBLIC_SITE_URL` — URL деплоя (для OG-тегов; локально можно оставить `http://localhost:3000`)
2. **Bucket в Supabase Storage** — создай публичный bucket (по умолчанию `products`).
3. **Миграции БД** — `npx prisma migrate dev` на Supabase обычно не работает (нет shadow DB). Применяем вручную:
   ```bash
   # сгенерировать SQL из схемы
   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script -o /tmp/init.sql

   # применить через pg-коннект
   node -e "require('dotenv').config(); const {Client}=require('pg'); const c=new Client({connectionString:process.env.DIRECT_URL,ssl:{rejectUnauthorized:false}}); c.connect().then(()=>c.query(require('fs').readFileSync('/tmp/init.sql','utf8'))).then(()=>{console.log('OK'); c.end();})"

   # пометить как применённую
   npx prisma migrate resolve --applied 20260607_init
   ```
4. **`npx prisma generate`** — пересобрать клиент после изменений схемы.

## Деплой на Vercel

1. Import репозитория в [vercel.com/new](https://vercel.com/new).
2. **Environment Variables** — те же, что в `.env` (кроме `NEXT_PUBLIC_SITE_URL`, его впиши после первого деплоя).
3. **Deploy**.
4. После первого деплоя — добавь `NEXT_PUBLIC_SITE_URL` в env, ещё раз Redeploy.

### Webhook Telegram
После деплоя поставь webhook на URL Vercel:

```bash
npx tsx scripts/set-webhook.ts
```

Скрипт берёт `BOT_TOKEN` и `NEXT_PUBLIC_SITE_URL` из локального `.env`, шлёт `setWebhook` на Telegram API, и сразу проверяет через `getWebhookInfo`.

### Меню команд
Один раз — для красивых подсказок в Telegram при вводе «/»:

```bash
npx tsx scripts/set-bot-commands.ts
```

## История репозитория

Этот репо начат от форка винтажного проекта (`Vintagebottest`). Винтажная история помечена веткой `vintage-archive` (на GitHub есть тоже). Чтобы удалить винтажную историю окончательно — можно squashить `main` в один коммит и форс-пушнуть, или просто удалить ветку `vintage-archive`.
