import config from "@/lib/config";
import { TelegramIcon } from "./TelegramIcon";
import styles from "./BuyButton.module.css";

/**
 * Главный CTA — «Написать продавцу». Открывает Telegram продавца с
 * предзаполненным сообщением «Здравствуйте! Интересует {название} ({цена})».
 *
 * Без target="_blank" — намеренно. На iOS Safari открытие t.me через
 * Universal Links в новой вкладке вызывает петлю «This page couldn't load»
 * при возврате. Без _blank Telegram открывается прямо из текущей вкладки.
 */
export function BuyButton({
  productId,
  productName,
  price,
  disabled,
}: {
  productId: number;
  productName: string;
  price: number;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className={`${styles.button} ${styles.disabled}`} aria-disabled="true">
        <TelegramIcon size={18} />
        <span>Нет в наличии</span>
      </span>
    );
  }

  const message =
    `Здравствуйте! Интересует товар №${productId} ` +
    `«${productName}» (${price} ${config.currency})`;

  const href = `https://t.me/${config.sellerUsername}?text=${encodeURIComponent(message)}`;

  return (
    <a href={href} rel="noopener" className={styles.button}>
      <TelegramIcon size={18} />
      <span>Написать продавцу</span>
    </a>
  );
}
