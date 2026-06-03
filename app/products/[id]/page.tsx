import Link from "next/link";
import { prisma } from "@/lib/db";
import type { ProductDto } from "@/lib/api-types";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { Gallery } from "@/components/Gallery";
import { ProductDetails } from "@/components/ProductDetails";
import styles from "./page.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Загружает товар напрямую через Prisma — без сетевого хопа в собственный
 * /api/products/[id]. На Vercel self-fetch — это вторая cold-start'ующая
 * функция в той же серверной операции: лишняя точка отказа и расход бюджета.
 *
 * Возвращает null если:
 *   - id не валидный
 *   - товара нет
 *   - товар продан (SOLD скрываем с витрины)
 */
async function fetchProduct(idStr: string): Promise<ProductDto | null> {
  const id = Number(idStr);
  if (!Number.isInteger(id) || id < 1) return null;

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      photos: { orderBy: { order: "asc" } },
    },
  });

  // Скрываем со страницы: продан или вручную убран с сайта в /add_product.
  if (!product || product.status === "SOLD" || !product.visibleOnSite)
    return null;

  return {
    id: product.id,
    category: product.category.name,
    description: product.description,
    size: product.size,
    condition: product.condition,
    price: product.price,
    photos: product.photos.map((p) => p.publicUrl),
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
