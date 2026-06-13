"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { Footer } from "./Footer";
import { ProductGrid } from "./ProductGrid";
import styles from "@/app/page.module.css";

/**
 * Снап-механика первого экрана.
 *
 * Конечный автомат:
 *   intro    — hero на весь экран, свободный скролл придержан
 *              (preventDefault на wheel/touchmove/клавишах-вниз).
 *              Первый жест вниз — триггер.
 *   snapping — управляемый rAF-доезд до начала секции «Товары»
 *              (easeInOutCubic, без инерции, ровно в точку) + анимация
 *              трансформации hero (класс heroDocked). Любой ввод гасится.
 *   docked   — после доезда (+50 мс пауза) обычный свободный скролл.
 *
 * Переходы:
 *   intro    --(жест вниз)-->                 snapping
 *   snapping --(доезд завершён, +50мс)-->      docked
 *   docked   --(scrollY доехал до 0,          intro
 *               авто-возврат не подавлен)-->
 *
 * suppressReturnRef — на время будущей программной навигации (меню → блок)
 * подавляет авто-возврат в intro, чтобы геройское состояние не мелькало.
 */
type SnapState = "intro" | "snapping" | "docked";

const SNAP_DURATION = 850; // мс — длительность управляемого доезда
const RELEASE_PAUSE = 50; // мс — пауза перед снятием придержки (успокоить поток)

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function HomeShell({ items }: { items: ProductDto[] }) {
  const [state, setState] = useState<SnapState>("intro");

  // Refs для чтения актуального состояния внутри слушателей (без stale-closure).
  const stateRef = useRef<SnapState>("intro");
  const productsRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const suppressReturnRef = useRef(false);

  const setSnapState = (s: SnapState) => {
    stateRef.current = s;
    setState(s);
  };

  useEffect(() => {
    // Всегда стартуем с верха: гасим восстановление позиции браузером.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    /** Управляемый доезд до targetY за duration, без инерции, с колбэком. */
    const tweenTo = (targetY: number, duration: number, onDone: () => void) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const startY = window.scrollY;
      const dist = targetY - startY;
      const start = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        window.scrollTo(0, Math.round(startY + dist * easeInOutCubic(t)));
        if (t < 1) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          rafRef.current = null;
          onDone();
        }
      };
      rafRef.current = requestAnimationFrame(frame);
    };

    const targetY = () => {
      const el = productsRef.current;
      if (!el) return window.innerHeight;
      return Math.round(el.getBoundingClientRect().top + window.scrollY);
    };

    const snap = () => {
      if (stateRef.current !== "intro") return;
      setSnapState("snapping");
      tweenTo(targetY(), SNAP_DURATION, () => {
        // короткая пауза, чтобы поток scroll-событий «успокоился»
        window.setTimeout(() => setSnapState("docked"), RELEASE_PAUSE);
      });
    };

    const returnToIntro = () => {
      if (stateRef.current !== "docked") return;
      // scroll уже на 0 — просто реверсим анимацию hero и снова придерживаем.
      setSnapState("intro");
    };

    // ── Слушатели ────────────────────────────────────────────────────────
    const onWheel = (e: WheelEvent) => {
      const st = stateRef.current;
      if (st === "intro") {
        e.preventDefault(); // придерживаем «пиксель-в-пиксель» скролл
        if (e.deltaY > 0) snap(); // первый жест вниз — триггер
      } else if (st === "snapping") {
        e.preventDefault(); // во время доезда ввод гасим
      }
      // docked — свободно
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartYRef.current = e.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (e: TouchEvent) => {
      const st = stateRef.current;
      if (st === "intro") {
        e.preventDefault(); // глушим нативный скролл/fling
        const y = e.touches[0]?.clientY ?? 0;
        const startY = touchStartYRef.current;
        // палец пошёл вверх (контент вниз) > порога — стартуем доезд
        if (startY != null && startY - y > 6) snap();
      } else if (st === "snapping") {
        e.preventDefault();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (stateRef.current !== "intro") return;
      if (
        e.key === "ArrowDown" ||
        e.key === "PageDown" ||
        e.key === " " ||
        e.key === "Spacebar"
      ) {
        e.preventDefault();
        snap();
      }
    };

    const onScroll = () => {
      // авто-возврат в intro ТОЛЬКО при реальном доскролле до самого верха
      if (
        stateRef.current === "docked" &&
        !suppressReturnRef.current &&
        window.scrollY <= 0
      ) {
        returnToIntro();
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const heroDocked = state !== "intro";

  return (
    <>
      <section
        className={`${styles.hero} ${heroDocked ? styles.heroDocked : ""}`}
      >
        <video
          className={styles.heroVideo}
          src={config.heroVideoUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <div className={styles.heroLogoWrap}>
          <Image
            src="/brand/murjak-logo.svg"
            alt={config.storeName}
            width={1959}
            height={506}
            className={styles.heroLogo}
            priority
          />
        </div>
      </section>

      <section ref={productsRef} className={styles.products}>
        <div className={styles.productsInner}>
          <ProductGrid items={items} />
        </div>
      </section>

      <Footer />
    </>
  );
}
