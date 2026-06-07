import { prisma } from "@/lib/db";
import type { ProductDto } from "@/lib/api-types";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import styles from "./page.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Главная — сетка всех товаров.
 * Без фильтров, без пагинации (у бренда товаров мало).
 * Тянем напрямую через Prisma — без сетевого хопа в собственный /api/products.
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
    photos: p.photos.map((ph) => ph.publicUrl),
    features: p.features.map((f) => f.text),
    createdAt: p.createdAt.toISOString(),
  }));
}

export default async function Home() {
  const items = await fetchProducts();

  return (
    <>
      <header className={styles.header}>
        <div className="container">
          <Logo />
        </div>
      </header>

      <main className={`container ${styles.main}`}>
        <ProductGrid items={items} />
      </main>

      <Footer />
    </>
  );
}
