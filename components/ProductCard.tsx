import Link from "next/link";
import Image from "next/image";
import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import styles from "./ProductCard.module.css";

/**
 * Карточка товара в сетке. Кликабельна целиком (вся карточка → /products/[id]).
 *
 * Иерархия:
 *   1) фото 1:1 (с плашкой «нет в наличии» поверх если inStock=false)
 *   2) название
 *   3) цена
 *
 * Features здесь НЕ показываем — только на открытой карточке товара.
 */
export function ProductCard({ product }: { product: ProductDto }) {
  return (
    <Link href={`/products/${product.id}`} className={styles.card}>
      <div className={styles.imageWrap}>
        {product.photos[0] ? (
          <Image
            src={product.photos[0]}
            alt={product.name}
            fill
            // на мобилке карточка ≈ половина viewport, на десктопе ≈ 280px
            sizes="(min-width: 768px) 280px, 50vw"
            className={styles.image}
          />
        ) : (
          <div className={styles.imagePlaceholder} aria-hidden="true" />
        )}
        {!product.inStock && (
          <div className={styles.outOfStockBadge}>нет в наличии</div>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.title}>{product.name}</div>
        <div className={styles.price}>
          {product.price} {config.currency}
        </div>
      </div>
    </Link>
  );
}
