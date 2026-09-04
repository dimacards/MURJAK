<?php
// Приём запроса на оплату → редирект на Robokassa.
//
//   /api/pay.php?items=1:1,3:2      корзина: id:количество через запятую
//   /api/pay.php?id=1               один товар (короткая форма)
//
// Цены НИКОГДА не берутся из запроса — только из data/products.json на сервере.
// Поэтому подменить сумму через URL невозможно.

require __DIR__ . '/_pay-config.php';

$raw = '';
if (isset($_GET['items']) && $_GET['items'] !== '') {
    $raw = $_GET['items'];
} elseif (isset($_GET['id'])) {
    $raw = (int)$_GET['id'] . ':1';
}

$parsed = rk_parse_items($raw);
$items  = $parsed['items'];
$errors = $parsed['errors'];

function pay_fail($msg) {
    header('Content-Type: text/html; charset=utf-8');
    http_response_code(400);
    echo '<!doctype html><meta charset="utf-8">'
       . '<title>Ошибка оплаты</title>'
       . '<body style="background:#0a0a0a;color:#fff;font:15px/1.5 -apple-system,sans-serif;'
       . 'display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:20px;">'
       . '<div><p style="font-size:18px;font-weight:600;">Не получилось перейти к оплате</p>'
       . '<p style="color:#888;">' . htmlspecialchars($msg, ENT_QUOTES, 'UTF-8') . '</p>'
       . '<p><a href="/" style="color:#fff;">Вернуться на сайт</a></p></div></body>';
    exit;
}

if (empty($items)) {
    pay_fail($errors ? implode('; ', $errors) : 'Корзина пуста.');
}

$invId = rk_next_invoice();
$pay   = rk_build_payment($items, $invId);

// Лог заказа — чтобы знать, что за счёт пришёл в письме от Robokassa.
$log = __DIR__ . '/../data/orders.log';
$line = date('Y-m-d H:i:s') . "\t#" . $invId . "\t" . $pay['sum'] . "\t"
      . ($pay['isTest'] ? 'TEST' : 'LIVE') . "\t" . $pay['desc'] . "\n";
@file_put_contents($log, $line, FILE_APPEND | LOCK_EX);

header('Location: ' . $pay['url'], true, 302);
exit;
