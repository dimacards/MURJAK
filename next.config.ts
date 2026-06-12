import type { NextConfig } from "next";

/**
 * Хост Supabase-проекта для next/image. Берём из SUPABASE_URL, чтобы не
 * хардкодить project-ref; фолбэк — wildcard.
 */
const supabaseHostname = process.env.SUPABASE_URL
  ? new URL(process.env.SUPABASE_URL).hostname
  : "*.supabase.co";

const nextConfig: NextConfig = {
  images: {
    /**
     * Путь storage/v1/object/public/** — публичные объекты бакета.
     * Service-role не нужен: бакет `products` публичный.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHostname,
        pathname: "/storage/v1/object/public/**",
      },
    ],
    /**
     * ТОЛЬКО для локальной разработки. Next 16 добавил SSRF-защиту:
     * резолвит DNS upstream-картинки и блокирует «приватные» IP.
     * Локальный DNS (VPN/фильтр) может резолвить *.supabase.co в
     * служебный диапазон (например 240.0.0.18) — тогда оптимизатор
     * отвечает 400 «"url" parameter is not allowed». В проде (Vercel)
     * резолв нормальный и опция выключена.
     */
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  },
};

export default nextConfig;
