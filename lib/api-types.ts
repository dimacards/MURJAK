/**
 * DTO одного товара в публичном API. Не путать с Prisma-моделью Product —
 * это упрощённое представление для витрины.
 *
 * features — список «особенностей» в порядке ввода. Показываются ТОЛЬКО
 * на странице карточки, не в сетке.
 *
 * inStock=false означает «нет в наличии», но товар остаётся на сайте
 * с плашкой — не скрывается.
 */
export type ProductDto = {
  id: number;
  name: string;
  price: number;
  inStock: boolean;
  photos: string[];
  features: string[];
  createdAt: string; // ISO
};

export type ProductListResponse = {
  items: ProductDto[];
  total: number;
};
