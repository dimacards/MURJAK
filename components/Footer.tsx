import styles from "./Footer.module.css";

/**
 * Минимальный подвал — кто сделал сайт.
 */
export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <p className={styles.text}>
          сайт сделан{" "}
          <a
            href="https://t.me/dm_aristov"
            rel="noopener"
            className={styles.link}
          >
            @dm_aristov
          </a>
        </p>
      </div>
    </footer>
  );
}
