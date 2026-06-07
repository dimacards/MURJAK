import config from "@/lib/config";
import styles from "./Footer.module.css";

/**
 * Минимальный подвал — название бренда и ссылка на Telegram продавца.
 */
export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <p className={styles.text}>
          {config.storeName} ·{" "}
          <a
            href={`https://t.me/${config.sellerUsername}`}
            rel="noopener"
            className={styles.link}
          >
            @{config.sellerUsername}
          </a>
        </p>
      </div>
    </footer>
  );
}
