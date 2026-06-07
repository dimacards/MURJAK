import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { BuyButton } from "./BuyButton";
import styles from "./ProductDetails.module.css";

/**
 * Правая колонка на странице товара.
 *
 * Структура:
 *   • Название (h1)
 *   • Цена
 *   • Плашка «нет в наличии» если inStock=false
 *   • Список features (если есть)
 *   • Кнопка «Написать продавцу» (или «Нет в наличии», если inStock=false)
 */
export function ProductDetails({ product }: { product: ProductDto }) {
  return (
    <div className={styles.root}>
      <h1 className={styles.title}>{product.name}</h1>

      <div className={styles.price}>
        {product.price} {config.currency}
      </div>

      {!product.inStock && (
        <div className={styles.outOfStock}>Нет в наличии</div>
      )}

      {product.features.length > 0 && (
        <ul className={styles.features}>
          {product.features.map((f, i) => (
            <li key={i} className={styles.featureItem}>
              {f}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.buyWrap}>
        <BuyButton
          productId={product.id}
          productName={product.name}
          price={product.price}
          disabled={!product.inStock}
        />
        <p className={styles.help}>
          {product.inStock
            ? "При нажатии вы перейдёте в Telegram для оформления покупки."
            : "Этот товар сейчас недоступен."}
        </p>
      </div>
    </div>
  );
}
