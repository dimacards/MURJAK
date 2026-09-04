/**
 * Типы товара для витрины. Данные берутся из `data/products.json`
 * (через `lib/products.ts`).
 *
 * photos — с типом: MODEL (одежда на человеке) или ITEM (сама вещь);
 *   на главной фильтруются toggle'ом.
 * videoUrl — путь к видео вещи в `public/`, или null.
 * features — «особенности», показываются только на странице товара.
 * inStock=false — плашка «нет в наличии», товар остаётся на сайте.
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
  /** Белое свечение по контуру PNG (только у вещей-вырезов: футболка/худи). */
  glow?: boolean;
  /** Размеры для выбора при добавлении в корзину. Пусто/нет — товар без размера
   *  (напр. подвеска), добавляется сразу без модалки. */
  sizes?: string[];
};
