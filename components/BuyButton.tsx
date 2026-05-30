import config from "@/lib/config";
import { TelegramIcon } from "./TelegramIcon";
import styles from "./BuyButton.module.css";

/**
 * Главный CTA — «Купить в Telegram». Чёрная кнопка с белой иконкой и текстом.
 *
 * Без target="_blank" — это намеренно. На iOS Safari открытие t.me в новой
 * вкладке через Universal Links вызывает петлю «This page couldn't load»
 * при возврате. Без _blank Telegram открывается прямо из текущей вкладки,
 * а «назад» нормально возвращает на страницу товара. (См. историю Этапа 11.)
 */
export function BuyButton({
  productId,
  productTitle,
  size,
  price,
}: {
  productId: number;
  productTitle: string;
  size: string;
  price: number;
}) {
  const message =
    `Здравствуйте! Интересует товар №${productId} ` +
    `«${productTitle}» (размер ${size}, ${price} ${config.currency})`;

  const href = `https://t.me/${config.sellerUsername}?text=${encodeURIComponent(message)}`;

  return (
    <a href={href} rel="noopener" className={styles.button}>
      <TelegramIcon size={18} />
      <span>Купить в Telegram</span>
    </a>
  );
}
