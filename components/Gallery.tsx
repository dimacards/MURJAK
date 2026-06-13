"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import styles from "./Gallery.module.css";

/**
 * Галерея товара.
 *
 * Большое медиа — вертикальная (на мобилке горизонтальная) лента всех фото
 * со scroll-snap: листается колесом/свайпом ВНУТРИ галереи, страница при
 * этом не двигается (overscroll-behavior: contain). Активное фото
 * определяется по положению скролла (IntersectionObserver).
 *
 * Миниатюры — маленькие, колонкой слева поверх ленты, без номеров.
 * В покое полупрозрачные с серым строуком; hover — увеличиваются ПОВЕРХ
 * соседей (transform: scale, не обрезаясь) и становятся ярче; активная —
 * белый строук. Клик — плавная прокрутка к выбранному фото.
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
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Активный слайд — тот, что максимально в зоне видимости ленты.
  useEffect(() => {
    const root = trackRef.current;
    if (!root || total <= 1) return;
    const io = new IntersectionObserver(
      (entries) => {
        let best: { i: number; ratio: number } | null = null;
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.i);
          if (!best || e.intersectionRatio > best.ratio) {
            best = { i, ratio: e.intersectionRatio };
          }
        }
        if (best && best.ratio > 0.5) setIndex(best.i);
      },
      { root, threshold: [0.5, 0.75, 1] },
    );
    slideRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [total]);

  const scrollTo = (i: number) => {
    slideRefs.current[i]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  };

  if (total === 0) {
    return <div className={styles.empty}>Нет фотографий</div>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.track} ref={trackRef}>
        {photos.map((src, i) => (
          <div
            key={i}
            className={styles.slide}
            data-i={i}
            ref={(el) => {
              slideRefs.current[i] = el;
            }}
          >
            <Image
              src={src}
              alt={`${title} — фото ${i + 1} из ${total}`}
              fill
              sizes="(min-width: 768px) 65vw, 100vw"
              className={styles.slideImage}
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      {total > 1 && (
        <div className={styles.thumbs}>
          {photos.map((src, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.thumb} ${i === index ? styles.thumbActive : ""}`}
              onClick={() => scrollTo(i)}
              aria-label={`Фото ${i + 1}`}
              aria-current={i === index}
            >
              <Image
                src={src}
                alt=""
                width={40}
                height={40}
                sizes="40px"
                className={styles.thumbImage}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
