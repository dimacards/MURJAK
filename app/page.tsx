import Image from "next/image";
import { prisma } from "@/lib/db";
import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { Footer } from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import styles from "./page.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Главная по макету Figma:
 *  1) Hero — фоновое видео на весь экран + огромный логотип MURJAK
 *     с mix-blend-difference.
 *  2) Секция «Товары» — чёрный фон с SVG-текстурой, фильтр-иконки
 *     (вещь/модель), сетка карточек.
 */
async function fetchProducts(): Promise<ProductDto[]> {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      photos: { orderBy: { order: "asc" } },
      features: { orderBy: { order: "asc" } },
    },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    inStock: p.inStock,
    photos: p.photos.map((ph) => ({ url: ph.publicUrl, kind: ph.kind })),
    videoUrl: p.videoPublicUrl ?? null,
    features: p.features.map((f) => f.text),
    createdAt: p.createdAt.toISOString(),
  }));
}

export default async function Home() {
  const items = await fetchProducts();

  return (
    <>
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
        <div className={styles.heroLogoWrap}>
          <Image
            src="/brand/murjak-logo.svg"
            alt={config.storeName}
            width={1959}
            height={506}
            className={styles.heroLogo}
            priority
          />
        </div>
      </section>

      <section className={styles.products}>
        <div className={styles.productsInner}>
          <ProductGrid items={items} />
        </div>
      </section>

      <Footer />
    </>
  );
}
