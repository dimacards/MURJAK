import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import config from "@/lib/config";
import { SiteNav } from "@/components/SiteNav";
import { PageFade } from "@/components/PageFade";
import { ViewportHeight } from "@/components/ViewportHeight";
import "./globals.css";

// Manrope — основной шрифт всего сайта по макету
// (Regular 400 / Medium 500 / SemiBold 600 / Bold 700).
const manrope = Manrope({
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "cyrillic"],
});

const siteUrl = config.siteUrl;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: config.storeName,
    template: `%s · ${config.storeName}`,
  },
  description: `Витрина бренда ${config.storeName}`,
  openGraph: {
    title: config.storeName,
    description: `Витрина бренда ${config.storeName}`,
    type: "website",
    locale: "ru_RU",
    siteName: config.storeName,
  },
  twitter: {
    card: "summary_large_image",
    title: config.storeName,
    description: `Витрина бренда ${config.storeName}`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={manrope.variable}>
      <body>
        <ViewportHeight />
        <SiteNav />
        <PageFade />
        {children}
      </body>
    </html>
  );
}
