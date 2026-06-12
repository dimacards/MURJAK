"use client";

import { useState } from "react";
import Image from "next/image";
import type { PhotoKind, ProductDto } from "@/lib/api-types";
import { ProductCard } from "./ProductCard";
import styles from "./ProductGrid.module.css";

/**
 * Фильтр-иконки (вещь / на модели) + сетка карточек.
 *
 * Иконки из макета: футболка = сама вещь (по умолчанию), человек = на модели.
 * Активная — полная яркость, неактивная — приглушена.
 */
export function ProductGrid({ items }: { items: ProductDto[] }) {
  const [kind, setKind] = useState<PhotoKind>("ITEM");

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
          className={`${styles.kindBtn} ${kind === "ITEM" ? styles.kindBtnActive : ""}`}
          onClick={() => setKind("ITEM")}
          aria-pressed={kind === "ITEM"}
          aria-label="Показать фото вещи"
        >
          <Image
            src="/brand/icon-item.svg"
            alt=""
            width={75}
            height={75}
            className={styles.kindIcon}
          />
        </button>
        <button
          type="button"
          className={`${styles.kindBtn} ${kind === "MODEL" ? styles.kindBtnActive : ""}`}
          onClick={() => setKind("MODEL")}
          aria-pressed={kind === "MODEL"}
          aria-label="Показать фото на модели"
        >
          <Image
            src="/brand/icon-model.svg"
            alt=""
            width={75}
            height={75}
            className={styles.kindIcon}
          />
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
