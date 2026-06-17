import { getAllProducts } from "@/lib/products";
import { HomeShell } from "@/components/HomeShell";

/**
 * Главная: статический список товаров из JSON → клиентская оболочка HomeShell
 * (hero + секция «Товары», снап-механика). Никакой БД/SSR — сайт собирается
 * полностью статически.
 */
export default function Home() {
  return <HomeShell items={getAllProducts()} />;
}
