/**
 * Парсер подписи поста из канала.
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
 * Но импортируем мы и СТАРЫЕ посты, до бота. Их форматы непредсказуемы:
 *   «1 500 ₽», «1500₽», «💰 1500 ₽», «Цена 1500», «1500 р.»,
 *   «1500 рублей», «Стоимость: 1500». Парсер старается выжать всё.
 */

export type ParsedCaption = {
  description?: string;
  size?: string;
  condition?: number;
  price?: number;
};

/** Убирает HTML-теги (мы постим parse_mode=HTML) и декодирует основные entities. */
function stripHtml(s: string): string {
  return s
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ────────────────────────────────────────────────────────────────────────────
// Цена — самая капризная часть. Несколько паттернов в порядке убывания
// строгости. Возвращаем первый успешный.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Захватывает число с опциональными разделителями тысяч (пробел, обычный/
 * неразрывный/тонкий пробел, точка или запятая в качестве thousand sep).
 *
 * Примеры: «1500», «1 500», «1 500», «1.500», «1,500», «12 345 678».
 *
 * НЕ ловит «1500.50» (две цифры после точки — это уже десятые) и нечисло.
 */
const NUMBER = String.raw`(\d{1,3}(?:[\s   .,]\d{3})+|\d+)`;

/** Валюта ПОСЛЕ числа: «1500 ₽», «1500р.», «1500 руб», «1500 рублей».
 *
 * Внимание: `\b` в JS regex — ASCII-only, для кириллицы он не работает.
 * Поэтому вместо `\bр\.?` используем lookbehind `(?<![а-я])р\.?` — «р»
 * не должна быть продолжением другого слова (например, «размер»).
 */
const CURRENCY_AFTER = String.raw`\s*(?:₽|руб(?:л(?:ь|я|ей|ём|ями|ях))?|(?<![а-яa-zё])р\.?(?:\s|$)|rub|\$|€)`;
/** Валюта ПЕРЕД числом: «₽1500», «$1500». «р» сюда не вошёл — слишком слабо. */
const CURRENCY_BEFORE = String.raw`(?:₽|\$|€)\s*`;
/** Лейбл цены: «Цена: 1500», «Стоимость 1500», «Стоит 1500». */
const PRICE_LABEL = String.raw`(?:цена|стоит|стоимость|цен[\s:])`;

const PATTERNS: RegExp[] = [
  // 1. число + валюта (самый частый случай: «1500 ₽», «1 500₽»)
  new RegExp(NUMBER + CURRENCY_AFTER, "i"),
  // 2. валюта + число («₽1500»)
  new RegExp(CURRENCY_BEFORE + NUMBER, "i"),
  // 3. лейбл цены + число («Цена: 1500», без валюты)
  new RegExp(PRICE_LABEL + String.raw`[\s:\-—]+` + NUMBER, "i"),
];

/** Извлекает целое из захваченной группы, очищая разделители. */
function digitsToInt(raw: string): number | undefined {
  const cleaned = raw.replace(/[\s   .,]/g, "");
  const n = Number(cleaned);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

function parsePrice(lines: string[]): number | undefined {
  for (const line of lines) {
    for (const re of PATTERNS) {
      const m = line.match(re);
      if (m) {
        const n = digitsToInt(m[1]);
        if (n !== undefined) return n;
      }
    }
  }
  return undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Размер, состояние, описание
// ────────────────────────────────────────────────────────────────────────────

const LABEL_RE = /^(размер|состояние|цена|стоит|стоимость|купить|sold|продано)\b/i;
/** Похоже на «цену саму по себе» — пропускаем при выборе описания. */
const LOOKS_LIKE_PRICE = new RegExp(NUMBER + CURRENCY_AFTER, "i");

function parseSize(lines: string[]): string | undefined {
  for (const line of lines) {
    const m = line.match(/размер[\s:\-—]+(\S+(?:\s+\S+)*?)$/i);
    if (m) {
      const v = m[1].trim();
      if (v.length > 0 && v.length <= 10) return v;
    }
  }
  return undefined;
}

function parseCondition(lines: string[]): number | undefined {
  for (const line of lines) {
    const m =
      line.match(/состояние[\s:\-—]+(\d+)\s*\/\s*10/i) ||
      line.match(/состояние[\s:\-—]+(\d+)\b/i) ||
      line.match(/^(\d+)\s*\/\s*10$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n >= 1 && n <= 10) return n;
    }
  }
  return undefined;
}

function parseDescription(lines: string[]): string | undefined {
  for (const line of lines) {
    if (LABEL_RE.test(line)) continue;
    if (LOOKS_LIKE_PRICE.test(line)) continue;
    // Тоже скорее цена: одно число + (опц) валютная буква, без других слов.
    if (/^\d[\d\s .,]*(?:\s*(?:₽|\$|€|р\.?|руб))?$/i.test(line)) continue;
    return line.slice(0, 200);
  }
  return undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Главная функция
// ────────────────────────────────────────────────────────────────────────────

export function parseCaption(raw: string | undefined): ParsedCaption {
  if (!raw) return {};
  const clean = stripHtml(raw);
  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return {
    description: parseDescription(lines),
    size: parseSize(lines),
    condition: parseCondition(lines),
    price: parsePrice(lines),
  };
}
