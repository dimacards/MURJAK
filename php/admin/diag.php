<?php
// Диагностика — открой /admin/diag.php если /admin/ не работает.
// Удали этот файл после успешной проверки.

header('Content-Type: text/plain; charset=utf-8');

echo "=== MURJAK admin diagnostics ===\n\n";
echo "PHP version:           " . PHP_VERSION . "\n";
echo "SAPI:                  " . php_sapi_name() . "\n";
echo "Server:                " . (isset($_SERVER['SERVER_SOFTWARE']) ? $_SERVER['SERVER_SOFTWARE'] : 'n/a') . "\n";
echo "HTTPS:                 " . (!empty($_SERVER['HTTPS']) ? $_SERVER['HTTPS'] : 'off') . "\n";
echo "X-Forwarded-Proto:     " . (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) ? $_SERVER['HTTP_X_FORWARDED_PROTO'] : '—') . "\n";
echo "Document root:         " . (isset($_SERVER['DOCUMENT_ROOT']) ? $_SERVER['DOCUMENT_ROOT'] : 'n/a') . "\n";
echo "Script:                " . __FILE__ . "\n\n";

echo "--- проверка путей ---\n";
$auth = __DIR__ . '/_auth.php';
$data = __DIR__ . '/../data';
$stock = $data . '/stock.json';
$prods = $data . '/products.json';

echo "_auth.php exists:      " . (is_file($auth) ? 'YES' : 'NO') . "\n";
echo "data/ exists:          " . (is_dir($data) ? 'YES' : 'NO') . "\n";
echo "data/ writable:        " . (is_writable($data) ? 'YES' : 'NO') . "\n";
echo "stock.json exists:     " . (is_file($stock) ? 'YES' : 'NO') . "\n";
echo "stock.json readable:   " . (is_readable($stock) ? 'YES' : 'NO') . "\n";
echo "stock.json writable:   " . (is_writable($stock) ? 'YES' : 'NO') . "\n";
echo "products.json exists:  " . (is_file($prods) ? 'YES' : 'NO') . "\n\n";

echo "--- проверка сессии ---\n";
@session_set_cookie_params(0, '/', '', false, true);
@session_name('MURJAK_DIAG');
$ok = @session_start();
echo "session_start():       " . ($ok ? 'YES' : 'NO') . "\n";
echo "session save path:     " . session_save_path() . "\n";

echo "\n--- проверка функций ---\n";
echo "random_bytes:          " . (function_exists('random_bytes') ? 'YES' : 'NO') . "\n";
echo "hash_equals:           " . (function_exists('hash_equals') ? 'YES' : 'NO') . "\n";
echo "json_decode:           " . (function_exists('json_decode') ? 'YES' : 'NO') . "\n";

echo "\n=== /конец ===\n";
echo "Если всё YES — должно работать. Если что-то NO — копируй вывод, пришли.\n";
