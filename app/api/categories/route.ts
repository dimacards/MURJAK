import { prisma } from "@/lib/db";
import type { CategoryDto } from "@/lib/api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/categories
 *
 * Список всех категорий магазина — нужен сайту для построения фильтра
 * по категориям. Возвращает: [{ id, name }, ...] в алфавитном порядке.
 */
export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const body: CategoryDto[] = categories;
    return Response.json(body);
  } catch (e) {
    console.error("GET /api/categories failed:", e);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
