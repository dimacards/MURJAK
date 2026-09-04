import Link from "next/link";
import Image from "next/image";
import config from "@/lib/config";
import type { PhotoKind, ProductDto } from "@/lib/api-types";
import styles from "./ProductCard.module.css";

/**
 * Карточка товара в сетке (тёмная тема по макету).
 *
 * preferredKind — какой тип фото показывать (ITEM «вещь» / MODEL «на модели»).
 * При наведении курсора показывается вторая фотография (opacity-свап).
 */
export function ProductCard({
  product,
  preferredKind,
}: {
  product: ProductDto;
  preferredKind?: PhotoKind;
}) {
  const ofKind = preferredKind
    ? product.photos.filter((p) => p.kind === preferredKind)
    : product.photos;
  const pool = ofKind.length > 0 ? ofKind : product.photos;

  const primary = pool[0];
  const secondary = pool[1];
  const glow = product.glow ? " " + styles.glow : "";

  return (
    <Link href={`/products/${product.id}`} className={styles.card}>
      <div className={styles.imageWrap}>
        {primary ? (
          <>
            <Image
              src={primary.url}
              alt={product.name}
              fill
              sizes="(min-width: 768px) 33vw, 50vw"
              className={`${styles.image}${glow}`}
            />
            {secondary && (
              <Image
                src={secondary.url}
                alt=""
                fill
                sizes="(min-width: 768px) 33vw, 50vw"
                className={`${styles.imageHover}${glow}`}
              />
            )}
          </>
        ) : (
          <div className={styles.imagePlaceholder} aria-hidden="true" />
        )}
        {!product.inStock && (
          <div className={styles.outOfStockOverlay}>
            <span>сейчас нет в наличии</span>
          </div>
        )}
      </div>

      <div className={styles.title}>{product.name}</div>
      <div className={styles.price}>
        {product.price} {config.currency}
      </div>
    </Link>
  );
}
