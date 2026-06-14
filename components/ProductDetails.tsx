import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { TelegramIcon } from "./TelegramIcon";
import { ShareButton } from "./ShareButton";
import styles from "./ProductDetails.module.css";

/**
 * Инфо-панель товара в стиле LIME, адаптированная под наш UI:
 *  - без «карты»-бокса, контент прямо на фоне, по левому краю;
 *  - заголовок (капсом) + кнопка «поделиться» в одну строку;
 *  - цена;
 *  - крупная CTA на всю ширину («Написать продавцу» вместо «в корзину»);
 *  - описание/особенности ниже списком с тонкими дивайдерами.
 */
export function ProductDetails({ product }: { product: ProductDto }) {
  const message =
    `Здравствуйте! Интересует товар №${product.id} ` +
    `«${product.name}» (${product.price} ${config.currency})`;
  const buyHref = `https://t.me/${config.sellerUsername}?text=${encodeURIComponent(message)}`;

  const cta = product.inStock ? (
    <a href={buyHref} rel="noopener" className={styles.cta}>
      <TelegramIcon size={18} />
      <span>Написать продавцу</span>
    </a>
  ) : (
    <span className={`${styles.cta} ${styles.ctaDisabled}`} aria-disabled="true">
      <TelegramIcon size={18} />
      <span>Нет в наличии</span>
    </span>
  );

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

      {/* CTA — под описанием */}
      {cta}
    </div>
  );
}
