"use client";

import { useEffect, useRef } from "react";
import styles from "./BrandRibbon.module.css";

/**
 * Барабан-кольцо лукбук-фото. Фото расставлены по кругу (вид спереди):
 * переднее — крупное и яркое, уходящие назад — мельче и темнее. Кольцо
 * крутится очень медленно само и докручивается перетаскиванием (палец/мышь);
 * свайп по барабану крутит его, а не скроллит страницу (touch-action: none +
 * остановка всплытия touch-событий, чтобы не сработал снап страницы).
 */
const PHOTOS = [
  "/brand/ribbon/1.jpg",
  "/brand/ribbon/2.jpg",
  "/brand/ribbon/3.jpg",
  "/brand/ribbon/4.jpg",
  "/brand/ribbon/5.jpg",
  "/brand/ribbon/6.jpg",
];
const N = PHOTOS.length;
const AUTO = -0.14; // рад/сек — медленно, в обратную сторону

export function BrandRibbon({ className = "" }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const rot = useRef(0);
  const vel = useRef(0); // инерция от перетаскивания (рад/кадр)
  const dragging = useRef(false);
  const lastX = useRef(0);

  useEffect(() => {
    let raf = 0;
    let prev = performance.now();

    const apply = () => {
      const root = rootRef.current;
      if (!root) return;
      // на мобилке кольцо шире (больше разнос фото → нет «перескока»
      // передней при смене); на десктопе компактнее
      const radius = root.clientWidth * (window.innerWidth < 768 ? 0.62 : 0.32);
      for (let i = 0; i < N; i++) {
        const el = cardsRef.current[i];
        if (!el) continue;
        const theta = (i / N) * Math.PI * 2 + rot.current;
        const z = Math.cos(theta); // -1 (назад) .. 1 (перед)
        const depth = (z + 1) / 2; // 0 .. 1
        const tx = Math.sin(theta) * radius;
        const scale = 0.38 + depth * 0.8; // назад мельче, перед заметно крупнее
        el.style.transform = `translate(-50%, -50%) translateX(${tx.toFixed(1)}px) scale(${scale.toFixed(3)})`;
        el.style.zIndex = String(100 + Math.round(z * 100));
        el.style.filter = `brightness(${(0.22 + depth * 0.78).toFixed(3)})`;
        el.style.opacity = (0.45 + depth * 0.55).toFixed(3);
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!dragging.current) {
        rot.current += AUTO * dt + vel.current;
        vel.current *= 0.92;
      }
      apply();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    vel.current = 0;
    lastX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const W = rootRef.current?.clientWidth || 1;
    const dRot = ((e.clientX - lastX.current) / W) * Math.PI * 1.6;
    lastX.current = e.clientX;
    rot.current += dRot;
    vel.current = dRot; // для инерции после отпускания
  };
  const endDrag = () => {
    dragging.current = false;
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.drum}${className ? " " + className : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      // вращение барабана НИКОГДА не скроллит страницу: гасим всплытие touch
      // к снап-механике (иначе свайп по барабану мог увести страницу)
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {PHOTOS.map((src, i) => (
        <div
          key={src}
          ref={(el) => {
            cardsRef.current[i] = el;
          }}
          className={styles.card}
          aria-hidden="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- барабан
              управляется напрямую transform'ами, next/image тут лишний */}
          <img src={src} alt="" loading="lazy" draggable={false} />
        </div>
      ))}
    </div>
  );
}
