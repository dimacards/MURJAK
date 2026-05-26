import { GrammyError } from "grammy";

/**
 * Проверяет, является ли ошибка результатом попытки отредактировать сообщение
 * на ТО ЖЕ содержимое (Telegram отвечает 400 «message is not modified»).
 *
 * Возникает регулярно при `editMessageText` / `editMessageCaption` если ни
 * текст, ни клавиатура не поменялись. Например, при редактировании размера
 * товара текст `buildServiceControlText` не меняется (там только id, категория
 * и цена), и Telegram ругается. Семантически это успех — можно игнорировать.
 */
export function isNotModifiedError(e: unknown): boolean {
  return (
    e instanceof GrammyError &&
    e.error_code === 400 &&
    /message is not modified/i.test(e.description)
  );
}
