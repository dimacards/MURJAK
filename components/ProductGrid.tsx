"use client";

import { useEffect, useState } from "react";
import type { ProductDto } from "@/lib/api-types";
import { ProductCard } from "./ProductCard";
import { Reveal } from "./Reveal";
import styles from "./ProductGrid.module.css";

/**
 * Секция «Товары»: грузит наличие из /api/stock.php (PHP-бэк на Beget).
 * Если API недоступен — показываем то, что в статическом products.json.
 * Товары без наличия уезжают в конец сетки и затемняются плашкой в карточке.
 */
export function ProductGrid({ items }: { items: ProductDto[] }) {
  const [stock, setStock] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stock.php", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j || typeof j !== "object") return;
        setStock(j as Record<string, boolean>);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Пока нет товаров</p>
      </div>
    );
  }

  const merged = items.map((p) => {
    const v = stock?.[String(p.id)];
    return typeof v === "boolean" ? { ...p, inStock: v } : p;
  });
  // в наличии — сверху, нет в наличии — в конец; внутри групп порядок сохраняем
  const ordered = [
    ...merged.filter((p) => p.inStock),
    ...merged.filter((p) => !p.inStock),
  ];

  return (
    <ul className={styles.grid}>
      {ordered.map((p, i) => (
        <li key={p.id} className={styles.cell}>
          <Reveal delay={i % 3 === 0 ? 0 : i % 3 === 1 ? 100 : 200}>
            <ProductCard product={p} preferredKind="ITEM" />
          </Reveal>
        </li>
      ))}
    </ul>
  );
}
