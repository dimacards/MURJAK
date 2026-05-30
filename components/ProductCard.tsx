import Link from "next/link";
import Image from "next/image";
import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import styles from "./ProductCard.module.css";

/**
 * Карточка товара в сетке. Кликабельна целиком (вся карточка → /products/[id]).
 * Кнопки «Купить» НЕТ — она живёт только на странице товара, чтобы
 * пользователь сначала увидел все фото и описание.
 *
 * Изображение — next/image с fill+sizes. Браузер сам выберет подходящий
 * размер из набора (webp/avif), не нагружая мобилки полным разрешением.
 *
 * Иерархия (по запросу):
 *   1) фото 1:1
 *   2) название (description, акцент — 600 weight)
 *   3) цена
 *   4) серая строка характеристик: «категория · размер · состояние N/10»
 */
export function ProductCard({ product }: { product: ProductDto }) {
  const title = product.description || product.category;
  const specs = [
    product.category,
    `размер ${product.size}`,
    `состояние ${product.condition}/10`,
  ].join(" · ");

  return (
    <Link href={`/products/${product.id}`} className={styles.card}>
      <div className={styles.imageWrap}>
        {product.photos[0] ? (
          <Image
            src={product.photos[0]}
            alt={title}
            fill
            // на мобилке карточка ≈ половина viewport, на десктопе ≈ 280px
            // (контейнер 1200 / 4 колонки минус gap)
            sizes="(min-width: 768px) 280px, 50vw"
            className={styles.image}
          />
        ) : (
          <div className={styles.imagePlaceholder} aria-hidden="true" />
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        <div className={styles.price}>
          {product.price} {config.currency}
        </div>
        <div className={styles.specs}>{specs}</div>
      </div>
    </Link>
  );
}
