"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./CartIcon";
import styles from "./SizeModal.module.css";

/**
 * Модалка выбора размера. Открывается при добавлении товара с размерами.
 * Выбираешь размер → «Готово» → onDone(size).
 */
export function SizeModal({
  open,
  title,
  sizes,
  onDone,
  onClose,
}: {
  open: boolean;
  title: string;
  sizes: string[];
  onDone: (size: string) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  // сбрасываем выбор при каждом открытии
  useEffect(() => {
    if (open) setPicked(null);
  }, [open]);

  // Esc — закрыть
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // портал только на клиенте; модалка открывается по клику, так что SSR не задет
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Выбор размера"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.close}
          aria-label="Закрыть"
          onClick={onClose}
        >
          <CloseIcon size={22} />
        </button>

        <div className={styles.title}>{title}</div>
        <div className={styles.label}>Выбери размер</div>

        <div className={styles.sizes}>
          {sizes.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.size}${picked === s ? " " + styles.sizeActive : ""}`}
              onClick={() => setPicked(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={styles.done}
          disabled={picked === null}
          onClick={() => picked !== null && onDone(picked)}
        >
          Готово
        </button>
      </div>
    </div>,
    document.body,
  );
}
