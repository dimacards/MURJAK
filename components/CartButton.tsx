"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cart } from "@/lib/cart";
import { CartIcon } from "./CartIcon";
import styles from "./CartButton.module.css";

/**
 * Иконка корзины сверху-справа, слева от бургера.
 *  • пусто — приглушённый вид с блюром (как фантомные надписи), без hover,
 *    некликабельна: заходить в пустую корзину незачем;
 *  • есть товары — белая, кликабельная, со счётчиком в кружке.
 */
export function CartButton() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(cart.count());
    sync();
    return cart.subscribe(sync);
  }, []);

  if (count === 0) {
    return (
      <span className={`${styles.button} ${styles.inactive}`} aria-hidden="true">
        <CartIcon size={24} />
      </span>
    );
  }

  return (
    <Link
      href="/cart/"
      className={`${styles.button} ${styles.active}`}
      aria-label={`Корзина, товаров: ${count}`}
    >
      <CartIcon size={24} />
      <span className={styles.badge}>{count}</span>
    </Link>
  );
}
