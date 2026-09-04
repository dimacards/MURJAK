/**
 * Корзина в localStorage. Позиция = товар + размер (id + size).
 * Один товар в разных размерах = разные позиции. Размер "" — товар без
 * размера (подвеска). Порядок массива = порядок добавления: «−» на карточке
 * убирает последний добавленный размер товара.
 *
 * Цены тут НЕ хранятся — их подставляет сервер (php/api/pay.php),
 * поэтому подменить сумму через браузер невозможно.
 */

const KEY = "murjak-cart";
const EVENT = "murjak-cart-change";

export type CartLine = { id: number; size: string; qty: number };

function read(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => l && typeof l.id === "number")
      .map((l) => ({
        id: l.id,
        size: typeof l.size === "string" ? l.size : "",
        qty: Math.max(1, Math.min(20, Number(l.qty) || 1)),
      }));
  } catch {
    return [];
  }
}

function write(lines: CartLine[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* приватный режим — молча игнорируем */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const cart = {
  get: read,

  /** Всего единиц во всей корзине. */
  count(): number {
    return read().reduce((s, l) => s + l.qty, 0);
  },

  /** Сколько единиц этого товара (сумма по всем размерам). */
  countOf(id: number): number {
    return read()
      .filter((l) => l.id === id)
      .reduce((s, l) => s + l.qty, 0);
  },

  /** Размеры этого товара в корзине, в порядке добавления. */
  sizesOf(id: number): CartLine[] {
    return read().filter((l) => l.id === id);
  },

  /**
   * Добавить единицу товара выбранного размера. Если такая позиция уже есть —
   * увеличиваем количество и делаем её «последней» (чтобы «−» убрал именно её).
   */
  add(id: number, size = "") {
    const lines = read().filter((l) => !(l.id === id && l.size === size));
    const prev = read().find((l) => l.id === id && l.size === size);
    const qty = prev ? Math.min(20, prev.qty + 1) : 1;
    lines.push({ id, size, qty });
    write(lines);
  },

  /** Убрать одну единицу последнего добавленного размера товара. */
  removeLastOf(id: number) {
    const lines = read();
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].id === id) {
        lines[i].qty -= 1;
        if (lines[i].qty <= 0) lines.splice(i, 1);
        write(lines);
        return;
      }
    }
  },

  /** Явно задать количество конкретной позиции (id+size). */
  setQty(id: number, size: string, qty: number) {
    let lines = read();
    if (qty <= 0) {
      lines = lines.filter((l) => !(l.id === id && l.size === size));
    } else {
      const found = lines.find((l) => l.id === id && l.size === size);
      if (found) found.qty = Math.min(20, qty);
      else lines.push({ id, size, qty: Math.min(20, qty) });
    }
    write(lines);
  },

  /** Удалить позицию целиком (id+size). */
  removeLine(id: number, size: string) {
    write(read().filter((l) => !(l.id === id && l.size === size)));
  },

  clear() {
    write([]);
  },

  /** Строка для pay.php: "id:size:qty,..." (size может быть пустым). */
  toQuery(): string {
    return read()
      .map((l) => `${l.id}:${l.size}:${l.qty}`)
      .join(",");
  },

  subscribe(fn: () => void): () => void {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) fn();
    };
    window.addEventListener(EVENT, fn);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, fn);
      window.removeEventListener("storage", onStorage);
    };
  },
};
