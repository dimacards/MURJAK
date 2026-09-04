<?php
// ============================================================
//  НАСТРОЙКИ ROBOKASSA — единственный файл, который надо править
// ============================================================
//
// ВАЖНО: без зарегистрированного магазина оплата НЕ протестируется.
// Анонимного тест-магазина с публичным паролем у Robokassa нет —
// с текущими заглушками страница оплаты выдаёт «ошибку 25»
// (магазин не активирован). Это нормально до регистрации.
//
// Порядок подключения:
//   1. Зарегистрировать магазин в Robokassa (нужен ИП / самозанятость).
//   2. Личный кабинет → «Технические настройки».
//   3. Вписать сюда MerchantLogin и Пароль #1 / Пароль #2.
//   4. Для отладки без списаний — взять ТЕСТОВЫЕ пароли из того же раздела
//      и оставить RK_TEST = true. Для боевого приёма — RK_TEST = false.

// --- Боевые данные (из «Технических настроек» магазина) ---
define('RK_LOGIN',  'ВПИШИ_MERCHANTLOGIN');  // идентификатор магазина
define('RK_PASS1',  'ВПИШИ_ПАРОЛЬ_1');       // Пароль #1 — подпись ссылки
define('RK_PASS2',  'ВПИШИ_ПАРОЛЬ_2');       // Пароль #2 — проверка уведомлений

// --- Тестовые данные (блок «Тестовые пароли» в тех. настройках) ---
define('RK_TEST_LOGIN', 'ВПИШИ_MERCHANTLOGIN'); // логин тот же, что и боевой
define('RK_TEST_PASS1', 'ВПИШИ_ТЕСТ_ПАРОЛЬ_1');
define('RK_TEST_PASS2', 'ВПИШИ_ТЕСТ_ПАРОЛЬ_2');

// true  — тестовый режим (IsTest=1), деньги НЕ списываются
// false — боевой режим, реальные платежи
define('RK_TEST', true);

// Куда вернуть покупателя после оплаты. Можно указать любой внешний адрес:
// свой сайт требует HTTPS, поэтому по умолчанию — Telegram продавца.
define('RK_SUCCESS_URL', 'https://t.me/mishoops');
define('RK_FAIL_URL',    'https://t.me/mishoops');

// ============================================================
//  Дальше править не нужно
// ============================================================

function rk_login() { return RK_TEST ? RK_TEST_LOGIN : RK_LOGIN; }
function rk_pass1() { return RK_TEST ? RK_TEST_PASS1 : RK_PASS1; }
function rk_pass2() { return RK_TEST ? RK_TEST_PASS2 : RK_PASS2; }

/** Каталог товаров — источник правды по ценам (клиент их не передаёт). */
function rk_products() {
    $f = __DIR__ . '/../data/products.json';
    if (!is_file($f)) return array();
    $j = json_decode(@file_get_contents($f), true);
    return is_array($j) ? $j : array();
}

/** Товар по id, либо null. */
function rk_find_product($id) {
    foreach (rk_products() as $p) {
        if ((string)$p['id'] === (string)$id) return $p;
    }
    return null;
}

/** Карта наличия из stock.json (её же правит админка). */
function rk_stock() {
    $f = __DIR__ . '/../data/stock.json';
    if (!is_file($f)) return array();
    $j = json_decode(@file_get_contents($f), true);
    return is_array($j) ? $j : array();
}

function rk_in_stock($id) {
    $s = rk_stock();
    return isset($s[(string)$id]) ? (bool)$s[(string)$id] : true;
}

/** Новый номер счёта. Хранится в data/invoice.txt, растёт на 1. */
function rk_next_invoice() {
    $f = __DIR__ . '/../data/invoice.txt';
    $n = is_file($f) ? (int)@file_get_contents($f) : 0;
    $n++;
    @file_put_contents($f, (string)$n, LOCK_EX);
    return $n;
}

/**
 * Собирает подписанную ссылку на оплату.
 *
 * @param array $items  позиции: [['name'=>..,'price'=>..,'qty'=>..], ...]
 * @param int   $invId  номер счёта
 * @return array ['url'=>..., 'sum'=>..., 'signature'=>..., 'base'=>...]
 */
function rk_build_payment($items, $invId) {
    $sum = 0;
    foreach ($items as $it) {
        $sum += $it['price'] * $it['qty'];
    }
    $outSum = number_format($sum, 2, '.', '');

    $names = array();
    foreach ($items as $it) {
        $names[] = $it['name'] . ($it['qty'] > 1 ? ' x' . $it['qty'] : '');
    }
    $desc = mb_substr(implode(', ', $names), 0, 100, 'UTF-8');

    // Подпись: MerchantLogin:OutSum:InvId:Пароль#1
    $base = rk_login() . ':' . $outSum . ':' . $invId . ':' . rk_pass1();
    $sig  = md5($base);

    $params = array(
        'MerchantLogin'  => rk_login(),
        'OutSum'         => $outSum,
        'InvId'          => $invId,
        'Description'    => $desc,
        'SignatureValue' => $sig,
        'Culture'        => 'ru',
        'Encoding'       => 'utf-8',
    );
    if (RK_TEST) $params['IsTest'] = 1;

    $url = 'https://auth.robokassa.ru/Merchant/Index.aspx?' . http_build_query($params);

    return array(
        'url'       => $url,
        'sum'       => $outSum,
        'invId'     => $invId,
        'signature' => $sig,
        'base'      => $base,
        'desc'      => $desc,
        'isTest'    => RK_TEST,
    );
}

/**
 * Разбирает список позиций из строки вида "1:M:2,3::1"
 * (id:размер:количество). Совместимо и со старым "id:qty" (без размера).
 * Цены и названия подставляются с сервера — из URL берутся только id/размер.
 */
function rk_parse_items($raw) {
    $items = array();
    $errors = array();
    foreach (explode(',', (string)$raw) as $chunk) {
        $chunk = trim($chunk);
        if ($chunk === '') continue;
        $parts = explode(':', $chunk);
        $id = (int)$parts[0];
        if (count($parts) >= 3) {
            // формат id:size:qty
            $size = trim($parts[1]);
            $qty  = max(1, min(20, (int)$parts[2]));
        } else {
            // старый формат id:qty
            $size = '';
            $qty  = isset($parts[1]) ? max(1, min(20, (int)$parts[1])) : 1;
        }
        // размер — только буквы/цифры, максимум 8 символов (защита)
        $size = preg_replace('/[^A-Za-zА-Яа-я0-9]/u', '', $size);
        $size = mb_substr($size, 0, 8, 'UTF-8');

        $p = rk_find_product($id);
        if (!$p) { $errors[] = "товар $id не найден"; continue; }
        if (!rk_in_stock($id)) { $errors[] = "«{$p['name']}» нет в наличии"; continue; }
        $items[] = array(
            'id'    => $id,
            'name'  => $p['name'] . ($size !== '' ? " ($size)" : ''),
            'price' => (float)$p['price'],
            'qty'   => $qty,
            'size'  => $size,
        );
    }
    return array('items' => $items, 'errors' => $errors);
}
