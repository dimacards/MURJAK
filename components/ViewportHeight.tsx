"use client";

import { useEffect } from "react";

/**
 * Фиксированная высота вьюпорта в --svh (1% высоты, px). Обновляется ТОЛЬКО при
 * смене ширины (поворот/ресайз окна). Появление/закрытие баров браузера
 * (перевод в Chrome, поиск, адресная строка) меняет ВЫСОТУ — мы её игнорируем,
 * поэтому контент никогда не ресайзится и не «прыгает».
 */
export function ViewportHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const set = () =>
      root.style.setProperty("--svh", window.innerHeight * 0.01 + "px");
    set();
    let lastW = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === lastW) return; // только смена ширины
      lastW = window.innerWidth;
      set();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", set);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", set);
    };
  }, []);
  return null;
}
