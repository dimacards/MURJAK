"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import styles from "./Reveal.module.css";

type RevealProps = {
  children: ReactNode;
  /** какой тег рендерить (div по умолчанию) — чтобы не ломать flex/grid-сетку */
  as?: ElementType;
  /** задержка появления, мс — для лёгкого стаггера внутри секции */
  delay?: number;
  /** доп. классы исходного элемента (например, styles.body) */
  className?: string;
};

/**
 * Плавное появление при попадании в зону видимости: opacity 0 → 1.
 * — срабатывает один раз (после disconnect не повторяется при скролле назад);
 * — только opacity (без layout-перерисовок);
 * — при prefers-reduced-motion показывает контент сразу, без анимации.
 */
export function Reveal({ children, as: Tag = "div", delay = 0, className = "" }: RevealProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // prefers-reduced-motion обрабатывается в CSS (всё видно сразу).
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect(); // один раз
            return;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`${styles.reveal}${shown ? " " + styles.shown : ""}${
        className ? " " + className : ""
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
