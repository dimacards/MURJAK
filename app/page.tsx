"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CategoryDto,
  ProductListResponse,
} from "@/lib/api-types";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Filters, EMPTY_FILTERS, type FiltersState } from "@/components/Filters";
import { ProductGrid, Pagination } from "@/components/ProductGrid";
import styles from "./page.module.css";

/** Сериализация фильтров и страницы в query string для /api/products. */
function buildQuery(f: FiltersState, page: number): string {
  const params = new URLSearchParams();
  if (f.search) params.set("search", f.search);
  if (f.category) params.set("category", f.category);
  if (f.size) params.set("size", f.size);
  if (f.conditionMin) params.set("conditionMin", f.conditionMin);
  if (f.conditionMax) params.set("conditionMax", f.conditionMax);
  if (f.priceMin) params.set("priceMin", f.priceMin);
  if (f.priceMax) params.set("priceMax", f.priceMax);
  if (f.sort && f.sort !== "new") params.set("sort", f.sort);
  if (page > 1) params.set("page", String(page));
  return params.toString();
}

export default function Home() {
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [data, setData] = useState<ProductListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Категории — один раз.
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d: CategoryDto[]) => setCategories(d))
      .catch((e) => console.error("Failed to load categories:", e));
  }, []);

  // Debounce только для текстового поиска. Категория/фильтры/сортировка/
  // страница применяются мгновенно — это уже точечные действия,
  // дожимать не нужно.
  const [appliedSearch, setAppliedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedSearch(filters.search);
    }, 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Сбрасываем страницу при изменении любых фильтров.
  const prevFiltersRef = useRef<string>(
    JSON.stringify({ ...EMPTY_FILTERS, search: "" }),
  );
  useEffect(() => {
    const key = JSON.stringify({ ...filters, search: appliedSearch });
    if (key !== prevFiltersRef.current) {
      prevFiltersRef.current = key;
      setPage(1);
    }
  }, [
    appliedSearch,
    filters.category,
    filters.size,
    filters.conditionMin,
    filters.conditionMax,
    filters.priceMin,
    filters.priceMax,
    filters.sort,
  ]);

  // Загрузка товаров.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const applied: FiltersState = { ...filters, search: appliedSearch };
    const qs = buildQuery(applied, page);
    fetch(`/api/products${qs ? "?" + qs : ""}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ProductListResponse) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appliedSearch,
    filters.category,
    filters.size,
    filters.conditionMin,
    filters.conditionMax,
    filters.priceMin,
    filters.priceMax,
    filters.sort,
    page,
  ]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <>
      <header className={styles.header}>
        <div className="container">
          <Logo />
        </div>
      </header>

      <main className={`container ${styles.main}`}>
        <Filters
          value={filters}
          onChange={setFilters}
          onReset={() => {
            setFilters(EMPTY_FILTERS);
            setAppliedSearch("");
            setPage(1);
          }}
          categories={categories}
        />

        {error && <p className={styles.error}>Ошибка: {error}</p>}

        {loading && !data ? (
          <p className={styles.status}>Загрузка...</p>
        ) : data ? (
          <>
            <ProductGrid items={data.items} />
            <Pagination
              page={data.page}
              totalPages={totalPages}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          </>
        ) : null}
      </main>

      <Footer />
    </>
  );
}
