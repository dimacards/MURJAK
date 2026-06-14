"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import styles from "./Gallery.module.css";

type Slide =
  | { type: "image"; src: string }
  | { type: "video"; src: string };

/**
 * Галерея товара в стиле LIME, адаптированная под наш UI:
 *  - вертикальная лента миниатюр слева (фото + видео);
 *  - крупное основное медиа в центре;
 *  - переключение кликом по миниатюре (+ стрелки ←/→, свайп на тач).
 * На мобилке миниатюры — горизонтальный ряд под основным медиа.
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
  const i = Math.min(index, Math.max(0, total - 1));

  const goPrev = () => setIndex((v) => (v - 1 + total) % total);
  const goNext = () => setIndex((v) => (v + 1) % total);

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

  // свайп по основному медиа (мобилка)
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current;
    if (!s) return;
    touchRef.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx > 0) goPrev();
    else goNext();
  };

  if (total === 0) {
    return <div className={styles.empty}>Нет медиа</div>;
  }

  const active = slides[i];

  return (
    <div className={styles.root}>
      {total > 1 && (
        <div className={styles.thumbs}>
          {slides.map((s, idx) => (
            <button
              key={idx}
              type="button"
              className={`${styles.thumb} ${idx === i ? styles.thumbActive : ""}`}
              onClick={() => setIndex(idx)}
              aria-label={s.type === "video" ? "Видео" : `Фото ${idx + 1}`}
              aria-current={idx === i}
            >
              {s.type === "image" ? (
                <Image
                  src={s.src}
                  alt=""
                  width={72}
                  height={96}
                  sizes="72px"
                  className={styles.thumbMedia}
                />
              ) : (
                <>
                  <video
                    className={styles.thumbMedia}
                    src={s.src}
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <span className={styles.thumbPlay} aria-hidden="true">
                    ▶
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      <div
        className={styles.main}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {active.type === "image" ? (
          <Image
            key={`img-${i}`}
            src={active.src}
            alt={`${title} — ${i + 1} из ${total}`}
            fill
            sizes="(min-width: 768px) 60vw, 100vw"
            className={styles.mainMedia}
            priority
          />
        ) : (
          <video
            key={`vid-${i}`}
            className={styles.mainMedia}
            src={active.src}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        )}
      </div>
    </div>
  );
}
