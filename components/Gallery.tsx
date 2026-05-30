/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Gallery.module.css";

/**
 * Галерея товара. Большое фото сверху + горизонтальный ряд thumbnails снизу.
 *
 * Управление:
 *   • клик по thumbnail → большое фото меняется
 *   • стрелки ←/→ под большим фото (полупрозрачные круги)
 *   • клавиатура: стрелки ←/→ листают
 *   • thumbnails — scroll-snap-x, можно свайпать пальцем на мобилке
 */
export function Gallery({
  photos,
  title,
}: {
  photos: string[];
  title: string;
}) {
  const [index, setIndex] = useState(0);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const total = photos.length;

  const goPrev = () => setIndex((i) => (i - 1 + total) % total);
  const goNext = () => setIndex((i) => (i + 1) % total);

  // Клавиатура: стрелки листают, только когда фокус не в input/textarea.
  useEffect(() => {
    if (total <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // Когда индекс меняется — подскролливаем активный thumbnail в видимую зону.
  useEffect(() => {
    const wrap = thumbsRef.current;
    if (!wrap) return;
    const active = wrap.querySelector<HTMLButtonElement>(
      `[data-thumb-index="${index}"]`,
    );
    active?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [index]);

  if (total === 0) {
    return <div className={styles.empty}>Нет фотографий</div>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.main}>
        <img
          src={photos[index]}
          alt={`${title} — фото ${index + 1} из ${total}`}
          className={styles.mainImage}
        />

        {total > 1 && (
          <>
            <button
              type="button"
              className={`${styles.arrow} ${styles.arrowLeft}`}
              onClick={goPrev}
              aria-label="Предыдущее фото"
            >
              ‹
            </button>
            <button
              type="button"
              className={`${styles.arrow} ${styles.arrowRight}`}
              onClick={goNext}
              aria-label="Следующее фото"
            >
              ›
            </button>
            <div className={styles.counter}>
              {index + 1} / {total}
            </div>
          </>
        )}
      </div>

      {total > 1 && (
        <div className={styles.thumbs} ref={thumbsRef}>
          {photos.map((src, i) => (
            <button
              key={i}
              type="button"
              data-thumb-index={i}
              className={`${styles.thumb} ${
                i === index ? styles.thumbActive : ""
              }`}
              onClick={() => setIndex(i)}
              aria-label={`Фото ${i + 1}`}
              aria-current={i === index}
            >
              <img
                src={src}
                alt=""
                className={styles.thumbImage}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
