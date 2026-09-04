import type { NextConfig } from "next";

/**
 * Сайт собирается как полностью статический (`output: "export"`): на выходе
 * готовые HTML/CSS/JS + ассеты в папке `out/`, которые можно залить на любой
 * хостинг (в т.ч. российский) — без Node, БД и обращений за границу.
 *
 * `images.unoptimized` — статический экспорт не умеет серверную оптимизацию
 * картинок (нет рантайма), поэтому отдаём фото как есть из `public/`.
 */
const nextConfig: NextConfig = {
  output: "export",
  // На обычном хостинге (Apache/Nginx) /products/1 должен открываться без
  // .htaccess: trailingSlash делает структуру вида products/1/index.html,
  // которую сервер отдаёт сам.
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
