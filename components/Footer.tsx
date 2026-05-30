import config from "@/lib/config";
import styles from "./Footer.module.css";

/**
 * Подвал с ссылкой на Telegram-канал магазина. Показываем только если
 * channelUsername задан в config.json.
 */
export function Footer() {
  if (!config.channelUsername) return null;

  return (
    <footer className={styles.footer}>
      <div className="container">
        <p className={styles.text}>
          Новые товары первыми в нашем Telegram-канале:{" "}
          <a
            href={`https://t.me/${config.channelUsername}`}
            rel="noopener"
            className={styles.link}
          >
            @{config.channelUsername}
          </a>
        </p>
      </div>
    </footer>
  );
}
