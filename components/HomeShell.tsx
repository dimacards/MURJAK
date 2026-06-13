"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { Footer } from "./Footer";
import { ProductGrid } from "./ProductGrid";
import styles from "@/app/page.module.css";

/**
 * Снап-механика первого экрана + переезд логотипа.
 *
 * FSM (управляет ПОЛОЖЕНИЕМ скролла):
 *   hero     — первый экран (видео) на весь вьюпорт, scrollY придержан на 0.
 *              Жест ВНИЗ — снап вперёд к брендовому блоку.
 *   snapping — управляемый rAF-доезд (easeInOutCubic) до цели; ввод гасится.
 *   docked   — зона контента (бренд-блок → товары). Свободный скролл, но
 *              верхняя граница придержана: жест ВВЕРХ на ней — обратный снап.
 *
 * Логотип (отдельный fixed-оверлей) — чистая функция от scrollY, НЕ зависит
 * от FSM. В hero (scrollY 0) — огромный по центру; к бренд-блоку (scrollY=H)
 * уменьшается до 32px и встаёт над описанием; дальше (scrollY>H) уезжает
 * вверх вместе с контентом. Так нет конфликта CSS-перехода со скроллом.
 *
 * Снятие инерции после доезда — по «тишине» ввода (QUIET_MS): держим цель,
 * пока поток событий не замолчит, гася остаточный momentum (чистая остановка
 * без «фантомного» доезда).
 */
type SnapState = "hero" | "snapping" | "docked";

const SNAP_DURATION = 850;
const QUIET_MS = 30; // мс «тишины» ввода перед снятием придержки
const EDGE = 2;
const THRESH = 6;
const LOGO_DOCKED_H = 32; // px — высота логотипа в брендовом блоке
const LOGO_SLOT_Y = -34; // px — смещение логотипа вверх от центра (над текстом)
const LOGO_RATIO = 1959 / 506; // пропорции murjak-logo.svg

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function HomeShell({ items }: { items: ProductDto[] }) {
  const [state, setState] = useState<SnapState>("hero");

  const stateRef = useRef<SnapState>("hero");
  const targetRef = useRef<HTMLElement>(null); // брендовый блок — цель снапа
  const logoRef = useRef<HTMLImageElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
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
    let holdTarget = 0;
    let tweenDone = false;
    let lastInput = 0;
    let touchStartY: number | null = null;

    const targetTop = () =>
      targetRef.current ? targetRef.current.offsetTop : window.innerHeight;

    // ── Переезд логотипа: чистая функция от scrollY ──────────────────────
    const updateLogo = () => {
      const logo = logoRef.current;
      if (!logo) return;
      const H = targetTop() || window.innerHeight;
      const y = window.scrollY;
      // масштаб «hero»: логотип отрисован высотой LOGO_DOCKED_H (32px),
      // в hero увеличиваем до ~ширины вьюпорта (SVG, без потери чёткости)
      const heroW = Math.min(window.innerWidth * 0.92, 1760);
      const heroH = heroW / LOGO_RATIO;
      const big = heroH / LOGO_DOCKED_H;

      const p = H > 0 ? Math.min(1, Math.max(0, y / H)) : 1;
      const e = easeInOutCubic(p);
      const scale = big + (1 - big) * e; // big → 1
      let ty: number;
      if (y <= H) ty = LOGO_SLOT_Y * e; // центр → слот над текстом
      else ty = LOGO_SLOT_Y - (y - H); // уезжает вверх вместе с контентом

      logo.style.transform = `translate(-50%, calc(-50% + ${ty}px)) scale(${scale})`;

      if (descRef.current) {
        const o = Math.min(1, Math.max(0, (p - 0.5) / 0.45));
        descRef.current.style.opacity = String(o);
      }
    };

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
          updateLogo();
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
        updateLogo(); // двигаем логотип синхронно с доездом
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
      holdTarget = targetTop();
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
        if (tweenDone) {
          window.scrollTo(0, holdTarget);
          updateLogo();
        }
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
        if (tweenDone) {
          window.scrollTo(0, holdTarget);
          updateLogo();
        }
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

    // Свободный скролл (docked) и любой системный скролл — двигаем логотип,
    // плюс придержка верхней границы зоны контента.
    let scrollRaf = 0;
    const onScroll = () => {
      if (!scrollRaf) {
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = 0;
          updateLogo();
        });
      }
      if (stateRef.current !== "docked" || suppressRef.current) return;
      const top = targetTop();
      if (window.scrollY < top) window.scrollTo(0, top);
    };

    const onResize = () => updateLogo();

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    updateLogo(); // начальная отрисовка (hero)

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (tweenRaf) cancelAnimationFrame(tweenRaf);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      clearWatchdog();
    };
  }, []);

  // state используется только чтобы React не ругался на неиспользование;
  // вся визуальная логика логотипа — императивная (по scrollY).
  void state;

  return (
    <>
      {/* Логотип-оверлей: единый для hero и брендового блока, переезжает */}
      <div className={styles.logoOverlay} aria-hidden="true">
        <Image
          ref={logoRef}
          src="/brand/murjak-logo.svg"
          alt={config.storeName}
          width={1959}
          height={506}
          className={styles.logoImg}
          priority
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

      {/* 2) Брендовый блок — цель снапа; логотип «приземляется» сюда */}
      <section ref={targetRef} className={styles.brand}>
        <p ref={descRef} className={styles.brandDesc}>
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
