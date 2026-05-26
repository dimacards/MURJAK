import type { Size } from "@prisma/client";

/**
 * DTO одного товара в публичном API. Не путать с Prisma-моделью Product —
 * это упрощённое представление для витрины: только активные товары,
 * категория плоской строкой, фото — массивом publicUrl.
 */
export type ProductDto = {
  id: number;
  category: string;
  size: Size;
  condition: number;
  price: number;
  photos: string[];
  createdAt: string; // ISO
};

export type ProductListResponse = {
  items: ProductDto[];
  total: number;
  page: number;
  pageSize: number;
};

export type CategoryDto = {
  id: number;
  name: string;
};

/**
 * Допустимые значения параметра `sort` в GET /api/products.
 */
export const PRODUCT_SORT = ["new", "price_asc", "price_desc"] as const;
export type ProductSort = (typeof PRODUCT_SORT)[number];
