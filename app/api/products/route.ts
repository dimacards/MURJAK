import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  PRODUCT_SORT,
  type ProductListResponse,
  type ProductSort,
} from "@/lib/api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

/** Парсит целое число из строки query-параметра с опциональными границами. */
function parseInt(
  value: string | null,
  min?: number,
  max?: number
): number | undefined {
  if (value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n)) return undefined;
  if (min !== undefined && n < min) return undefined;
  if (max !== undefined && n > max) return undefined;
  return n;
}

/**
 * GET /api/products
 *
 * Query (все опциональные):
 *   category=<id>                  — Category.id
 *   size=XS|S|M|L|XL|XXL
 *   conditionMin=1..10
 *   conditionMax=1..10
 *   priceMin=<number>
 *   priceMax=<number>
 *   sort=new (default) | price_asc | price_desc
 *   page=1+ (default 1)
 *   limit=1..60 (default 24)
 *
 * Невалидные параметры тихо игнорируются (как будто не переданы).
 * Жёсткий фильтр Product.status = 'ACTIVE' — SOLD не отдаём никогда.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // ── Фильтры ────────────────────────────────────────────────────────────
    const categoryId = parseInt(searchParams.get("category"), 1);
    // size — произвольная строка (XS..XXL или размер обуви). Точное совпадение.
    const sizeRaw = searchParams.get("size")?.trim();
    const size = sizeRaw && sizeRaw.length > 0 ? sizeRaw : undefined;
    const conditionMin = parseInt(searchParams.get("conditionMin"), 1, 10);
    const conditionMax = parseInt(searchParams.get("conditionMax"), 1, 10);
    const priceMin = parseInt(searchParams.get("priceMin"), 0);
    const priceMax = parseInt(searchParams.get("priceMax"), 0);

    // Поиск по описанию (case-insensitive подстрока).
    const searchRaw = searchParams.get("search")?.trim();
    const search = searchRaw && searchRaw.length > 0 ? searchRaw : undefined;

    // ── Сортировка ─────────────────────────────────────────────────────────
    const sortRaw = searchParams.get("sort");
    const sort: ProductSort = (PRODUCT_SORT as readonly string[]).includes(
      sortRaw ?? ""
    )
      ? (sortRaw as ProductSort)
      : "new";

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === "price_asc"
        ? { price: "asc" }
        : sort === "price_desc"
          ? { price: "desc" }
          : { createdAt: "desc" };

    // ── Пагинация ──────────────────────────────────────────────────────────
    const page = Math.max(1, parseInt(searchParams.get("page"), 1) ?? 1);
    // limit: пользователь дал не-число → default 24; дал > 60 → clamp к 60;
    //        дал < 1 → clamp к 1.
    const limitRaw = parseInt(searchParams.get("limit"), 1);
    const limit =
      limitRaw === undefined
        ? DEFAULT_LIMIT
        : Math.min(MAX_LIMIT, Math.max(1, limitRaw));
    const skip = (page - 1) * limit;

    // ── where ──────────────────────────────────────────────────────────────
    const where: Prisma.ProductWhereInput = {
      status: "ACTIVE",
      ...(categoryId !== undefined && { categoryId }),
      ...(size !== undefined && { size }),
      ...((conditionMin !== undefined || conditionMax !== undefined) && {
        condition: {
          ...(conditionMin !== undefined && { gte: conditionMin }),
          ...(conditionMax !== undefined && { lte: conditionMax }),
        },
      }),
      ...((priceMin !== undefined || priceMax !== undefined) && {
        price: {
          ...(priceMin !== undefined && { gte: priceMin }),
          ...(priceMax !== undefined && { lte: priceMax }),
        },
      }),
      ...(search !== undefined && {
        description: { contains: search, mode: "insensitive" as const },
      }),
    };

    // ── Запрос (параллельно: items + count) ────────────────────────────────
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          category: true,
          photos: { orderBy: { order: "asc" } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const body: ProductListResponse = {
      items: products.map((p) => ({
        id: p.id,
        category: p.category.name,
        description: p.description,
        size: p.size,
        condition: p.condition,
        price: p.price,
        photos: p.photos.map((ph) => ph.publicUrl),
        createdAt: p.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize: limit,
    };

    return Response.json(body);
  } catch (e) {
    // Подробный лог — ищется в Vercel Functions → Logs по тексту «GET /api/products».
    // В ответе наружу даём короткое сообщение, без stack-trace.
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string })?.code;
    console.error("GET /api/products failed:", code, msg, e);
    return Response.json(
      { error: "Internal error", code, message: msg },
      { status: 500 }
    );
  }
}
