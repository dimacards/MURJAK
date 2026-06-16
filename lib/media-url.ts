/**
 * Доставка медиа через CDN (Gcore) для России.
 *
 * Видео лежит в Supabase Storage (origin за рубежом), а в РФ крупные файлы
 * душит провайдер — поэтому видео не догружалось. Перед отдачей на фронт
 * подменяем хост Supabase на наш CDN-домен: Gcore тянет файл из Supabase
 * один раз и раздаёт его с узлов внутри РФ.
 *
 * Домен берётся из NEXT_PUBLIC_MEDIA_CDN_HOST (например, `cdn.murjak.ru`).
 * Если переменная не задана — возвращаем URL как есть (no-op), ничего не ломаем.
 * Путь у Supabase и Gcore одинаковый, поэтому меняем ТОЛЬКО хост.
 *
 * Применяем к видео; фото остаются на Supabase (мелкие, грузятся нормально).
 */
const CDN_HOST = process.env.NEXT_PUBLIC_MEDIA_CDN_HOST?.trim();

export function cdnUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!CDN_HOST) return url;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".supabase.co")) {
      u.protocol = "https:";
      u.host = CDN_HOST; // host = hostname + порт; порт сбрасывается
      return u.toString();
    }
  } catch {
    // строка не похожа на URL — отдаём как есть
  }
  return url;
}
