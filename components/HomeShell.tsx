"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProductDto } from "@/lib/api-types";
import config from "@/lib/config";
import { BrandRibbon } from "./BrandRibbon";
import { Footer } from "./Footer";
import { LogoSvg } from "./LogoSvg";
import { ProductGrid } from "./ProductGrid";
import { Reveal } from "./Reveal";
import styles from "@/app/page.module.css";

// layout-effect на клиенте (восстановление позиции до отрисовки — без вспышки),
// обычный effect на сервере (иначе React ругается при SSR).
const useIsoEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const SCROLL_KEY = "home-scroll";

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

const SNAP_DURATION = 850; // вперёд (в блок)
const SNAP_BACK = 600; // назад на Hero — чуть короче
const QUIET_MS = 30;
const EDGE = 2;
const THRESH = 6;
const LOGO_RATIO = 1759.53 / 306.385; // viewBox обрезан по буквам (без полей)

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

  // Масштаб hero-логотипа: 32px-база → ~ширина вьюпорта.
  // Размер «приземлившегося» лого (--logo-dock) — ФИКСИРОВАННЫЙ: мобилка мельче,
  // десктоп постоянный (не зависит от длины описания, без пересчётов/дёрганий).
  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth;
      // видимая ширина hero-логотипа (viewBox обрезан → heroW == ширине букв)
      const heroW = Math.min(vw * 0.826, 1580);
      setBigScale(heroW / LOGO_RATIO / 32);
      document.documentElement.style.setProperty(
        "--logo-dock",
        vw >= 768 ? "3" : "1.6",
      );
    };
    calc();
    // Пересчитываем ТОЛЬКО при смене ширины. Появление/скрытие баров браузера
    // (поиск, перевод, адресная строка) меняет высоту — на это не реагируем,
    // иначе логотип бы дёргался/менял размер при их закрытии.
    let lastW = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      calc();
    };
    window.addEventListener("resize", onResize);
    // пересчёт после загрузки шрифта (иначе ширина меряется по фолбэку)
    document.fonts?.ready.then(calc);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useIsoEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    // Возврат с товара/истории — восстанавливаем ту же позицию (а не верх).
    let restoredY = 0;
    try {
      const saved = sessionStorage.getItem(SCROLL_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        if (p && p.state === "docked" && p.y > 0) restoredY = p.y;
      }
    } catch {}
    if (restoredY > 0) {
      setSnapState("docked");
      setLogoBig(false);
      window.scrollTo(0, restoredY);
    } else {
      window.scrollTo(0, 0);
    }

    let tweenRaf: number | null = null;
    let watchdog: number | null = null;
    let holdTarget = 0;
    let tweenDone = false;
    let lastInput = 0;
    let touchStartY: number | null = null;
    let touchStartX: number | null = null;
    // двухшаговый выход на Hero: у верха блока нужен отдельный «второй» жест.
    // heroArmed = взведён ли переход (первый жест у верха только взводит,
    // второй уводит на Hero); сбрасывается при уходе вниз.
    let heroArmed = false;
    let armedAtStart = false; // был ли взведён в начале текущего касания
    // колесо/трекпад: один «свайп» = поток событий; разделяем по паузе,
    // чтобы один непрерывный свайп не взвёл и не сработал разом
    let lastWheelTs = 0;
    let wheelActed = false; // в текущем «свайпе» колеса уже было действие

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

    const tweenTo = (targetY: number, dur: number, onDone: () => void) => {
      if (tweenRaf) cancelAnimationFrame(tweenRaf);
      const startY = window.scrollY;
      const dist = targetY - startY;
      const start = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
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
      heroArmed = false; // после приезда в блок — нужен отдельный 2-й жест
      setSnapState("snapping");
      document.documentElement.style.setProperty("--snap-dur", "0.85s");
      setLogoBig(false); // CSS-переход: большой → 32px (как карточка)
      holdTarget = targetTop();
      tweenDone = false;
      tweenTo(holdTarget, SNAP_DURATION, () => {
        tweenDone = true;
        lastInput = performance.now();
        finalizeWhenQuiet("docked");
      });
    };

    const snapBack = () => {
      if (stateRef.current !== "docked") return;
      setSnapState("snapping");
      document.documentElement.style.setProperty("--snap-dur", "0.6s");
      setLogoBig(true); // CSS-переход: 32px → большой
      holdTarget = 0;
      tweenDone = false;
      tweenTo(0, SNAP_BACK, () => {
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
        // новый «свайп» колеса, если была пауза
        const now = performance.now();
        if (now - lastWheelTs > 160) wheelActed = false;
        lastWheelTs = now;
        if (e.deltaY < 0 && window.scrollY <= targetTop() + EDGE) {
          e.preventDefault();
          if (!wheelActed) {
            wheelActed = true;
            // первый «свайп» вверх у верха только взводит, второй → Hero
            if (heroArmed) snapBack();
            else heroArmed = true;
          }
        }
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? null;
      touchStartX = e.touches[0]?.clientX ?? null;
      armedAtStart = heroArmed;
    };

    const onTouchMove = (e: TouchEvent) => {
      const st = stateRef.current;
      lastInput = performance.now();
      const y = e.touches[0]?.clientY ?? 0;
      const x = e.touches[0]?.clientX ?? 0;
      const sy = touchStartY ?? y;
      const sx = touchStartX ?? x;
      // снап (hero↔брендовый блок) — только вертикальный свайп
      const vertical = Math.abs(sy - y) > Math.abs(sx - x);
      if (st === "hero") {
        e.preventDefault();
        if (vertical && sy - y > THRESH) snapForward();
      } else if (st === "snapping") {
        e.preventDefault();
        if (tweenDone) window.scrollTo(0, holdTarget);
      } else {
        // у верха блока: первый жест только взводит (экран стоит на верхе),
        // и лишь СЛЕДУЮЩИЙ жест вверх уводит на Hero
        if (vertical && y - sy > THRESH && window.scrollY <= targetTop() + EDGE) {
          e.preventDefault();
          if (armedAtStart) snapBack();
          else heroArmed = true;
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
          if (heroArmed) snapBack();
          else heroArmed = true;
        }
      }
    };

    // Придержка верхней границы зоны контента (в docked не пускаем выше начала
    // брендового блока — туда только обратным снапом).
    const onScroll = () => {
      if (stateRef.current !== "docked") return;
      const top = targetTop();
      if (window.scrollY < top) {
        window.scrollTo(0, top); // придержка верхней границы
      } else if (window.scrollY > top + EDGE) {
        heroArmed = false; // ушли вниз — сброс взвода
      }
    };

    // Запоминаем позицию для возврата с товара. Сохраняем В МОМЕНТ клика по
    // ссылке — до того, как Next сбросит скролл (иначе onScroll придержал бы
    // его к верху блока и мы бы вернулись не туда).
    const saveScroll = () => {
      try {
        sessionStorage.setItem(
          SCROLL_KEY,
          JSON.stringify({ y: window.scrollY, state: stateRef.current }),
        );
      } catch {}
    };
    const onDocClick = (e: MouseEvent) => {
      const a = (e.target as Element)?.closest?.('a[href^="/"]');
      if (a) saveScroll();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", saveScroll);
    document.addEventListener("click", onDocClick, true); // capture — до навигации

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", saveScroll);
      document.removeEventListener("click", onDocClick, true);
      if (tweenRaf) cancelAnimationFrame(tweenRaf);
      clearWatchdog();
    };
  }, []);

  const docked = state === "docked";

  return (
    <>
      {/* Зерно (film grain) поверх всего — тот же приём, что в истории */}
      <div className={styles.grain} aria-hidden="true" />

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

      {/* 2) Брендовый блок — цель снапа: лого слева (приезжает), под ним
          описание, по диагонали — лента лукбук-фото, внизу — ссылка-история */}
      <section ref={targetRef} className={styles.brand}>
        <LogoSvg
          className={`${styles.logoStatic} ${
            docked ? "" : styles.logoStaticHidden
          }`}
        />
        <Reveal as="p" className={styles.brandDesc}>
          бренд одежды, вдохновлённый эстетикой кардистри
          <br />и продвигающий это искусство
        </Reveal>

        <BrandRibbon />

        <Reveal className={styles.histLink} delay={120}>
          <Link href="/cardistry" className={styles.histLinkText}>
            История
            <br />
            кардистри
          </Link>
          <span className={styles.histHint}>
            нажми, чтобы перейти на страницу с историей кардистри
          </span>
        </Reveal>
      </section>

      {/* 3) Товары */}
      <section className={styles.products}>
        {/* Шапка во всю ширину: фантом + «Товары» по центру */}
        <div className={styles.head}>
          <span className={styles.headPhantom} aria-hidden="true">
            ВЕЩИ БРЕНДА
          </span>
          <Reveal as="h1" className={styles.sectionTitle}>
            Товары
          </Reveal>
        </div>

        <div className={styles.productsInner}>
          <ProductGrid items={items} />
        </div>

        {/* Нижний фантом во всю ширину */}
        <div className={styles.foot} aria-hidden="true">
          <span className={styles.footPhantom}>НОВЫЕ ВЕЩИ СКОРО</span>
        </div>
      </section>

      <Footer />
    </>
  );
}
