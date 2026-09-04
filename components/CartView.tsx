"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { cart, type CartLine } from "@/lib/cart";
import { SizeModal } from "./SizeModal";
import styles from "./CartView.module.css";

type Group = { product: ProductDto; lines: CartLine[]; qty: number };

export function CartView({ products }: { products: ProductDto[] }) {
  const [lines, setLines] = useState<CartLine[] | null>(null);
  const [stock, setStock] = useState<Record<string, boolean> | null>(null);
  const [modalFor, setModalFor] = useState<ProductDto | null>(null);
  // «уходим» — корзину опустошили здесь, идёт fade-выход; в это время
  // показываем прежнее содержимое (заморожено), чтобы не мелькал пустой стейт.
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const sync = () => setLines(cart.get());
    sync();
    return cart.subscribe(sync);
  }, []);

  // последнее непустое содержимое — для «заморозки» на время выхода
  const lastLines = useRef<CartLine[]>([]);
  useEffect(() => {
    if (lines && lines.length) lastLines.current = lines;
  }, [lines]);

  // Если корзину опустошили здесь (был товар → стало пусто) — уводим назад
  // через fade: делать в пустой корзине нечего.
  const hadItems = useRef(false);
  useEffect(() => {
    if (lines === null) return;
    const n = lines.reduce((s, l) => s + l.qty, 0);
    if (n > 0) {
      hadItems.current = true;
    } else if (hadItems.current) {
      hadItems.current = false;
      setLeaving(true);
      window.dispatchEvent(
        new CustomEvent("murjak-fade-nav", { detail: { back: true } }),
      );
    }
  }, [lines]);

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

  const inStock = (p: ProductDto) => {
    const v = stock?.[String(p.id)];
    return typeof v === "boolean" ? v : p.inStock;
  };

  if (lines === null) {
    return <main className={styles.page} />;
  }

  // на время fade-выхода показываем прежнее (непустое) содержимое —
  // чтобы не мелькнул пустой стейт
  const shownLines = leaving ? lastLines.current : lines;

  // группируем позиции по товару, сохраняя порядок появления
  const order: number[] = [];
  const byId = new Map<number, CartLine[]>();
  for (const l of shownLines) {
    if (!byId.has(l.id)) {
      byId.set(l.id, []);
      order.push(l.id);
    }
    byId.get(l.id)!.push(l);
  }

  const groups: Group[] = order
    .map((id) => {
      const product = products.find((p) => p.id === id);
      if (!product) return null;
      const gl = byId.get(id)!;
      return { product, lines: gl, qty: gl.reduce((s, l) => s + l.qty, 0) };
    })
    .filter((g): g is Group => g !== null);

  const available = groups.filter((g) => inStock(g.product));
  const unavailable = groups.filter((g) => !inStock(g.product));
  const total = available.reduce((s, g) => s + g.product.price * g.qty, 0);
  const payQuery = available
    .flatMap((g) => g.lines.map((l) => `${l.id}:${l.size}:${l.qty}`))
    .join(",");

  // Стрелка «назад» — как на странице товара (фикс. сверху-слева, на главную)
  const backArrow = (
    <Link href="/" className={styles.back} aria-label="Назад">
      <span className={styles.backArrow} aria-hidden="true" />
    </Link>
  );

  // Пустой стейт — только при прямом заходе в пустую корзину, не во время
  // fade-выхода (иначе мелькнёт «Пока пусто»).
  if (groups.length === 0 && !leaving) {
    return (
      <main className={styles.page}>
        {backArrow}
        <div className={styles.inner}>
          <h1 className={styles.title}>Корзина</h1>
          <p className={styles.empty}>Пока пусто</p>
        </div>
      </main>
    );
  }

  const sizeLabel = (l: CartLine) =>
    (l.size ? l.size : "без размера") + (l.qty > 1 ? ` ×${l.qty}` : "");

  return (
    <main className={styles.page}>
      {backArrow}
      <div className={styles.inner}>
        <h1 className={styles.title}>Корзина</h1>

        <ul className={styles.list}>
          {groups.map(({ product, lines: gl, qty }) => {
            const ok = inStock(product);
            const photo =
              product.photos.find((p) => p.kind === "ITEM") ?? product.photos[0];
            const hasSizes = (product.sizes?.length ?? 0) > 0;
            return (
              <li
                key={product.id}
                className={`${styles.row}${ok ? "" : " " + styles.rowOff}`}
              >
                <Link href={`/products/${product.id}/`} className={styles.thumb}>
                  {photo && (
                    <Image
                      src={photo.url}
                      alt={product.name}
                      fill
                      sizes="88px"
                      className={styles.thumbImg}
                    />
                  )}
                </Link>

                <div className={styles.meta}>
                  <Link href={`/products/${product.id}/`} className={styles.name}>
                    {product.name}
                  </Link>
                  <div className={styles.price}>
                    {product.price} {config.currency}
                  </div>
                  {hasSizes && (
                    <div className={styles.sizes}>
                      {gl.map((l) => sizeLabel(l)).join(", ")}
                    </div>
                  )}
                  {!ok && <div className={styles.gone}>нет в наличии</div>}
                </div>

                <div className={styles.controls}>
                  <div className={styles.counter}>
                    <button
                      type="button"
                      aria-label="Убрать один"
                      onClick={() => cart.removeLastOf(product.id)}
                    >
                      −
                    </button>
                    <span>{qty}</span>
                    <button
                      type="button"
                      aria-label="Добавить ещё"
                      onClick={() =>
                        hasSizes ? setModalFor(product) : cart.add(product.id, "")
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {unavailable.length > 0 && (
          <p className={styles.note}>
            Товары без наличия в сумму не входят — убери их или напиши продавцу.
          </p>
        )}

        <div className={styles.footer}>
          <div className={styles.total}>
            <span>Итого</span>
            <strong>
              {total} {config.currency}
            </strong>
          </div>

          {available.length > 0 ? (
            <a
              className={styles.pay}
              href={`/api/pay.php?items=${encodeURIComponent(payQuery)}`}
            >
              Перейти к оплате
            </a>
          ) : (
            <span className={`${styles.pay} ${styles.payOff}`}>
              Нет товаров в наличии
            </span>
          )}

          <button
            type="button"
            className={styles.clear}
            onClick={() => cart.clear()}
          >
            Очистить и выйти из корзины
          </button>
        </div>
      </div>

      <SizeModal
        open={modalFor !== null}
        title={modalFor?.name ?? ""}
        sizes={modalFor?.sizes ?? []}
        onClose={() => setModalFor(null)}
        onDone={(size) => {
          if (modalFor) cart.add(modalFor.id, size);
          setModalFor(null);
        }}
      />
    </main>
  );
}
