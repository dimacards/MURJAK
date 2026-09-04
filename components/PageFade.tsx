"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./PageFade.module.css";

/**
 * Переходы между страницами через чёрное затемнение (fade), как при
 * перелистывании фото. Перехватываем клики по внутренним ссылкам:
 * затемняем экран → переходим → проявляем новую страницу.
 */
export function PageFade() {
  const pathname = usePathname();
  const router = useRouter();
  const [covering, setCovering] = useState(false);

  // после смены маршрута — проявляем новую страницу (снимаем затемнение)
  useEffect(() => {
    setCovering(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = (e.target as Element)?.closest?.("a");
      if (!a) return;

      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return; // только внутренние
      if (href.startsWith("/api/")) return; // PHP-эндпоинты — обычный переход
      if (a.hasAttribute("download") || a.getAttribute("target")) return;

      const url = new URL(a.href, window.location.href);
      if (url.pathname === window.location.pathname) return; // та же страница

      e.preventDefault();
      setCovering(true);
      window.setTimeout(() => {
        router.push(url.pathname + url.search);
      }, 260);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  // Программный переход через fade (напр. корзина опустела → назад).
  // Событие: window.dispatchEvent(new CustomEvent("murjak-fade-nav",
  //   { detail: { back: true } | { href: "/..." } }))
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setCovering(true);
      window.setTimeout(() => {
        if (detail.back && window.history.length > 1) router.back();
        else router.push(detail.href || "/");
      }, 260);
    };
    window.addEventListener("murjak-fade-nav", onNav);
    return () => window.removeEventListener("murjak-fade-nav", onNav);
  }, [router]);

  return (
    <div
      className={styles.overlay}
      style={{ opacity: covering ? 1 : 0 }}
      aria-hidden="true"
    />
  );
}
