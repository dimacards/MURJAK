import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Разрешаем next/image грузить фотографии из Supabase Storage.
     * Wildcard `*.supabase.co` подходит под любой проект Supabase —
     * наш кодбейс универсальный, на каждом магазине свой проект.
     *
     * Путь storage/v1/object/public/** — это публичные объекты бакета.
     * Service-role не нужен: бакет `vintagestoretest` (и аналогичные)
     * публичный, ссылки в Photo.publicUrl открываются без авторизации.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
