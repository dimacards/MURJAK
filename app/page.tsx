import { prisma } from "@/lib/db";
import { cdnUrl } from "@/lib/media-url";
import type { ProductDto } from "@/lib/api-types";
import { HomeShell } from "@/components/HomeShell";

export const runtime = "nodejs";
// ISR: страница кэшируется и пере-генерируется раз в 60 сек. Это позволяет
// Gcore (РФ-edge) кэшировать HTML и отдавать его мгновенно, а за границу
// (Vercel) ходить только на ревалидацию. Новый товар из бота появится ≤60 сек.
export const revalidate = 60;

/**
 * Главная: серверный фетч товаров → клиентская оболочка HomeShell,
 * которая рендерит hero + секцию «Товары» и управляет снапом
 * (придержка скролла на hero, доезд к товарам по первому жесту).
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
    videoUrl: cdnUrl(p.videoPublicUrl),
    features: p.features.map((f) => f.text),
    createdAt: p.createdAt.toISOString(),
  }));
}

export default async function Home() {
  const items = await fetchProducts();
  return <HomeShell items={items} />;
}
