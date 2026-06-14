"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductDto } from "@/lib/api-types";
import config from "@/lib/config";
import { Footer } from "./Footer";
import { LogoSvg } from "./LogoSvg";
import { ProductGrid } from "./ProductGrid";
import styles from "@/app/page.module.css";

/**
 * Снап-механика первого экрана + переезд логотипа.
 *
 * FSM (управляет ПОЛОЖЕНИЕМ скролла):
 *   hero     — видео на весь вьюпорт, scrollY придержан на 0.
 *              Жест ВНИЗ — снап вперёд к брендовому блоку.
 *   snapping — управляемый rAF-доезд (easeInOutCubic) до цели; ввод гасится.
 *   docked   — зона контента (бренд-блок → товары). Свободный скролл, верхняя
 *              граница придержана: жест ВВЕРХ на ней — обратный снап.
 *
 * Логотип — ДВА экземпляра, переключаются на границе (где их позиции
 * совпадают пиксель-в-пиксель):
 *   • logoFixed (overlay, position:fixed) — виден в hero/snapping. Анимация
 *     переезда/масштаба — CSS-transition 0.6s cubic-bezier(.4,0,.2,1), как у
 *     блока информации в карточке (а не привязка к scrollY → нет джиттера).
 *   • logoStatic (в потоке брендового блока, над текстом) — виден в docked.
 *     Едет вместе с текстом нативным скроллом → «прилипает» к надписи,
 *     не прыгает.
 *
 * Снятие инерции после доезда — по «тишине» ввода (QUIET_MS): держим цель,
 * пока поток событий не замолчит (чистая остановка без «фантомного» доезда).
 */
type SnapState = "hero" | "snapping" | "docked";

const SNAP_DURATION = 850;
const QUIET_MS = 30;
const EDGE = 2;
const THRESH = 6;
const LOGO_RATIO = 1959.53 / 506.385;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function HomeShell({ items }: { items: ProductDto[] }) {
  const [state, setState] = useState<SnapState>("hero");
  const [logoBig, setLogoBig] = useState(true); // логотип в «геройском» размере
  const [bigScale, setBigScale] = useState(10); // во сколько раз увеличить 32px

  const stateRef = useRef<SnapState>("hero");
  const targetRef = useRef<HTMLElement>(null); // брендовый блок — цель снапа

  const setSnapState = (s: SnapState) => {
    stateRef.current = s;
    setState(s);
  };

  // Масштаб hero-логотипа: 32px-база → ~ширина вьюпорта (пересчёт на ресайз).
  useEffect(() => {
    const calc = () => {
      const heroW = Math.min(window.innerWidth * 0.92, 1760);
      const heroH = heroW / LOGO_RATIO;
      setBigScale(heroH / 32);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    let tweenRaf: number | null = null;
    let watchdog: number | null = null;
    let holdTarget = 0;
    let tweenDone = false;
    let lastInput = 0;
    let touchStartY: number | null = null;

    const targetTop = () =>
      targetRef.current ? targetRef.current.offsetTop : window.innerHeight;

    const clearWatchdog = () => {
      if (watchdog !== null) {
        window.clearInterval(watchdog);
        watchdog = null;
      }
    };

    const finalizeWhenQuiet = (after: SnapState) => {
      clearWatchdog();
      watchdog = window.setInterval(() => {
        if (performance.now() - lastInput > QUIET_MS) {
          clearWatchdog();
          tweenDone = false;
          window.scrollTo(0, holdTarget);
          setSnapState(after);
        }
      }, 16);
    };

    const tweenTo = (targetY: number, onDone: () => void) => {
      if (tweenRaf) cancelAnimationFrame(tweenRaf);
      const startY = window.scrollY;
      const dist = targetY - startY;
      const start = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / SNAP_DURATION);
        window.scrollTo(0, Math.round(startY + dist * easeInOutCubic(t)));
        if (t < 1) tweenRaf = requestAnimationFrame(frame);
        else {
          tweenRaf = null;
          onDone();
        }
      };
      tweenRaf = requestAnimationFrame(frame);
    };

    const snapForward = () => {
      if (stateRef.current !== "hero") return;
      setSnapState("snapping");
      setLogoBig(false); // CSS-переход: большой → 32px (как карточка)
      holdTarget = targetTop();
      tweenDone = false;
      tweenTo(holdTarget, () => {
        tweenDone = true;
        lastInput = performance.now();
        finalizeWhenQuiet("docked");
      });
    };

    const snapBack = () => {
      if (stateRef.current !== "docked") return;
      setSnapState("snapping");
      setLogoBig(true); // CSS-переход: 32px → большой
      holdTarget = 0;
      tweenDone = false;
      tweenTo(0, () => {
        tweenDone = true;
        lastInput = performance.now();
        finalizeWhenQuiet("hero");
      });
    };

    // ── Слушатели ────────────────────────────────────────────────────────
    const onWheel = (e: WheelEvent) => {
      const st = stateRef.current;
      lastInput = performance.now();
      if (st === "hero") {
        e.preventDefault();
        if (e.deltaY > 0) snapForward();
      } else if (st === "snapping") {
        e.preventDefault();
        if (tweenDone) window.scrollTo(0, holdTarget);
      } else {
        if (e.deltaY < 0 && window.scrollY <= targetTop() + EDGE) {
          e.preventDefault();
          snapBack();
        }
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (e: TouchEvent) => {
      const st = stateRef.current;
      lastInput = performance.now();
      const y = e.touches[0]?.clientY ?? 0;
      const sy = touchStartY ?? y;
      if (st === "hero") {
        e.preventDefault();
        if (sy - y > THRESH) snapForward();
      } else if (st === "snapping") {
        e.preventDefault();
        if (tweenDone) window.scrollTo(0, holdTarget);
      } else {
        if (y - sy > THRESH && window.scrollY <= targetTop() + EDGE) {
          e.preventDefault();
          snapBack();
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const st = stateRef.current;
      if (st === "hero") {
        if (
          e.key === "ArrowDown" ||
          e.key === "PageDown" ||
          e.key === " " ||
          e.key === "Spacebar"
        ) {
          e.preventDefault();
          lastInput = performance.now();
          snapForward();
        }
      } else if (st === "docked") {
        if (
          (e.key === "ArrowUp" || e.key === "PageUp") &&
          window.scrollY <= targetTop() + EDGE
        ) {
          e.preventDefault();
          lastInput = performance.now();
          snapBack();
        }
      }
    };

    // Придержка верхней границы зоны контента (в docked не пускаем выше начала
    // брендового блока — туда только обратным снапом).
    const onScroll = () => {
      if (stateRef.current !== "docked") return;
      const top = targetTop();
      if (window.scrollY < top) window.scrollTo(0, top);
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
      if (tweenRaf) cancelAnimationFrame(tweenRaf);
      clearWatchdog();
    };
  }, []);

  const docked = state === "docked";

  return (
    <>
      {/* Логотип-оверлей (hero / переезд). Прячем в docked — там работает
          статичный логотип в потоке брендового блока. */}
      <div
        className={styles.logoOverlay}
        style={
          {
            opacity: docked ? 0 : 1,
            "--logo-big": bigScale,
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        <LogoSvg
          className={`${styles.logoFixed} ${
            logoBig ? styles.logoFixedBig : styles.logoFixedSmall
          }`}
        />
      </div>

      {/* 1) Hero — фоновое видео */}
      <section className={styles.hero}>
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
      </section>

      {/* 2) Брендовый блок — цель снапа; статичный логотип над описанием */}
      <section ref={targetRef} className={styles.brand}>
        <LogoSvg
          className={`${styles.logoStatic} ${
            docked ? "" : styles.logoStaticHidden
          }`}
        />
        <p className={styles.brandDesc}>
          Это бренд, который занимается популяризацией кардистри
        </p>
      </section>

      {/* 3) Товары */}
      <section className={styles.products}>
        <div className={styles.productsInner}>
          <ProductGrid items={items} />
        </div>
      </section>

      <Footer />
    </>
  );
}
