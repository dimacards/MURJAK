import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { ShareButton } from "./ShareButton";
import { AddToCartFlow } from "./AddToCartFlow";
import styles from "./ProductDetails.module.css";

/**
 * Инфо-панель товара:
 *  - заголовок (капсом) + кнопка «поделиться» в одну строку;
 *  - цена;
 *  - описание/особенности списком с тонкими дивайдерами;
 *  - снизу — сценарий покупки (кнопка «Добавить в корзину» → счётчик +
 *    «Перейти в корзину»), см. AddToCartFlow.
 */
export function ProductDetails({ product }: { product: ProductDto }) {
  return (
    <div className={styles.info}>
      <div className={styles.head}>
        <h1 className={styles.title}>{product.name}</h1>
        <ShareButton className={styles.share} />
      </div>

      <div className={styles.price}>
        {product.price} {config.currency}
      </div>

      {!product.inStock && (
        <div className={styles.outOfStock}>Нет в наличии</div>
      )}

      {product.features.length > 0 && (
        <ul className={styles.features}>
          {product.features.map((f, idx) => (
            <li key={idx} className={styles.featureItem}>
              {f}
            </li>
          ))}
        </ul>
      )}

      {/* Сценарий покупки — под описанием */}
      <div className={styles.ctaRow}>
        <AddToCartFlow product={product} disabled={!product.inStock} />
      </div>
    </div>
  );
}
