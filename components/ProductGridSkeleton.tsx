import styles from "./ProductGridSkeleton.module.css";

/**
 * Серые карточки-«скелеты» на время загрузки. Показываются вместо
 * текстового «Загрузка...». 8 штук = 2 ряда на десктопе, 4 на мобилке.
 * Анимация — плавный пульс через @keyframes.
 */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className={styles.grid} aria-busy="true" aria-label="Загрузка товаров">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className={styles.cell}>
          <div className={styles.image} />
          <div className={`${styles.line} ${styles.lineTitle}`} />
          <div className={`${styles.line} ${styles.linePrice}`} />
          <div className={`${styles.line} ${styles.lineSpecs}`} />
        </li>
      ))}
    </ul>
  );
}
