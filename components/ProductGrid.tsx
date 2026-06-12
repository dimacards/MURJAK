"use client";

import { useState } from "react";
import type { PhotoKind, ProductDto } from "@/lib/api-types";
import { ProductCard } from "./ProductCard";
import styles from "./ProductGrid.module.css";

/**
 * Сетка карточек: 2 колонки на мобилке, 4 на десктопе (≥768px).
 *
 * Toggle «На модели / Вещь» переключает, фото какого типа показывать
 * в карточках (пока простые кнопки — потом заменим на иконки).
 * Если у товара нет фото выбранного типа — fallback на первое любое.
 */
export function ProductGrid({ items }: { items: ProductDto[] }) {
  const [kind, setKind] = useState<PhotoKind>("MODEL");

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Пока нет товаров</p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.kindToggle} role="group" aria-label="Вид фото">
        <button
          type="button"
          className={`${styles.kindBtn} ${kind === "MODEL" ? styles.kindBtnActive : ""}`}
          onClick={() => setKind("MODEL")}
          aria-pressed={kind === "MODEL"}
        >
          На модели
        </button>
        <button
          type="button"
          className={`${styles.kindBtn} ${kind === "ITEM" ? styles.kindBtnActive : ""}`}
          onClick={() => setKind("ITEM")}
          aria-pressed={kind === "ITEM"}
        >
          Вещь
        </button>
      </div>

      <ul className={styles.grid}>
        {items.map((p) => (
          <li key={p.id} className={styles.cell}>
            <ProductCard product={p} preferredKind={kind} />
          </li>
        ))}
      </ul>
    </>
  );
}
