import type { Metadata } from "next";
import { getAllProducts } from "@/lib/products";
import { Footer } from "@/components/Footer";
import { CartView } from "@/components/CartView";
import { ScrollTop } from "@/components/ScrollTop";

export const metadata: Metadata = {
  title: "Корзина",
  robots: { index: false, follow: false },
};

/**
 * Корзина. Состав хранится в localStorage браузера, а цены и названия
 * берутся из статического каталога — он же уходит в CartView пропом,
 * чтобы страница осталась полностью статической.
 */
export default function CartPage() {
  return (
    <>
      <ScrollTop />
      <CartView products={getAllProducts()} />
      <Footer />
    </>
  );
}
