"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import styles from "./Gallery.module.css";

/**
 * Галерея товара: большое фото заполняет весь контейнер (cover).
 *
 * Миниатюры — маленькие, вертикальной колонкой слева ПОВЕРХ фото,
 * над каждой её номер. В покое полупрозрачные; hover — увеличиваются
 * и становятся непрозрачными; активная — непрозрачная с белой рамкой.
 *
 * Управление: клик по миниатюре, клавиатура ←/→, свайп на тач-экране.
 */
export function Gallery({
  photos,
  title,
}: {
  photos: string[];
  title: string;
}) {
  const [index, setIndex] = useState(0);
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

  // Свайп пальцем по фото: |dx| > 50px и горизонтальный жест — листаем.
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
    <div
      className={styles.root}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <Image
        src={photos[index]}
        alt={`${title} — фото ${index + 1} из ${total}`}
        fill
        sizes="(min-width: 768px) 65vw, 100vw"
        className={styles.mainImage}
        priority={index === 0}
      />

      {total > 1 && (
        <div className={styles.thumbs}>
          {photos.map((src, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.thumb} ${i === index ? styles.thumbActive : ""}`}
              onClick={() => setIndex(i)}
              aria-label={`Фото ${i + 1}`}
              aria-current={i === index}
            >
              <span className={styles.thumbNum}>{i + 1}</span>
              <span className={styles.thumbImageWrap}>
                <Image
                  src={src}
                  alt=""
                  width={48}
                  height={48}
                  sizes="48px"
                  className={styles.thumbImage}
                />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
