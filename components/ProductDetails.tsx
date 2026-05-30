import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { BuyButton } from "./BuyButton";
import styles from "./ProductDetails.module.css";

/**
 * Правая колонка на странице товара: иерархичная информация о товаре.
 *
 * Структура:
 *   • Название (h1, крупно)
 *   • Цена
 *   • Список характеристик (Категория / Размер / Состояние)
 *   • Большая кнопка «Купить в Telegram»
 *   • Хелп-текст под кнопкой
 */
export function ProductDetails({ product }: { product: ProductDto }) {
  const title = product.description || product.category;

  const rows = [
    { label: "Категория", value: product.category },
    { label: "Размер", value: product.size },
    { label: "Состояние", value: `${product.condition} / 10` },
  ];

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>{title}</h1>

      <div className={styles.price}>
        {product.price} {config.currency}
      </div>

      <dl className={styles.specs}>
        {rows.map((r) => (
          <div key={r.label} className={styles.specRow}>
            <dt className={styles.specLabel}>{r.label}</dt>
            <dd className={styles.specValue}>{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.buyWrap}>
        <BuyButton
          productId={product.id}
          productTitle={title}
          size={product.size}
          price={product.price}
        />
        <p className={styles.help}>
          При нажатии вы перейдёте в Telegram для оформления покупки.
        </p>
      </div>
    </div>
  );
}
