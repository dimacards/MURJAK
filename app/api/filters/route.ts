import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/filters
 *
 * Возвращает значения фильтров, которые имеют смысл прямо сейчас — то есть
 * присутствуют хотя бы в одном активном товаре, видимом на сайте. Это позволяет
 * сайту не показывать «пустых» категорий (например, «ботинки», если ботинок в
 * магазине нет) и нерелевантных размеров (XXL, если такого размера нигде нет).
 *
 * Ответ:
 *   {
 *     categories: [{ id, name }, ...]   — категории с хотя бы 1 видимым товаром
 *     sizes: ["XS","S","M","L","42"]    — отсортированные: одежда XS..XXL, затем
 *                                          цифровые (обувь) по возрастанию
 *   }
 */

const CLOTHING_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];

function compareSizes(a: string, b: string): number {
  const ai = CLOTHING_ORDER.indexOf(a);
  const bi = CLOTHING_ORDER.indexOf(b);
  // одежда идёт первой и в каноничном порядке
  if (ai >= 0 && bi >= 0) return ai - bi;
  if (ai >= 0) return -1;
  if (bi >= 0) return 1;
  // оба — не из списка одежды (вероятно обувь). Сортируем как числа,
  // если возможно (42, 42.5, 43), иначе локально.
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

export async function GET() {
  try {
    const [categories, sizeRows] = await Promise.all([
      prisma.category.findMany({
        where: {
          products: {
            some: { status: "ACTIVE", visibleOnSite: true },
          },
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      // distinct values of Product.size среди видимых-активных
      prisma.product.findMany({
        where: { status: "ACTIVE", visibleOnSite: true },
        select: { size: true },
        distinct: ["size"],
      }),
    ]);

    const sizes = sizeRows
      .map((r) => r.size)
      .filter((s): s is string => Boolean(s))
      .sort(compareSizes);

    return Response.json({ categories, sizes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string })?.code;
    console.error("GET /api/filters failed:", code, msg, e);
    return Response.json(
      { error: "Internal error", code, message: msg },
      { status: 500 }
    );
  }
}
