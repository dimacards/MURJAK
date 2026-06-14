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
  const rootRef = useRef<HTMLDivElement>(null);

  // клампим (не зацикливаем) — листаем «доезжая» к краям
  const goPrev = () => setIndex((v) => Math.max(0, v - 1));
  const goNext = () => setIndex((v) => Math.min(total - 1, v + 1));

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

  // Скролл над галереей листает фото со сменой через fade (не лента).
  // Компромисс между «нельзя пролистать без движения курсора» и инерцией:
  //  - на активном толчке листаем сразу и ставим короткий замок ПО ТАЙМЕРУ
  //    (release по времени, а не по остановке событий → курсор двигать не нужно);
  //  - инерционный хвост после замка отсекаем по динамике: сравниваем среднюю
  //    скорость последних событий со средней более ранних — если затухаем
  //    (end < middle), это инерция, не листаем; на новом активном толчке
  //    среднее снова растёт и флип срабатывает мгновенно;
  //  - пауза >200мс между событиями = новый жест, чистим историю.
  // Только на десктопе (≥768) — на мобилке скроллится страница, листание свайпом.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || total <= 1) return;
    let speeds: number[] = [];
    let prevTime = 0;
    let canFire = true;
    let unlockTimer: ReturnType<typeof setTimeout> | null = null;
    const LOCK_MS = 420; // ~длительность анимации смены слайда
    const avg = (n: number) => {
      const part = speeds.slice(-n);
      return part.length ? part.reduce((a, b) => a + b, 0) / part.length : 0;
    };
    const onWheel = (e: WheelEvent) => {
      if (window.innerWidth < 768) return; // мобилка: не перехватываем скролл
      e.preventDefault();
      const now = performance.now();
      const v = Math.abs(e.deltaY);
      if (now - prevTime > 200) speeds = []; // новый жест после паузы
      prevTime = now;
      if (speeds.length > 80) speeds.shift();
      speeds.push(v);
      if (!canFire || v < 2) return;
      // ускоряемся (активный толчок) или затухаем (инерция)?
      if (avg(8) < avg(30)) return; // затухание — это инерция, пропускаем
      canFire = false;
      if (unlockTimer) clearTimeout(unlockTimer);
      unlockTimer = setTimeout(() => {
        canFire = true;
      }, LOCK_MS);
      if (e.deltaY > 0) goNext();
      else goPrev();
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
      if (unlockTimer) clearTimeout(unlockTimer);
    };
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
    <div className={styles.root} ref={rootRef}>
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
