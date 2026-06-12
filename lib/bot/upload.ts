import type { Api } from "grammy";
import { supabase, SUPABASE_BUCKET } from "../supabase";

/**
 * Скачивает файл из Telegram по file_id и заливает в Supabase Storage.
 * Работает для фото, PNG-документов (без сжатия, с прозрачностью) и видео.
 *
 * storagePathBase — путь БЕЗ расширения (например products/42/0).
 * Реальное расширение берётся из file_path Telegram'а (jpg/png/webp/mp4…),
 * чтобы PNG с прозрачностью не сохранялся под именем .jpg.
 *
 * Шаги:
 * 1. bot.api.getFile(file_id) → file_path
 * 2. GET https://api.telegram.org/file/bot<TOKEN>/<file_path> → байты
 * 3. supabase.storage.from(bucket).upload(path, bytes)
 * 4. supabase.storage.getPublicUrl(path)
 *
 * Ограничения Telegram: getFile отдаёт file_path только для файлов ≤ 20 MB.
 */
export async function uploadTelegramPhotoToSupabase(
  api: Api,
  fileId: string,
  storagePathBase: string
): Promise<{ storagePath: string; publicUrl: string }> {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN не задан");

  // 1. Запросить file_path у Telegram
  const fileInfo = await api.getFile(fileId);
  if (!fileInfo.file_path) {
    throw new Error(
      `Telegram не вернул file_path для file_id=${fileId} (файл слишком большой?).`
    );
  }

  // 2. Скачать
  const url = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Не удалось скачать фото из Telegram: HTTP ${res.status}`
    );
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  // 3. Определить расширение и content-type из реального file_path
  const ext = fileInfo.file_path.split(".").pop()?.toLowerCase() ?? "jpg";
  const contentType =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "mp4"
          ? "video/mp4"
          : ext === "mov"
            ? "video/quicktime"
            : ext === "webm"
              ? "video/webm"
              : "image/jpeg";
  const storagePath = `${storagePathBase}.${ext}`;

  // 4. Залить в Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`Supabase upload error: ${uploadError.message}`);
  }

  // 5. Получить публичный URL (bucket публичный)
  const { data } = supabase.storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(storagePath);

  return { storagePath, publicUrl: data.publicUrl };
}
