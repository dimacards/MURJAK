"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import styles from "./Gallery.module.css";

/**
 * Галерея товара. Большое фото сверху + горизонтальный ряд thumbnails снизу.
 *
 * Управление:
 *   • клик по thumbnail → большое фото меняется
 *   • стрелки ←/→ под большим фото (полупрозрачные круги)
 *   • клавиатура: стрелки ←/→ листают
 *   • thumbnails — scroll-snap-x, можно свайпать пальцем на мобилке
 *   • свайп пальцем по большому фото — листает (touchstart/touchend)
 *
 * Изображения — next/image. priority=true на первое фото (LCP товара).
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

  // Свайп пальцем по большому фото.
  //
  // Логика: на touchstart запоминаем X и Y. На touchend смотрим dx/dy.
  // Если |dx| > 50px и явно горизонтальный жест (|dx| > |dy|) — листаем.
  // Иначе игнор — значит это вертикальный скролл страницы.
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    touchRef.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50) return;
    if (Math.abs(dx) < Math.abs(dy)) return; // вертикальный жест
    if (dx > 0) goPrev();
    else goNext();
  };

  if (total === 0) {
    return <div className={styles.empty}>Нет фотографий</div>;
  }

  return (
    <div className={styles.root}>
      <div
        className={styles.main}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Image
          src={photos[index]}
          alt={`${title} — фото ${index + 1} из ${total}`}
          fill
          // галерея на десктопе ~720px (3fr из 1200), на мобилке во всю ширину
          sizes="(min-width: 768px) 720px, 100vw"
          className={styles.mainImage}
          priority={index === 0}
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
              <Image
                src={src}
                alt=""
                width={80}
                height={80}
                sizes="80px"
                className={styles.thumbImage}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
