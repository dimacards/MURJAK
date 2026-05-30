import Link from "next/link";
import { headers } from "next/headers";
import type { ProductDto } from "@/lib/api-types";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Gallery } from "@/components/Gallery";
import { ProductDetails } from "@/components/ProductDetails";
import styles from "./page.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Серверный fetch к собственному /api/products/[id]. Для абсолютного URL
 * берём NEXT_PUBLIC_SITE_URL, либо реконструируем из request-headers.
 * Возвращает null если 404 (нет или продан).
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
      <>
        <header className={styles.header}>
          <div className="container">
            <Logo />
          </div>
        </header>
        <main className={`container ${styles.notFound}`}>
          <h1 className={styles.notFoundTitle}>
            Товар не найден или продан
          </h1>
          <Link href="/" className={styles.backLink}>
            ← Вернуться в каталог
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <header className={styles.header}>
        <div className="container">
          <Logo />
        </div>
      </header>

      <main className={`container ${styles.main}`}>
        <Link href="/" className={styles.back}>
          ← К каталогу
        </Link>

        <div className={styles.layout}>
          <div className={styles.galleryCol}>
            <Gallery
              photos={product.photos}
              title={product.description || product.category}
            />
          </div>
          <div className={styles.detailsCol}>
            <ProductDetails product={product} />
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
