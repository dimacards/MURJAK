import { createClient } from "@supabase/supabase-js";

// Supabase клиент с service_role ключом — обходит RLS, может писать в Storage.
// Использовать только на сервере (никогда не возвращать в браузер).

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url) throw new Error("SUPABASE_URL не задан в .env");
if (!key) throw new Error("SUPABASE_SERVICE_KEY не задан в .env");

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET ?? "products";
