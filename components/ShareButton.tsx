"use client";

import { useState } from "react";

/**
 * Кнопка «поделиться»: копирует ссылку на товар в буфер обмена
 * (аналог иконки share в карточке LIME; избранного/корзины у нас нет).
 */
export function ShareButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    try {
      const url = window.location.href;
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* пользователь отменил share / нет доступа — игнорируем */
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label="Поделиться"
      title={copied ? "Ссылка скопирована" : "Поделиться"}
    >
      {copied ? (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M3.5 9.5 L7 13 L14.5 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M9 1.5 V11 M9 1.5 L5.5 5 M9 1.5 L12.5 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3.5 9 V15 H14.5 V9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
