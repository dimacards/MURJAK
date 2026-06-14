import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { TelegramIcon } from "./TelegramIcon";
import styles from "./ProductDetails.module.css";

/**
 * Блок информации о товаре — статичная «игральная карта» (#1a1a1a, рамка-скругление,
 * тень). Всегда в раскрытом виде: название, цена, список особенностей, кнопка
 * «Написать продавцу». Сворачивания/двух стейтов больше нет.
 *
 * Располагается справа (на месте бывшего видео — оно теперь в карусели слева).
 */
export function ProductDetails({ product }: { product: ProductDto }) {
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
    <span
      className={`${styles.buyBtn} ${styles.buyBtnDisabled}`}
      aria-disabled="true"
    >
      <TelegramIcon size={18} />
      <span>Нет в наличии</span>
    </span>
  );

  return (
    <section className={styles.card} aria-label="Информация о товаре">
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

      <div className={styles.buyWrap}>{buyButton}</div>
    </section>
  );
}
