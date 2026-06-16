import { prisma } from "@/lib/db";
import { cdnUrl } from "@/lib/media-url";
import type { ProductListResponse } from "@/lib/api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/products
 *
 * Возвращает все товары, сортировка: сначала новые.
 * Без пагинации, без фильтров — у бренда товаров мало, нагрузка минимальная.
 *
 * Товары с inStock=false НЕ скрываем — фронт сам нарисует плашку.
 */
export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        photos: { orderBy: { order: "asc" } },
        features: { orderBy: { order: "asc" } },
      },
    });

    const body: ProductListResponse = {
      items: products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        inStock: p.inStock,
        photos: p.photos.map((ph) => ({ url: ph.publicUrl, kind: ph.kind })),
        videoUrl: cdnUrl(p.videoPublicUrl),
        features: p.features.map((f) => f.text),
        createdAt: p.createdAt.toISOString(),
      })),
      total: products.length,
    };

    return Response.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string })?.code;
    console.error("GET /api/products failed:", code, msg, e);
    return Response.json(
      { error: "Internal error", code, message: msg },
      { status: 500 },
    );
  }
}
