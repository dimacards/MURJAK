import rawConfig from "../config.json";

export type AppConfig = {
  storeName: string;
  sellerUsername: string;
  currency: string;
  // Публичный адрес сайта — для абсолютных ссылок в OG-тегах (превью при шаринге).
  siteUrl: string;
  // Фоновое видео hero-секции на главной (файл в public/).
  heroVideoUrl: string;
};

const config: AppConfig = rawConfig;

export default config;
