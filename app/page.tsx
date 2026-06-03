"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  FiltersDto,
  ProductListResponse,
  ProductSort,
} from "@/lib/api-types";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Filters, EMPTY_FILTERS, type FiltersState } from "@/components/Filters";
import { ProductGrid, Pagination } from "@/components/ProductGrid";
import { ProductGridSkeleton } from "@/components/ProductGridSkeleton";
import styles from "./page.module.css";

/** Парсит фильтры и страницу из URLSearchParams. */
function parseFromParams(sp: URLSearchParams): {
  filters: FiltersState;
  page: number;
} {
  const sort = sp.get("sort");
  const validSort: ProductSort =
    sort === "price_asc" || sort === "price_desc" ? sort : "new";

  return {
    filters: {
      search: sp.get("search") ?? "",
      category: sp.get("category") ?? "",
      size: sp.get("size") ?? "",
      conditionMin: sp.get("conditionMin") ?? "",
      conditionMax: sp.get("conditionMax") ?? "",
      priceMin: sp.get("priceMin") ?? "",
      priceMax: sp.get("priceMax") ?? "",
      sort: validSort,
    },
    page: Math.max(1, Number(sp.get("page")) || 1),
  };
}

/** Сериализует фильтры и страницу в query string. */
function buildQueryString(f: FiltersState, page: number): string {
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

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Источник правды — URL. При маунте читаем из него.
  const initial = useMemo(
    () => parseFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  // Draft — то, что в инпутах прямо сейчас.
  const [draft, setDraft] = useState<FiltersState>(initial.filters);

  // Если URL поменялся извне (back/forward, прямой ввод), синхронизируем draft.
  // Это именно то что делают «эффекты-синхронизаторы» — внешняя система
  // (URL) обновилась, тянем актуальное в React-state. Линтер не распознаёт
  // useSearchParams как external, поэтому подавляем.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(initial.filters);
  }, [initial.filters]);

  const applied = initial.filters;
  const page = initial.page;

  // === Применение фильтров → запись в URL ===
  // router.replace вместо push, чтобы каждое нажатие клавиши не плодило
  // запись в истории браузера. URL остаётся шерящимся, кнопка «назад»
  // работает нормально.
  const writeToUrl = useCallback(
    (next: FiltersState, nextPage: number) => {
      const qs = buildQueryString(next, nextPage);
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [router],
  );

  // Поиск с debounce 300мс. Остальное — мгновенно.
  useEffect(() => {
    // если ничего не изменилось — не дёргаем URL
    const keyDraft = JSON.stringify(draft);
    const keyApplied = JSON.stringify(applied);
    if (keyDraft === keyApplied) return;

    const onlySearchDiffers =
      draft.search !== applied.search &&
      draft.category === applied.category &&
      draft.size === applied.size &&
      draft.conditionMin === applied.conditionMin &&
      draft.conditionMax === applied.conditionMax &&
      draft.priceMin === applied.priceMin &&
      draft.priceMax === applied.priceMax &&
      draft.sort === applied.sort;

    if (onlySearchDiffers) {
      // debounce для текстового ввода
      const t = setTimeout(() => writeToUrl(draft, 1), 300);
      return () => clearTimeout(t);
    }
    // любое другое изменение — мгновенно + сброс страницы
    writeToUrl(draft, 1);
  }, [draft, applied, writeToUrl]);

  const [filtersDict, setFiltersDict] = useState<FiltersDto>({
    categories: [],
    sizes: [],
  });
  const [data, setData] = useState<ProductListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Динамический справочник фильтров: только те категории и размеры, которые
  // реально присутствуют в активных видимых товарах. Так не предлагаем юзеру
  // «ботинки», если ботинок нет.
  useEffect(() => {
    fetch("/api/filters")
      .then((r) => r.json())
      .then((d: FiltersDto) => setFiltersDict(d))
      .catch((e) => console.error("Failed to load filters dictionary:", e));
  }, []);

  // Загрузка товаров. Зависит от applied (т.е. URL) и page.
  // setLoading/setError перед fetch — стандартный fetch-lifecycle, не
  // «cascading renders» из предупреждения линтера.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    const qs = buildQueryString(applied, page);
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
  }, [applied, page]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  const goToPage = (nextPage: number) => {
    writeToUrl(applied, nextPage);
    // прокручиваем к верху списка, чтобы новая страница начиналась с начала
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <header className={styles.header}>
        <div className="container">
          <Logo />
        </div>
      </header>

      <main className={`container ${styles.main}`}>
        <Filters
          value={draft}
          onChange={setDraft}
          onReset={() => {
            setDraft(EMPTY_FILTERS);
            writeToUrl(EMPTY_FILTERS, 1);
          }}
          categories={filtersDict.categories}
          availableSizes={filtersDict.sizes}
        />

        {error ? (
          <ErrorState message={error} onRetry={() => writeToUrl(applied, page)} />
        ) : loading && !data ? (
          <ProductGridSkeleton />
        ) : data ? (
          <>
            <ProductGrid items={data.items} />
            <Pagination
              page={data.page}
              totalPages={totalPages}
              onPrev={() => goToPage(Math.max(1, page - 1))}
              onNext={() => goToPage(page + 1)}
            />
          </>
        ) : null}
      </main>

      <Footer />
    </>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className={styles.errorState}>
      <p className={styles.errorTitle}>Не удалось загрузить товары</p>
      <p className={styles.errorDetail}>{message}</p>
      <button type="button" className={styles.errorRetry} onClick={onRetry}>
        Попробовать ещё раз
      </button>
    </div>
  );
}

export default function Home() {
  // useSearchParams требует Suspense-границу в Next.js App Router
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeInner />
    </Suspense>
  );
}

function HomeFallback() {
  return (
    <>
      <header className={styles.header}>
        <div className="container">
          <Logo />
        </div>
      </header>
      <main className={`container ${styles.main}`}>
        <ProductGridSkeleton />
      </main>
    </>
  );
}
