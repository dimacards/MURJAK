import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import config from "@/lib/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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
    <html lang="ru" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
