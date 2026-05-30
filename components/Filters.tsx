"use client";

import { useState } from "react";
import type { CategoryDto, ProductSort } from "@/lib/api-types";
import styles from "./Filters.module.css";

const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

export type FiltersState = {
  search: string;
  category: string;
  size: string;
  conditionMin: string;
  conditionMax: string;
  priceMin: string;
  priceMax: string;
  sort: ProductSort;
};

export const EMPTY_FILTERS: FiltersState = {
  search: "",
  category: "",
  size: "",
  conditionMin: "",
  conditionMax: "",
  priceMin: "",
  priceMax: "",
  sort: "new",
};

/** Есть ли среди фильтров что-то непустое (кроме сортировки). */
export function hasActiveFilters(f: FiltersState): boolean {
  return (
    !!f.search ||
    !!f.category ||
    !!f.size ||
    !!f.conditionMin ||
    !!f.conditionMax ||
    !!f.priceMin ||
    !!f.priceMax ||
    f.sort !== "new"
  );
}

/**
 * Панель фильтров: первая строка — поиск + select категории + кнопка
 * «Фильтры ▾». Под кнопкой разворачивается панель с размером, состоянием,
 * ценой, сортировкой.
 *
 * Все изменения летят в onChange — родитель сам решает что с ними делать
 * (debounce, URL, fetch). Это «глупый» компонент.
 */
export function Filters({
  value,
  onChange,
  onReset,
  categories,
}: {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
  onReset: () => void;
  categories: CategoryDto[];
}) {
  const [expanded, setExpanded] = useState(false);

  const update = <K extends keyof FiltersState>(
    key: K,
    val: FiltersState[K],
  ) => onChange({ ...value, [key]: val });

  const active = hasActiveFilters(value);

  return (
    <div className={styles.root}>
      <div className={styles.topRow}>
        <div className={styles.searchWrap}>
          <input
            type="search"
            className={styles.search}
            placeholder="Поиск по названию..."
            value={value.search}
            onChange={(e) => update("search", e.target.value)}
            aria-label="Поиск"
          />
        </div>

        <select
          className={styles.select}
          value={value.category}
          onChange={(e) => update("category", e.target.value)}
          aria-label="Категория"
        >
          <option value="">Все категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`${styles.toggle} ${expanded ? styles.toggleActive : ""}`}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          Фильтры {expanded ? "▴" : "▾"}
        </button>
      </div>

      {expanded && (
        <div className={styles.panel}>
          <div className={styles.field}>
            <label className={styles.label}>Размер</label>
            <div className={styles.sizeRow}>
              <input
                type="text"
                className={styles.sizeInput}
                placeholder="напр. M или 42"
                value={value.size}
                onChange={(e) => update("size", e.target.value)}
              />
              <div className={styles.sizeChips}>
                {CLOTHING_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`${styles.chip} ${
                      value.size === s ? styles.chipActive : ""
                    }`}
                    onClick={() =>
                      update("size", value.size === s ? "" : s)
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Состояние</label>
            <div className={styles.rangeRow}>
              <input
                type="number"
                min={1}
                max={10}
                placeholder="от"
                className={styles.rangeInput}
                value={value.conditionMin}
                onChange={(e) => update("conditionMin", e.target.value)}
              />
              <span className={styles.rangeSep}>—</span>
              <input
                type="number"
                min={1}
                max={10}
                placeholder="до"
                className={styles.rangeInput}
                value={value.conditionMax}
                onChange={(e) => update("conditionMax", e.target.value)}
              />
              <span className={styles.rangeUnit}>/ 10</span>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Цена</label>
            <div className={styles.rangeRow}>
              <input
                type="number"
                min={0}
                placeholder="от"
                className={styles.rangeInput}
                value={value.priceMin}
                onChange={(e) => update("priceMin", e.target.value)}
              />
              <span className={styles.rangeSep}>—</span>
              <input
                type="number"
                min={0}
                placeholder="до"
                className={styles.rangeInput}
                value={value.priceMax}
                onChange={(e) => update("priceMax", e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Сортировка</label>
            <select
              className={styles.select}
              value={value.sort}
              onChange={(e) =>
                update("sort", e.target.value as ProductSort)
              }
            >
              <option value="new">Сначала новые</option>
              <option value="price_asc">Сначала дешевле</option>
              <option value="price_desc">Сначала дороже</option>
            </select>
          </div>
        </div>
      )}

      {active && (
        <button
          type="button"
          className={styles.reset}
          onClick={onReset}
        >
          Сбросить фильтры
        </button>
      )}
    </div>
  );
}
