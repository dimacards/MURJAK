"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal } from "./Reveal";
import styles from "./CardistryTimeline.module.css";

export type TimelineItem = {
  year: string;
  event: string;
  img: string | null;
  /** сторона раскладки: "left" — фото слева/текст слева; "right" — фото справа,
   *  текст по правому краю. По умолчанию: с фото — слева, без фото — справа. */
  align?: "left" | "right";
};

/**
 * Вертикальный таймлайн эпохи. Стрелка-ось «вытягивается» по скроллу секции.
 * События разложены по сетке хаотично (год и фото в разных колонках), фото
 * крупные и без обрезки — заполняют пустое пространство.
 */
export function CardistryTimeline({
  items,
  dense,
}: {
  items: TimelineItem[];
  /** плотнее: меньше вертикальный отступ между событиями */
  dense?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;

    const measure = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const refY = vh * 0.62; // 0 — верх на 62% экрана; 1 — низ дошёл туда же
      const p = (refY - r.top) / Math.max(1, r.height);
      setProgress(Math.max(0, Math.min(1, p)));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.timeline}${dense ? " " + styles.dense : ""}`}
    >
      <div
        className={styles.arrow}
        style={{
          height: `${progress * 100}%`,
          // изначально стрелки нет — появляется из фейда по мере роста
          opacity: Math.min(1, progress / 0.05),
        }}
        aria-hidden="true"
      />

      <div className={styles.events}>
        {items.map((t) => {
          const hasImg = !!t.img;
          const align = t.align ?? (hasImg ? "left" : "right");
          const sideClass = hasImg
            ? align === "right"
              ? styles.alignRight
              : styles.alignLeft
            : align === "left"
              ? styles.noPhotoLeft
              : styles.noPhotoRight;
          return (
            <div key={t.year} className={`${styles.event} ${sideClass}`}>
              <Reveal className={styles.body}>
                <span className={styles.year}>{t.year}</span>
                <p className={styles.caption}>{t.event}</p>
              </Reveal>
              {t.img && (
                <Reveal as="figure" className={styles.frame} delay={140}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.img}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={styles.mediaImg}
                  />
                </Reveal>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
