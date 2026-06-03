import { prisma } from "@/lib/db";
import type { ProductDto } from "@/lib/api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/products/:id
 *
 * Возвращает один товар по id. 404 если:
 *   - товара нет в БД
 *   - товар в статусе SOLD (на сайте скрыт)
 *   - id не число
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isInteger(id) || id < 1) {
      return Response.json({ error: "Invalid id" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        photos: { orderBy: { order: "asc" } },
      },
    });

    // 404 если: товара нет / он SOLD / у него снята visibleOnSite
    // (товар существует только в канале, на сайте скрыт).
    if (!product || product.status === "SOLD" || !product.visibleOnSite) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const body: ProductDto = {
      id: product.id,
      category: product.category.name,
      description: product.description,
      size: product.size,
      condition: product.condition,
      price: product.price,
      photos: product.photos.map((p) => p.publicUrl),
      createdAt: product.createdAt.toISOString(),
    };

    return Response.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string })?.code;
    console.error("GET /api/products/[id] failed:", code, msg, e);
    return Response.json(
      { error: "Internal error", code, message: msg },
      { status: 500 }
    );
  }
}
