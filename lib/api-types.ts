/**
 * DTO одного товара в публичном API. Не путать с Prisma-моделью Product —
 * это упрощённое представление для витрины.
 *
 * photos — с типом: MODEL (одежда на человеке) или ITEM (сама вещь).
 * На главной фильтруется toggle'ом, какое фото показывать в сетке.
 *
 * videoUrl — публичная ссылка на видео вещи (если загружено через бота).
 * Отображение на странице товара — позже.
 *
 * features — список «особенностей» в порядке ввода. Показываются ТОЛЬКО
 * на странице карточки, не в сетке.
 *
 * inStock=false означает «нет в наличии», но товар остаётся на сайте
 * с плашкой — не скрывается.
 */
export type PhotoKind = "MODEL" | "ITEM";

export type ProductPhotoDto = {
  url: string;
  kind: PhotoKind;
};

export type ProductDto = {
  id: number;
  name: string;
  price: number;
  inStock: boolean;
  photos: ProductPhotoDto[];
  videoUrl: string | null;
  features: string[];
  createdAt: string; // ISO
};

export type ProductListResponse = {
  items: ProductDto[];
  total: number;
};
