import { InlineKeyboard } from "grammy";

/**
 * Меню выбора поля для редактирования товара. Используется из листалки
 * /products в ЛС (кнопка «✏️ Редактировать» на карточке).
 *
 * Колбэки: editfield:{id}:{field} — обрабатываются в lib/bot/index.ts,
 * входят в editProductConversation. Отмена → editcancel:{id} закрывает меню.
 */
export function buildEditFieldMenu(productId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("📝 Название", `editfield:${productId}:description`)
    .text("📷 Фото", `editfield:${productId}:photos`)
    .row()
    .text("🏷 Категория", `editfield:${productId}:category`)
    .text("📏 Размер", `editfield:${productId}:size`)
    .row()
    .text("⭐ Состояние", `editfield:${productId}:condition`)
    .text("💰 Цена", `editfield:${productId}:price`)
    .row()
    .text("↩️ Отмена", `editcancel:${productId}`);
}
