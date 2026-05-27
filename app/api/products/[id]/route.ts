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

    if (!product || product.status === "SOLD") {
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
    console.error("GET /api/products/[id] failed:", e);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
