"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProductDto } from "@/lib/api-types";
import { cart } from "@/lib/cart";
import { SizeModal } from "./SizeModal";
import styles from "./AddToCartFlow.module.css";

/**
 * Сценарий покупки на странице товара:
 *  1. Нет в корзине → одна кнопка «Добавить в корзину».
 *     Клик → модалка размера (у одежды) или сразу добавить (подвеска).
 *  2. Есть в корзине → счётчик [− N +] (серый, без обводки) + белая кнопка
 *     «Перейти в корзину» той же ширины.
 *     «+» снова открывает модалку размера; «−» убирает последний размер.
 */
export function AddToCartFlow({
  product,
  disabled = false,
}: {
  product: ProductDto;
  disabled?: boolean;
}) {
  // count=0 и на сервере, и на первом клиентском рендере → без гидрационных
  // расхождений; эффект подставит реальное число из localStorage после монтажа.
  const [shownCount, setShownCount] = useState(0);
  const [modal, setModal] = useState(false);

  const hasSizes = (product.sizes?.length ?? 0) > 0;

  useEffect(() => {
    const sync = () => setShownCount(cart.countOf(product.id));
    sync();
    return cart.subscribe(sync);
  }, [product.id]);

  const addOne = () => {
    if (hasSizes) setModal(true);
    else cart.add(product.id, "");
  };

  if (disabled) {
    return (
      <div className={styles.wrap}>
        <span className={`${styles.add} ${styles.addDisabled}`} aria-disabled="true">
          Нет в наличии
        </span>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {shownCount === 0 ? (
        <button type="button" className={styles.add} onClick={addOne}>
          Добавить в корзину
        </button>
      ) : (
        <>
          <div className={styles.counter}>
            <button
              type="button"
              aria-label="Убрать один"
              onClick={() => cart.removeLastOf(product.id)}
            >
              −
            </button>
            <span>{shownCount}</span>
            <button type="button" aria-label="Добавить ещё" onClick={addOne}>
              +
            </button>
          </div>
          <Link href="/cart/" className={styles.toCart}>
            Перейти в корзину
          </Link>
        </>
      )}

      <SizeModal
        open={modal}
        title={product.name}
        sizes={product.sizes ?? []}
        onClose={() => setModal(false)}
        onDone={(size) => {
          cart.add(product.id, size);
          setModal(false);
        }}
      />
    </div>
  );
}
