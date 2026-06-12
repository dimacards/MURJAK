import rawConfig from "../config.json";

export type AppConfig = {
  storeName: string;
  sellerUsername: string;
  currency: string;
  // Фоновое видео hero-секции на главной (лежит в Supabase Storage).
  heroVideoUrl: string;
};

const config: AppConfig = rawConfig;

export default config;
