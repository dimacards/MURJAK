# MURJAK

Онлайн-витрина бренда одежды. Фронт — статика (Next.js `output: "export"`),
рядом лежит тонкая PHP-часть для наличия товаров и приёма оплаты.
Без базы данных и без бота.

Купить можно двумя путями: написать продавцу в Telegram или оплатить
через Robokassa (корзина + платёжная ссылка).

## Стек

- **Next.js 16** (App Router, TypeScript), сборка в статику — `output: "export"`.
- **CSS Modules** — стили.
- Товары — в `data/products.json`, медиа (фото/видео) — в `public/`.
- На выходе `npm run build` — папка `out/` с готовыми HTML/CSS/JS + ассеты.
  Её можно залить на любой статический хостинг (в т.ч. российский).

## Структура

```
data/products.json        — все товары (название, цена, фото, видео, features)
public/
  products/<товар>/        — фото и видео товара
  brand/                   — логотип, иконки, текстура, hero.mp4 (фон главной)
app/
  page.tsx                 — главная (hero + сетка карточек)
  products/[id]/page.tsx   — страница товара
  layout.tsx               — метатеги, шрифт
components/                 — UI (Gallery, ProductCard, ProductDetails, …)
lib/
  products.ts              — чтение товаров из JSON
  cart.ts                  — корзина в localStorage
  config.ts / api-types.ts — настройки и типы
config.json                — storeName, sellerUsername, currency, heroVideoUrl
php/                       — PHP-часть: админка наличия + оплата (см. php/README.md)
scripts/sync-php-data.mjs  — копирует каталог с ценами в php/data (запускается при build)
```

## Как редактировать товары

См. **[КАК-РЕДАКТИРОВАТЬ.md](КАК-РЕДАКТИРОВАТЬ.md)** — там по шагам: добавить/
изменить/убрать товар, куда класть фото и видео.

Коротко: правишь `data/products.json`, кладёшь медиа в `public/products/<товар>/`,
пересобираешь и заливаешь.

## Локальная разработка

```bash
npm install
npm run dev      # превью на localhost:3000
```

## Сборка и деплой

```bash
npm run build    # собирает статику в папку out/
```

Дальше в `public_html/` хостинга заливается **содержимое `out/`** плюс
**содержимое `php/`** (папки `api/`, `admin/`, `data/` и файл `.htaccess`).
Домен направляется на хостинг через DNS у регистратора.

Настройка оплаты и админки — в [php/README.md](php/README.md).

## Окружение

Переменных окружения нет — фронт собирается статикой, все настройки лежат
в `config.json` (имя магазина, Telegram продавца, валюта, адрес сайта,
hero-видео). Ключи Robokassa — в `php/api/_pay-config.php` на сервере,
в репозиторий не попадают.
