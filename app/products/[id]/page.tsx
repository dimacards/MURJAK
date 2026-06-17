import type { Metadata } from "next";
import Link from "next/link";
import config from "@/lib/config";
import { getAllProducts, getProduct } from "@/lib/products";
import { Footer } from "@/components/Footer";
import { Gallery } from "@/components/Gallery";
import { ProductDetails } from "@/components/ProductDetails";
import styles from "./page.module.css";

/** Пререндер страницы для каждого товара (нужно для статического экспорта). */
export function generateStaticParams() {
  return getAllProducts().map((p) => ({ id: String(p.id) }));
}

/**
 * Метаданные карточки — для красивого превью при шаринге ссылки в Telegram.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = getProduct(Number(id));
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

/**
 * Страница товара:
 *  - слева каруселька со ВСЕМИ медиа (фото + видео как слайды);
 *  - справа — статичный блок информации («игральная карта»).
 */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = getProduct(Number(id));

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

  // Порядок в карусельке: сначала фотографии одежды (ITEM), потом модели.
  const orderedPhotos = [
    ...product.photos.filter((p) => p.kind === "ITEM"),
    ...product.photos.filter((p) => p.kind === "MODEL"),
  ];

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>
        ← К каталогу
      </Link>

      <div className={styles.layout}>
        <div className={styles.galleryCol}>
          <Gallery
            photos={orderedPhotos.map((p) => p.url)}
            videoUrl={product.videoUrl}
            title={product.name}
          />
        </div>
        <div className={styles.detailsCol}>
          <ProductDetails product={product} />
        </div>
      </div>
    </main>
  );
}
