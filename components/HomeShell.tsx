"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { Footer } from "./Footer";
import { ProductGrid } from "./ProductGrid";
import styles from "@/app/page.module.css";

/**
 * Снап-механика первого экрана — симметричная, в обе стороны.
 *
 * Конечный автомат:
 *   hero     — первый экран на весь вьюпорт, scrollY придержан на 0
 *              (preventDefault на wheel/touchmove/клавишах-вниз).
 *              Жест ВНИЗ — триггер снапа вперёд.
 *   snapping — управляемый rAF-доезд (easeInOutCubic) до цели; без инерции,
 *              ровно в точку. Ввод гасится. Придержка снимается НЕ по
 *              таймеру, а по «тишине» ввода (см. ниже) — иначе остаточные
 *              инерционные события трекпада/тача доезжали бы мимо.
 *   docked   — зона товаров. Свободный скролл внутри, но верхняя граница
 *              (начало секции) придержана: жест ВВЕРХ на границе — триггер
 *              обратного снапа к hero.
 *
 * Переходы:
 *   hero   --(жест вниз)-->                       snapping --(доезд+тишина)--> docked
 *   docked --(жест вверх на верхней границе)-->    snapping --(доезд+тишина)--> hero
 *
 * Снятие инерции («доезжает чуть-чуть»): трекпад/тач после жеста шлют
 * momentum-события ещё ~0.5–1с. Поэтому после завершения твина мы НЕ
 * переключаемся сразу — держим целевую позицию и ждём, пока поток событий
 * замолчит на QUIET мс, гася каждый остаточный импульс. Это и есть отсутствие
 * «фантомного» доезда.
 *
 * suppressRef — подавляет авто-снап на время будущей программной навигации
 * (меню → блок), чтобы переходы не срабатывали при плавном программном скролле.
 */
type SnapState = "hero" | "snapping" | "docked";

const SNAP_DURATION = 850; // мс — длительность управляемого доезда
const QUIET_MS = 140; // мс «тишины» ввода перед снятием придержки
const EDGE = 2; // px — допуск к границе секции
const THRESH = 6; // px — порог тач-жеста

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function HomeShell({ items }: { items: ProductDto[] }) {
  const [state, setState] = useState<SnapState>("hero");

  const stateRef = useRef<SnapState>("hero");
  const productsRef = useRef<HTMLElement>(null);
  const suppressRef = useRef(false);

  const setSnapState = (s: SnapState) => {
    stateRef.current = s;
    setState(s);
  };

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    let tweenRaf: number | null = null;
    let watchdog: number | null = null;
    let holdTarget = 0; // куда «прилипает» позиция во время снапа
    let tweenDone = false; // твин доехал, ждём тишины ввода
    let lastInput = 0; // время последнего ввода (для QUIET)
    let touchStartY: number | null = null;

    const productsTop = () =>
      productsRef.current ? productsRef.current.offsetTop : window.innerHeight;

    const clearWatchdog = () => {
      if (watchdog !== null) {
        window.clearInterval(watchdog);
        watchdog = null;
      }
    };

    /** После доезда ждём QUIET мс тишины ввода, затем фиксируем состояние. */
    const finalizeWhenQuiet = (after: SnapState) => {
      clearWatchdog();
      watchdog = window.setInterval(() => {
        if (performance.now() - lastInput > QUIET_MS) {
          clearWatchdog();
          tweenDone = false;
          window.scrollTo(0, holdTarget); // точная фиксация
          setSnapState(after);
        }
      }, 30);
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
      if (stateRef.current !== "hero" || suppressRef.current) return;
      setSnapState("snapping");
      holdTarget = productsTop();
      tweenDone = false;
      tweenTo(holdTarget, () => {
        tweenDone = true;
        lastInput = performance.now();
        finalizeWhenQuiet("docked");
      });
    };

    const snapBack = () => {
      if (stateRef.current !== "docked" || suppressRef.current) return;
      setSnapState("snapping");
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
        if (tweenDone) window.scrollTo(0, holdTarget); // гасим остаточную инерцию
      } else {
        // docked: вверх на верхней границе → обратный снап; иначе свободно
        if (e.deltaY < 0 && window.scrollY <= productsTop() + EDGE) {
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
        if (sy - y > THRESH) snapForward(); // палец вверх = скролл вниз
      } else if (st === "snapping") {
        e.preventDefault();
        if (tweenDone) window.scrollTo(0, holdTarget);
      } else {
        // docked: палец вниз (скролл вверх) на верхней границе → обратный снап
        if (y - sy > THRESH && window.scrollY <= productsTop() + EDGE) {
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
          window.scrollY <= productsTop() + EDGE
        ) {
          e.preventDefault();
          lastInput = performance.now();
          snapBack();
        }
      }
    };

    // Придержка верхней границы зоны товаров: в docked не пускаем скролл выше
    // начала секции (в hero можно только обратным снапом).
    const onScroll = () => {
      if (stateRef.current !== "docked" || suppressRef.current) return;
      const top = productsTop();
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

  const heroDocked = state !== "hero";

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
