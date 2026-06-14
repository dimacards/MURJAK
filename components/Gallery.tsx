"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import styles from "./Gallery.module.css";

type Slide =
  | { type: "image"; src: string }
  | { type: "video"; src: string };

/**
 * Галерея товара: лента всех медиа (фото + видео) со scroll-snap.
 * Видео — такой же слайд карусели (после фото). Листается колесом/свайпом
 * ВНУТРИ галереи (overscroll-behavior: contain), страница не двигается.
 * Активный слайд — по положению скролла (IntersectionObserver).
 *
 * Миниатюры слева поверх ленты: у видео — кадр с иконкой play. Клик — плавная
 * прокрутка к слайду. Hover увеличивает поверх соседей; активная — белый строук.
 */
export function Gallery({
  photos,
  videoUrl,
  title,
}: {
  photos: string[];
  videoUrl?: string | null;
  title: string;
}) {
  const slides: Slide[] = [
    ...photos.map((src) => ({ type: "image" as const, src })),
    ...(videoUrl ? [{ type: "video" as const, src: videoUrl }] : []),
  ];
  const total = slides.length;

  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

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
    return <div className={styles.empty}>Нет медиа</div>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.track} ref={trackRef}>
        {slides.map((s, i) => (
          <div
            key={i}
            className={styles.slide}
            data-i={i}
            ref={(el) => {
              slideRefs.current[i] = el;
            }}
          >
            {s.type === "image" ? (
              <Image
                src={s.src}
                alt={`${title} — ${i + 1} из ${total}`}
                fill
                sizes="(min-width: 768px) 65vw, 100vw"
                className={styles.slideImage}
                priority={i === 0}
              />
            ) : (
              <video
                className={styles.slideVideo}
                src={s.src}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            )}
          </div>
        ))}
      </div>

      {total > 1 && (
        <div className={styles.thumbs}>
          {slides.map((s, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.thumb} ${i === index ? styles.thumbActive : ""}`}
              onClick={() => scrollTo(i)}
              aria-label={s.type === "video" ? "Видео" : `Фото ${i + 1}`}
              aria-current={i === index}
            >
              {s.type === "image" ? (
                <Image
                  src={s.src}
                  alt=""
                  width={40}
                  height={40}
                  sizes="40px"
                  className={styles.thumbImage}
                />
              ) : (
                <span className={styles.thumbVideoWrap}>
                  <video
                    className={styles.thumbVideo}
                    src={s.src}
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <span className={styles.thumbPlay} aria-hidden="true">
                    ▶
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
