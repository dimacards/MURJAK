"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoSvg } from "./LogoSvg";
import { CartButton } from "./CartButton";
import { MenuIcon, CloseIcon } from "./CartIcon";
import styles from "./SiteNav.module.css";

/**
 * Глобальная навигация поверх всего сайта (включая видео).
 * На всех размерах — иконка корзины + бургер сверху-справа. По клику справа
 * выезжает панель: опции меню сверху, логотип снизу.
 */
const LINKS = [
  { href: "/", label: "Главное" },
  { href: "/cardistry", label: "История кардистри" },
];

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Esc — закрыть
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Корзина слева от бургера (пока меню закрыто) */}
      {!open && <CartButton />}

      {/* Бургер ↔ крестик */}
      <button
        type="button"
        className={styles.burger}
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <CloseIcon size={24} /> : <MenuIcon size={24} />}
      </button>

      {/* Затемнение + блюр фона (клик вне панели — закрыть) */}
      <div
        className={`${styles.backdrop}${open ? " " + styles.backdropOpen : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Панель: выезжает справа. Опции сверху, логотип снизу. */}
      <div
        className={`${styles.panel}${open ? " " + styles.panelOpen : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <nav className={styles.panelNav} aria-label="Меню">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`${styles.panelLink}${isActive(l.href) ? " " + styles.active : ""}`}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <LogoSvg className={styles.panelLogo} />
      </div>
    </>
  );
}
