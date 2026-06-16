import { prisma } from "@/lib/db";
import { cdnUrl } from "@/lib/media-url";
import type { ProductDto } from "@/lib/api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/products/:id
 * 404 если товара нет в БД или id не число.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
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
        photos: { orderBy: { order: "asc" } },
        features: { orderBy: { order: "asc" } },
      },
    });

    if (!product) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const body: ProductDto = {
      id: product.id,
      name: product.name,
      price: product.price,
      inStock: product.inStock,
      photos: product.photos.map((p) => ({ url: p.publicUrl, kind: p.kind })),
      videoUrl: cdnUrl(product.videoPublicUrl),
      features: product.features.map((f) => f.text),
      createdAt: product.createdAt.toISOString(),
    };

    return Response.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string })?.code;
    console.error("GET /api/products/[id] failed:", code, msg, e);
    return Response.json(
      { error: "Internal error", code, message: msg },
      { status: 500 },
    );
  }
}
