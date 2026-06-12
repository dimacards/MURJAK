import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { BuyButton } from "./BuyButton";
import styles from "./ProductDetails.module.css";

/**
 * Инфо-карточка товара в виде «игральной карты» (макет Figma):
 * чёрная, с толстой белой рамкой и скруглением. Перекрывает медиа-блок.
 *
 * Структура:
 *   • Название (по центру)
 *   • Цена (по центру)
 *   • Плашка «нет в наличии» (если inStock=false)
 *   • Список features с тонкими разделителями
 *   • Кнопка «Написать продавцу»
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
      </div>
    </div>
  );
}
