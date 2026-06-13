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
 *              ровно в точку. Ввод гасится.
 *   docked   — зона товаров. Свободный скролл внутри, но верхняя граница
 *              (начало секции) придержана: жест ВВЕРХ на границе — триггер
 *              обратного снапа к hero.
 *
 * Переходы:
 *   hero   --(жест вниз)-->                       snapping --(доезд)--> docked
 *   docked --(жест вверх на верхней границе)-->    snapping --(доезд)--> hero
 *
 * Снятие инерции («доезжает чуть-чуть») БЕЗ зависаний: после доезда сразу
 * отдаём свободный скролл, а кратковременная ВРЕМЕННАЯ заморозка (FREEZE_MS)
 * клэмпит позицию к цели — гасит остаточный momentum. Критерий — время, а не
 * «тишина ввода»: инерция держит поток событий «шумным» 1–2с, и ожидание
 * тишины приводило к локу (нельзя скроллить, пока не уберёшь пальцы/курсор).
 *
 * suppressRef — подавляет авто-снап на время будущей программной навигации
 * (меню → блок), чтобы переходы не срабатывали при плавном программном скролле.
 */
type SnapState = "hero" | "snapping" | "docked";

const SNAP_DURATION = 680; // мс — длительность управляемого доезда
const FREEZE_MS = 160; // мс заморозки позиции после доезда (гасит momentum)
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
    let holdTarget = 0; // цель текущего снапа
    let freezeUntil = 0; // до этого времени позиция клэмпится к holdTarget
    let touchStartY: number | null = null;

    const productsTop = () =>
      productsRef.current ? productsRef.current.offsetTop : window.innerHeight;

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
      tweenTo(holdTarget, () => {
        // сразу отдаём свободный скролл; короткая заморозка гасит momentum
        freezeUntil = performance.now() + FREEZE_MS;
        setSnapState("docked");
      });
    };

    const snapBack = () => {
      if (stateRef.current !== "docked" || suppressRef.current) return;
      setSnapState("snapping");
      holdTarget = 0;
      tweenTo(0, () => {
        freezeUntil = performance.now() + FREEZE_MS;
        setSnapState("hero");
      });
    };

    // ── Слушатели ────────────────────────────────────────────────────────
    const onWheel = (e: WheelEvent) => {
      const st = stateRef.current;
      if (st === "hero") {
        e.preventDefault();
        if (e.deltaY > 0) snapForward();
      } else if (st === "snapping") {
        e.preventDefault(); // во время доезда ввод гасим
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
      const y = e.touches[0]?.clientY ?? 0;
      const sy = touchStartY ?? y;
      if (st === "hero") {
        e.preventDefault();
        if (sy - y > THRESH) snapForward(); // палец вверх = скролл вниз
      } else if (st === "snapping") {
        e.preventDefault();
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
          snapForward();
        }
      } else if (st === "docked") {
        if (
          (e.key === "ArrowUp" || e.key === "PageUp") &&
          window.scrollY <= productsTop() + EDGE
        ) {
          e.preventDefault();
          snapBack();
        }
      }
    };

    // В docked: придержка верхней границы товаров + кратковременная заморозка
    // позиции после доезда (гасит остаточный momentum, без зависания).
    const onScroll = () => {
      if (stateRef.current !== "docked" || suppressRef.current) return;
      const top = productsTop();
      if (window.scrollY < top) {
        window.scrollTo(0, top); // не пускаем выше начала секции
      } else if (performance.now() < freezeUntil && window.scrollY > top) {
        window.scrollTo(0, top); // гасим «доезд» вниз сразу после снапа
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
      if (tweenRaf) cancelAnimationFrame(tweenRaf);
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
