/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { headers } from "next/headers";
import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Серверный fetch к собственному /api/products/[id]. Для абсолютного URL
 * берём NEXT_PUBLIC_SITE_URL, либо реконструируем из request-headers
 * (когда переменная не выставлена, что бывает в dev).
 *
 * Возвращает null если 404 (нет или продан) — компонент покажет «Не найден».
 */
async function fetchProduct(id: string): Promise<ProductDto | null> {
  let baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    if (host) baseUrl = `${proto}://${host}`;
    else baseUrl = "http://localhost:3000";
  }

  const res = await fetch(`${baseUrl}/api/products/${id}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Не удалось загрузить товар: HTTP ${res.status}`);
  }
  return (await res.json()) as ProductDto;
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await fetchProduct(id);

  if (!product) {
    return (
      <main style={{ padding: 16, fontFamily: "sans-serif" }}>
        <p>
          <Link href="/">← к списку</Link>
        </p>
        <h1>Товар не найден или продан.</h1>
      </main>
    );
  }

  return (
    <main style={{ padding: 16, fontFamily: "sans-serif", maxWidth: 720 }}>
      <p>
        <Link href="/">← к списку</Link>
      </p>

      <h1>{product.category}</h1>

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {product.photos.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`Фото ${i + 1}`}
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
          />
        ))}
      </div>

      <p>Размер: {product.size}</p>
      <p>Состояние: {product.condition}/10</p>
      <p>
        Цена:{" "}
        <b>
          {product.price} {config.currency}
        </b>
      </p>

      {(() => {
        // Deep link на Telegram-чат продавца с pre-filled сообщением.
        // Telegram распознаёт ?text= и кладёт содержимое в поле ввода чата.
        //
        // НЕ используем target="_blank" — на iOS Safari это вызывает баг:
        // новая вкладка открывается на t.me/, который через Universal Links
        // открывает Telegram-приложение. При возврате в Safari та же вкладка
        // снова пытается передать управление приложению — получается петля
        // «This page couldn't load». Без _blank iOS открывает Telegram прямо
        // из текущей вкладки, после возврата кнопка «назад» возвращает на
        // страницу товара.
        const message =
          `Здравствуйте! Интересует товар №${product.id} ` +
          `(${product.category}, размер ${product.size}, ` +
          `${product.price} ${config.currency})`;
        const href = `https://t.me/${config.sellerUsername}?text=${encodeURIComponent(message)}`;

        return (
          <p style={{ marginTop: 16 }}>
            <a
              href={href}
              rel="noopener"
              style={{
                display: "inline-block",
                padding: "8px 16px",
                background: "#229ED9",
                color: "white",
                textDecoration: "none",
                borderRadius: 4,
              }}
            >
              ✈️ Купить в Telegram
            </a>
          </p>
        );
      })()}

      <p style={{ marginTop: 8, color: "#666", fontSize: 14 }}>
        При нажатии вы перейдёте в Telegram для оформления покупки.
      </p>
    </main>
  );
}
