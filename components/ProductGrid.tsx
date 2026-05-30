import type { ProductDto } from "@/lib/api-types";
import { ProductCard } from "./ProductCard";
import styles from "./ProductGrid.module.css";

/**
 * Сетка карточек: 2 колонки на мобилке, 4 на десктопе (≥768px).
 * Контейнер ограничен max-width=1200 — на сверхшироких экранах
 * карточки остаются разумного размера.
 */
export function ProductGrid({ items }: { items: ProductDto[] }) {
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Ничего не найдено</p>
        <p className={styles.emptyHint}>
          Попробуйте изменить запрос или сбросить фильтры.
        </p>
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

export function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className={styles.pagination} aria-label="Страницы">
      <button
        type="button"
        className={styles.pageBtn}
        onClick={onPrev}
        disabled={page <= 1}
      >
        ← Назад
      </button>
      <span className={styles.pageInfo}>
        {page} / {totalPages}
      </span>
      <button
        type="button"
        className={styles.pageBtn}
        onClick={onNext}
        disabled={page >= totalPages}
      >
        Вперёд →
      </button>
    </nav>
  );
}
