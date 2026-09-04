<?php
// Публичный endpoint: возвращает карту наличия товаров.
// Формат: { "1": true, "2": false, ... }

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('Access-Control-Allow-Origin: *');

$file = __DIR__ . '/../data/stock.json';
if (!is_file($file)) {
    echo '{}';
    exit;
}
echo file_get_contents($file);
