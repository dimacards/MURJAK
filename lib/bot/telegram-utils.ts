import { GrammyError } from "grammy";

/**
 * Проверяет, является ли ошибка результатом попытки отредактировать сообщение
 * на ТО ЖЕ содержимое (Telegram отвечает 400 «message is not modified»).
 *
 * Возникает регулярно при `editMessageText` / `editMessageCaption` если ни
 * текст, ни клавиатура не поменялись. Семантически это успех — игнорируем.
 */
export function isNotModifiedError(e: unknown): boolean {
  return (
    e instanceof GrammyError &&
    e.error_code === 400 &&
    /message is not modified/i.test(e.description)
  );
}

/**
 * Ошибки редактирования, которые безопасно игнорировать:
 *  - «message is not modified» — контент не изменился.
 *  - «message to edit not found» — сообщение удалили вручную, а id в БД остался.
 *  - «message can't be edited» — слишком старое или не наше.
 *
 * Все они означают «редактировать нечего/нельзя, но это не повод падать с 500».
 * Используется в channel.ts вокруг editMessage*.
 */
export function isIgnorableEditError(e: unknown): boolean {
  if (!(e instanceof GrammyError)) return false;
  if (e.error_code !== 400) return false;
  return /message is not modified|message to edit not found|message can't be edited/i.test(
    e.description
  );
}
