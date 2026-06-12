"use client";

import { useState } from "react";
import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { TelegramIcon } from "./TelegramIcon";
import styles from "./ProductDetails.module.css";

/**
 * Раскрывающийся блок информации (макет Figma):
 *
 * Свёрнут — закреплён снизу по центру: название, цена и две кнопки
 * («Полное описание» + «Написать продавцу»).
 *
 * По клику на «Полное описание» блок плавно перемещается в центр экрана,
 * остальная страница затемняется, раскрывается список особенностей.
 * Закрытие — «✕ Скрыть описание» или клик по затемнению.
 */
export function ProductDetails({ product }: { product: ProductDto }) {
  const [open, setOpen] = useState(false);

  const message =
    `Здравствуйте! Интересует товар №${product.id} ` +
    `«${product.name}» (${product.price} ${config.currency})`;
  const buyHref = `https://t.me/${config.sellerUsername}?text=${encodeURIComponent(message)}`;

  const buyButton = product.inStock ? (
    <a href={buyHref} rel="noopener" className={styles.buyBtn}>
      <TelegramIcon size={18} />
      <span>Написать продавцу</span>
    </a>
  ) : (
    <span className={`${styles.buyBtn} ${styles.buyBtnDisabled}`} aria-disabled="true">
      <TelegramIcon size={18} />
      <span>Нет в наличии</span>
    </span>
  );

  return (
    <>
      {/* затемнение всего остального; клик по нему закрывает */}
      <div
        className={`${styles.backdrop} ${open ? styles.backdropVisible : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <section
        className={`${styles.card} ${open ? styles.cardOpen : ""}`}
        aria-label="Информация о товаре"
      >
        {/* «✕ Скрыть описание» — виден только в раскрытом состоянии */}
        <button
          type="button"
          className={styles.hideBtn}
          onClick={() => setOpen(false)}
          tabIndex={open ? 0 : -1}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 3 L13 13 M13 3 L3 13"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <span>Скрыть описание</span>
        </button>

        <h1 className={styles.title}>{product.name}</h1>
        <div className={styles.price}>
          {product.price} {config.currency}
        </div>

        {!product.inStock && (
          <div className={styles.outOfStock}>Нет в наличии</div>
        )}

        {/* особенности — раскрываются вместе с блоком */}
        {product.features.length > 0 && (
          <div className={styles.featuresWrap}>
            <ul className={styles.features}>
              {product.features.map((f, i) => (
                <li key={i} className={styles.featureItem}>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.actions}>
          {product.features.length > 0 && (
            <button
              type="button"
              className={`${styles.descBtn} ${open ? styles.descBtnHidden : ""}`}
              onClick={() => setOpen(true)}
              tabIndex={open ? -1 : 0}
            >
              Полное описание
            </button>
          )}
          {buyButton}
        </div>
      </section>
    </>
  );
}
