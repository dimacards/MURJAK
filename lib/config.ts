import rawConfig from "../config.json";

export type AppConfig = {
  storeName: string;
  sellerUsername: string;
  // Поле осталось от винтажного проекта (была интеграция с TG-каналом).
  // Уберём на этапе 2 вместе с переписыванием Footer/бота.
  channelUsername?: string;
  currency: string;
};

const config: AppConfig = rawConfig;

export default config;
