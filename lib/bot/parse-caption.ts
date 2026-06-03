/**
 * Парсер подписи поста из канала (формат, в котором бот публикует).
 *
 * Наш формат (HTML parse mode):
 *   <b>Cardigan Jenasis</b>
 *
 *   Размер: M
 *   Состояние: 8/10
 *
 *   <b>1500 ₽</b>
 *
 *   Купить: @username
 *
 * Старые посты до бота могут иметь другую структуру или вовсе без подписи.
 * Парсер по-максимуму выжимает что может, остальное вернёт undefined —
 * пользователь дозаполнит в импорт-диалоге.
 */

export type ParsedCaption = {
  description?: string;
  size?: string;
  condition?: number;
  price?: number;
};

/**
 * Убирает HTML-теги из строки (мы постим с parse_mode=HTML).
 * `<b>...</b>` → `...`, `&amp;` → `&` и т.д.
 */
function stripHtml(s: string): string {
  return s
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const LABEL_RE = /^(размер|состояние|цена|купить)\b/i;

export function parseCaption(raw: string | undefined): ParsedCaption {
  if (!raw) return {};
  const clean = stripHtml(raw);
  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result: ParsedCaption = {};

  // Описание = первая непустая строка, которая не начинается с метки.
  // Защита от «Размер: M» как первой строки в кривых постах.
  for (const line of lines) {
    if (!LABEL_RE.test(line) && !/^\d+\s*(?:₽|руб|rub|\$|€)/i.test(line)) {
      // ещё фильтр: не должно быть похоже на «1500 ₽» (это цена)
      result.description = line.slice(0, 200);
      break;
    }
  }

  // Размер: «Размер: M» / «Размер M» / «Размер - M»
  for (const line of lines) {
    const m = line.match(/^размер[\s:\-—]+(.+)$/i);
    if (m) {
      result.size = m[1].trim().slice(0, 10);
      break;
    }
  }

  // Состояние: «Состояние: 8/10» / «Состояние 8/10» / «8/10»
  for (const line of lines) {
    const m =
      line.match(/^состояние[\s:\-—]+(\d+)\s*\/\s*10/i) ||
      line.match(/^состояние[\s:\-—]+(\d+)\b/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n >= 1 && n <= 10) {
        result.condition = n;
        break;
      }
    }
  }

  // Цена: «1500 ₽» / «1500 руб» / «1500₽» / «Цена: 1500 ₽»
  for (const line of lines) {
    const m =
      line.match(/^цена[\s:\-—]+(\d+)/i) ||
      line.match(/^(\d+)\s*(?:₽|руб|rub|\$|€)/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n > 0) {
        result.price = n;
        break;
      }
    }
  }

  return result;
}
