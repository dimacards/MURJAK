import config from "@/lib/config";

export default function Home() {
  return (
    <main>
      <p>Магазин: {config.storeName}. Этап 0 готов.</p>
    </main>
  );
}
