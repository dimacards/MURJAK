/**
 * Синхронизирует php/data/products.json с data/products.json.
 *
 * Зачем: PHP-часть (админка и pay.php) не умеет читать сборку Next.js,
 * поэтому ей нужна своя копия каталога — id, название, ЦЕНА и главное фото.
 * Цена критична: pay.php берёт сумму именно отсюда, а не из запроса браузера.
 * Без синхронизации цены разъезжаются и оплата уходит с неверной суммой.
 *
 * Запускается автоматически из `npm run build`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(readFileSync(join(root, "data/products.json"), "utf8"));

const out = src.map((p) => {
  const photos = p.photos ?? [];
  const item = photos.find((x) => x.kind === "ITEM") ?? photos[0];
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    photo: item ? item.url : "",
  };
});

writeFileSync(
  join(root, "php/data/products.json"),
  JSON.stringify(out, null, 2) + "\n",
  "utf8",
);

console.log(`  ✓ php/data/products.json — синхронизировано (${out.length} товаров)`);
