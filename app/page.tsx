/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import config from "@/lib/config";
import type {
  CategoryDto,
  ProductListResponse,
  ProductSort,
} from "@/lib/api-types";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

type Filters = {
  search: string;   // подстрока в описании
  category: string; // "" = любая
  size: string;     // "" = любой
  conditionMin: string;
  conditionMax: string;
  priceMin: string;
  priceMax: string;
  sort: ProductSort;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  category: "",
  size: "",
  conditionMin: "",
  conditionMax: "",
  priceMin: "",
  priceMax: "",
  sort: "new",
};

/** Собирает query string из applied-фильтров и страницы. */
function buildQuery(applied: Filters, page: number): string {
  const params = new URLSearchParams();
  if (applied.search) params.set("search", applied.search);
  if (applied.category) params.set("category", applied.category);
  if (applied.size) params.set("size", applied.size);
  if (applied.conditionMin) params.set("conditionMin", applied.conditionMin);
  if (applied.conditionMax) params.set("conditionMax", applied.conditionMax);
  if (applied.priceMin) params.set("priceMin", applied.priceMin);
  if (applied.priceMax) params.set("priceMax", applied.priceMax);
  if (applied.sort && applied.sort !== "new") params.set("sort", applied.sort);
  if (page > 1) params.set("page", String(page));
  return params.toString();
}

export default function Home() {
  // draft — то, что пользователь редактирует в форме
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  // applied — то, по чему идёт запрос. Меняется только по «Применить».
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [data, setData] = useState<ProductListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Категории грузим один раз.
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d: CategoryDto[]) => setCategories(d))
      .catch((e) => console.error("Failed to load categories:", e));
  }, []);

  // Товары — при смене applied или page.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
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
  }, [applied, page]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <main style={{ padding: 16, fontFamily: "sans-serif" }}>
      <h1>{config.storeName}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(draft);
          setPage(1);
        }}
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "8px 12px",
          maxWidth: 520,
          marginBottom: 24,
        }}
      >
        <label htmlFor="f-search">Поиск</label>
        <input
          id="f-search"
          type="search"
          placeholder="по названию товара..."
          value={draft.search}
          onChange={(e) => setDraft({ ...draft, search: e.target.value })}
        />

        <label htmlFor="f-category">Категория</label>
        <select
          id="f-category"
          value={draft.category}
          onChange={(e) =>
            setDraft({ ...draft, category: e.target.value })
          }
        >
          <option value="">любая</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label htmlFor="f-size">Размер</label>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input
            id="f-size"
            type="text"
            placeholder="напр. M или 42"
            value={draft.size}
            onChange={(e) => setDraft({ ...draft, size: e.target.value })}
            style={{ width: 110 }}
          />
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setDraft({ ...draft, size: s })}
              style={{ padding: "2px 6px" }}
            >
              {s}
            </button>
          ))}
        </span>

        <label>Состояние</label>
        <span>
          от{" "}
          <input
            type="number"
            min={1}
            max={10}
            value={draft.conditionMin}
            onChange={(e) =>
              setDraft({ ...draft, conditionMin: e.target.value })
            }
            style={{ width: 60 }}
          />{" "}
          до{" "}
          <input
            type="number"
            min={1}
            max={10}
            value={draft.conditionMax}
            onChange={(e) =>
              setDraft({ ...draft, conditionMax: e.target.value })
            }
            style={{ width: 60 }}
          />
        </span>

        <label>Цена</label>
        <span>
          от{" "}
          <input
            type="number"
            min={0}
            value={draft.priceMin}
            onChange={(e) =>
              setDraft({ ...draft, priceMin: e.target.value })
            }
            style={{ width: 80 }}
          />{" "}
          до{" "}
          <input
            type="number"
            min={0}
            value={draft.priceMax}
            onChange={(e) =>
              setDraft({ ...draft, priceMax: e.target.value })
            }
            style={{ width: 80 }}
          />{" "}
          {config.currency}
        </span>

        <label htmlFor="f-sort">Сортировка</label>
        <select
          id="f-sort"
          value={draft.sort}
          onChange={(e) =>
            setDraft({ ...draft, sort: e.target.value as ProductSort })
          }
        >
          <option value="new">новые</option>
          <option value="price_asc">цена ↑</option>
          <option value="price_desc">цена ↓</option>
        </select>

        <span />
        <span style={{ display: "flex", gap: 8 }}>
          <button type="submit">Применить</button>
          <button
            type="button"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              setApplied(EMPTY_FILTERS);
              setPage(1);
            }}
          >
            Сбросить
          </button>
        </span>
      </form>

      {loading && <p>Загрузка...</p>}
      {error && (
        <p style={{ color: "red" }}>Ошибка: {error}</p>
      )}

      {data && !loading && (
        <>
          <p>
            Найдено: <b>{data.total}</b>
            {data.total > 0 && (
              <>
                {" · "}страница {data.page} из {totalPages}
              </>
            )}
          </p>

          {data.items.length === 0 ? (
            <p>Ничего не найдено.</p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              {data.items.map((p) => (
                <li
                  key={p.id}
                  style={{
                    border: "1px solid #ccc",
                    padding: 8,
                  }}
                >
                  {p.photos[0] && (
                    <img
                      src={p.photos[0]}
                      alt=""
                      style={{
                        display: "block",
                        width: "100%",
                        aspectRatio: "1 / 1",
                        objectFit: "cover",
                        marginBottom: 8,
                      }}
                    />
                  )}
                  {p.description && (
                    <div style={{ fontWeight: 600 }}>{p.description}</div>
                  )}
                  <div style={{ color: "#666", fontSize: 13 }}>{p.category}</div>
                  <div>Размер: {p.size}</div>
                  <div>Состояние: {p.condition}/10</div>
                  <div>
                    <b>
                      {p.price} {config.currency}
                    </b>
                  </div>
                  <Link href={`/products/${p.id}`}>Подробнее →</Link>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button
                type="button"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Назад
              </button>
              <button
                type="button"
                disabled={data.page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Вперёд →
              </button>
            </div>
          )}
        </>
      )}

      {config.channelUsername && (
        <footer
          style={{
            marginTop: 32,
            paddingTop: 16,
            borderTop: "1px solid #ccc",
            fontSize: 14,
          }}
        >
          Новые товары первыми в нашем Telegram-канале:{" "}
          <a
            href={`https://t.me/${config.channelUsername}`}
            rel="noopener"
          >
            @{config.channelUsername}
          </a>
        </footer>
      )}
    </main>
  );
}
