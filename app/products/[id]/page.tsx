import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { Footer } from "@/components/Footer";
import { Gallery } from "@/components/Gallery";
import { ProductDetails } from "@/components/ProductDetails";
import styles from "./page.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Метаданные карточки — для красивого превью при шаринге ссылки в Telegram.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await fetchProduct(id);
  if (!product) return { title: "Товар не найден" };

  const description = `${product.price} ${config.currency}${
    product.inStock ? "" : " · нет в наличии"
  }`;

  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      type: "website",
      images: product.photos[0] ? [{ url: product.photos[0].url }] : undefined,
    },
  };
}

async function fetchProduct(idStr: string): Promise<ProductDto | null> {
  const id = Number(idStr);
  if (!Number.isInteger(id) || id < 1) return null;

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { order: "asc" } },
      features: { orderBy: { order: "asc" } },
    },
  });

  if (!product) return null;

  return {
    id: product.id,
    name: product.name,
    price: product.price,
    inStock: product.inStock,
    photos: product.photos.map((p) => ({ url: p.publicUrl, kind: p.kind })),
    videoUrl: product.videoPublicUrl ?? null,
    features: product.features.map((f) => f.text),
    createdAt: product.createdAt.toISOString(),
  };
}

/**
 * Страница товара по макету:
 *  - медиа-блок: каруселька слева + видео справа, без отступа между ними,
 *    одинаковой высоты (если видео нет — карусель одна, по центру);
 *  - ниже — инфо-карточка в виде «игральной карты» (чёрная с белой рамкой),
 *    перекрывает медиа-блок снизу.
 */
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
        <main className={`container ${styles.notFound}`}>
          <h1 className={styles.notFoundTitle}>Товар не найден</h1>
          <Link href="/" className={styles.backLink}>
            ← Вернуться в каталог
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const hasVideo = !!product.videoUrl;

  // Порядок в карусельке: сначала фотографии одежды (ITEM), потом модели.
  const orderedPhotos = [
    ...product.photos.filter((p) => p.kind === "ITEM"),
    ...product.photos.filter((p) => p.kind === "MODEL"),
  ];

  return (
    <>
      <main className={styles.main}>
        <Link href="/" className={styles.back}>
          ← К каталогу
        </Link>

        <div className={styles.mediaRow}>
          <div className={styles.galleryCol}>
            <Gallery
              photos={orderedPhotos.map((p) => p.url)}
              title={product.name}
            />
          </div>
          {hasVideo && (
            <div className={styles.videoCol}>
              <video
                className={styles.video}
                src={product.videoUrl!}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            </div>
          )}
        </div>

        <ProductDetails product={product} />
      </main>
    </>
  );
}
