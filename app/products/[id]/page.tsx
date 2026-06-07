import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import config from "@/lib/config";
import type { ProductDto } from "@/lib/api-types";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Gallery } from "@/components/Gallery";
import { ProductDetails } from "@/components/ProductDetails";
import styles from "./page.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Метаданные карточки — для красивого превью при шаринге ссылки в Telegram:
 * заголовок «<название> · MURJAK», цена в описании, первое фото как og:image.
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
      images: product.photos[0] ? [{ url: product.photos[0] }] : undefined,
    },
  };
}

/**
 * Загружает товар напрямую через Prisma. Возвращает null если id невалидный
 * или товара нет. inStock=false не скрывает — товар всё равно показываем
 * с плашкой «нет в наличии».
 */
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
    photos: product.photos.map((p) => p.publicUrl),
    features: product.features.map((f) => f.text),
    createdAt: product.createdAt.toISOString(),
  };
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
          <h1 className={styles.notFoundTitle}>Товар не найден</h1>
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
            <Gallery photos={product.photos} title={product.name} />
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
