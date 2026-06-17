import productsData from "@/data/products.json";
import type { ProductDto } from "./api-types";

/**
 * Источник товаров — статический JSON (`data/products.json`).
 * Раньше данные брались из Postgres через Prisma; теперь сайт полностью
 * статический (без БД, без бота): товары правятся прямо в JSON, фото и видео
 * лежат в `public/`. Так сайт хостится где угодно (в т.ч. на РФ-хостинге) и
 * быстро отдаётся без обращений за границу.
 *
 * Чтобы добавить/изменить товар: правим `data/products.json` и кладём медиа
 * в `public/products/<slug>/...`, затем пересобираем и деплоим.
 */
const products = productsData as ProductDto[];

/** Все товары, сначала новые (по createdAt убыв.) — как было на витрине. */
export function getAllProducts(): ProductDto[] {
  return [...products].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Один товар по id, либо null. */
export function getProduct(id: number): ProductDto | null {
  return products.find((p) => p.id === id) ?? null;
}
