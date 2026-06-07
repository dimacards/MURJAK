import type { ProductDto } from "@/lib/api-types";
import { ProductCard } from "./ProductCard";
import styles from "./ProductGrid.module.css";

/**
 * Сетка карточек: 2 колонки на мобилке, 4 на десктопе (≥768px).
 */
export function ProductGrid({ items }: { items: ProductDto[] }) {
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Пока нет товаров</p>
      </div>
    );
  }

  return (
    <ul className={styles.grid}>
      {items.map((p) => (
        <li key={p.id} className={styles.cell}>
          <ProductCard product={p} />
        </li>
      ))}
    </ul>
  );
}
