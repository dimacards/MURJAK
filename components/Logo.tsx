import Link from "next/link";
import config from "@/lib/config";
import styles from "./Logo.module.css";

/**
 * Лого магазина. Пока — текст storeName жирным, кликабелен → главная.
 * Позже сюда можно подсунуть SVG-логотип конкретного магазина.
 */
export function Logo() {
  return (
    <Link href="/" className={styles.logo} aria-label={config.storeName}>
      {config.storeName}
    </Link>
  );
}
