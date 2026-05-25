import rawConfig from "../config.json";

export type AppConfig = {
  storeName: string;
  sellerUsername: string;
  channelUsername: string;
  currency: string;
};

const config: AppConfig = rawConfig;

export default config;
