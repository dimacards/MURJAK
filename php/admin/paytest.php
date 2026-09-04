<?php
// Тестер оплаты. Показывает, что именно уйдёт в Robokassa, и даёт
// перейти на настоящую платёжную страницу в тестовом режиме.
// Открывать: /admin/paytest.php  (за логином админки)

require __DIR__ . '/_auth.php';
require __DIR__ . '/../api/_pay-config.php';

if (!admin_is_authed()) {
    header('Location: /admin/');
    exit;
}

function e($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

$products = rk_products();
$stock    = rk_stock();

// Что выбрано для проверки
$sel = isset($_GET['sel']) ? $_GET['sel'] : '';
if ($sel === '' && $products) $sel = $products[0]['id'] . ':1';

$parsed = rk_parse_items($sel);
$items  = $parsed['items'];
$errors = $parsed['errors'];

$preview = null;
if ($items) {
    // Номер счёта не инкрементим — это только предпросмотр
    $preview = rk_build_payment($items, 999999);
}

// Проверки окружения
$checks = array(
    'PHP версия'              => PHP_VERSION,
    'md5() доступна'          => function_exists('md5') ? 'да' : 'НЕТ',
    'mb_substr() доступна'    => function_exists('mb_substr') ? 'да' : 'НЕТ (описание не обрежется)',
    'products.json читается'  => $products ? 'да, товаров: ' . count($products) : 'НЕТ',
    'stock.json читается'     => $stock ? 'да' : 'пусто (все в наличии)',
    'data/ доступна на запись'=> is_writable(__DIR__ . '/../data') ? 'да' : 'НЕТ — счётчик заказов не сохранится',
    'Режим'                   => RK_TEST ? 'ТЕСТОВЫЙ (деньги не спишутся)' : 'БОЕВОЙ — реальные платежи!',
    'MerchantLogin'           => rk_login(),
);
?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MURJAK · тест оплаты</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin:0; padding:32px 20px; background:#0a0a0a; color:#fff;
    font:15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .wrap { max-width: 760px; margin: 0 auto; }
  h1 { font-size:22px; margin:0 0 6px; }
  h2 { font-size:15px; margin:28px 0 12px; color:#9a9a9a; font-weight:600;
       text-transform:uppercase; letter-spacing:.06em; }
  .sub { color:#888; margin:0 0 24px; }
  a { color:#fff; }
  .card { background:#141414; border:1px solid #1f1f1f; border-radius:10px; padding:16px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:7px 0; border-bottom:1px solid #1c1c1c; vertical-align:top; }
  td:first-child { color:#8a8a8a; width:44%; }
  tr:last-child td { border-bottom:0; }
  .bad { color:#ff8a8a; }
  .good { color:#8affa8; }
  .warn { background:#3a2a10; color:#ffd9a0; padding:10px 14px; border-radius:8px; margin-bottom:18px; }
  .err { background:#3a1010; color:#ffb4b4; padding:10px 14px; border-radius:8px; margin-bottom:18px; }
  code, .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size:12.5px; }
  .url { word-break:break-all; background:#0f0f0f; border:1px solid #222; border-radius:8px;
         padding:12px; margin:10px 0; }
  .btn { display:inline-block; padding:13px 20px; background:#fff; color:#000;
         border-radius:8px; font-weight:600; text-decoration:none; border:0;
         cursor:pointer; font:inherit; font-weight:600; min-height:46px; line-height:22px; }
  .btn.ghost { background:transparent; color:#fff; border:1px solid #2a2a2a; }
  .picker { display:grid; gap:8px; margin-bottom:8px; }
  .picker label { display:flex; align-items:center; gap:10px; padding:10px 12px;
                  background:#141414; border:1px solid #1f1f1f; border-radius:8px; cursor:pointer; }
  .picker input { width:18px; height:18px; }
  .picker .price { margin-left:auto; color:#9a9a9a; }
  .off { opacity:.45; }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:14px; }
  .steps { padding-left:20px; }
  .steps li { margin-bottom:8px; }
</style>
</head>
<body>
<div class="wrap">

  <h1>Тест оплаты</h1>
  <p class="sub">Проверка связки с Robokassa до подключения реального магазина.</p>

  <?php
  $placeholder = (strpos(rk_login(), 'ВПИШИ') !== false);
  if ($placeholder): ?>
    <div class="err">
      <strong>Магазин не подключён.</strong> В <code>api/_pay-config.php</code>
      ещё стоят заглушки, поэтому Robokassa вернёт «ошибку&nbsp;25»
      (магазин не активирован). Это ожидаемо. Впиши MerchantLogin и пароли
      после регистрации — и тест заработает. Всё остальное ниже уже можно
      проверять: сумма, подпись, редирект через <code>pay.php</code>.
    </div>
  <?php endif; ?>

  <?php if (RK_TEST): ?>
    <div class="warn">
      <strong>Тестовый режим.</strong> Деньги не списываются.
      Логин магазина — <code><?= e(rk_login()) ?></code>.
      Когда зарегистрируешь свой магазин, впиши данные в
      <code>api/_pay-config.php</code> и поставь <code>RK_TEST = false</code>.
    </div>
  <?php else: ?>
    <div class="err"><strong>БОЕВОЙ РЕЖИМ.</strong> Платежи настоящие.</div>
  <?php endif; ?>

  <h2>Окружение</h2>
  <div class="card">
    <table>
      <?php foreach ($checks as $k => $v): ?>
        <tr>
          <td><?= e($k) ?></td>
          <td class="<?= (stripos($v, 'НЕТ') === 0 ? 'bad' : '') ?>"><?= e($v) ?></td>
        </tr>
      <?php endforeach; ?>
    </table>
  </div>

  <h2>Что покупаем</h2>
  <form method="get" class="picker">
    <?php foreach ($products as $p):
      $id = (string)$p['id'];
      $in = isset($stock[$id]) ? (bool)$stock[$id] : true;
      $checked = strpos($sel, $id . ':') !== false;
    ?>
      <label class="<?= $in ? '' : 'off' ?>">
        <input type="checkbox" name="pick[]" value="<?= e($id) ?>"
               <?= $checked ? 'checked' : '' ?> <?= $in ? '' : 'disabled' ?>>
        <span><?= e($p['name']) ?><?= $in ? '' : ' — нет в наличии' ?></span>
        <span class="price"><?= e($p['price']) ?> ₽</span>
      </label>
    <?php endforeach; ?>
    <div class="row">
      <button class="btn ghost" type="submit" name="go" value="1">пересчитать</button>
    </div>
  </form>

  <?php
  // Если пришёл pick[] — пересобираем sel и перезагружаем расчёт
  if (isset($_GET['pick']) && is_array($_GET['pick'])) {
      $parts = array();
      foreach ($_GET['pick'] as $pid) $parts[] = (int)$pid . ':1';
      $sel = implode(',', $parts);
      $parsed = rk_parse_items($sel);
      $items  = $parsed['items'];
      $errors = $parsed['errors'];
      $preview = $items ? rk_build_payment($items, 999999) : null;
  }
  ?>

  <?php if ($errors): ?>
    <div class="err"><?= e(implode('; ', $errors)) ?></div>
  <?php endif; ?>

  <?php if ($preview): ?>
    <h2>Что уйдёт в Robokassa</h2>
    <div class="card">
      <table>
        <tr><td>Позиции</td><td>
          <?php foreach ($items as $it): ?>
            <?= e($it['name']) ?> × <?= e($it['qty']) ?> — <?= e(number_format($it['price'] * $it['qty'], 2, '.', '')) ?> ₽<br>
          <?php endforeach; ?>
        </td></tr>
        <tr><td>Сумма (OutSum)</td><td class="good mono"><?= e($preview['sum']) ?></td></tr>
        <tr><td>Номер счёта (InvId)</td><td class="mono"><?= e($preview['invId']) ?> <span style="color:#666">(в бою — сквозная нумерация)</span></td></tr>
        <tr><td>Описание</td><td><?= e($preview['desc']) ?></td></tr>
        <tr><td>Строка для подписи</td><td class="mono" style="word-break:break-all;">
          <?= e(preg_replace('/:[^:]+$/', ':•••пароль•••', $preview['base'])) ?>
        </td></tr>
        <tr><td>SignatureValue (MD5)</td><td class="mono"><?= e($preview['signature']) ?></td></tr>
      </table>
    </div>

    <h2>Готовая ссылка</h2>
    <div class="url mono"><?= e($preview['url']) ?></div>

    <div class="row">
      <a class="btn" href="<?= e($preview['url']) ?>" target="_blank" rel="noopener">
        открыть страницу оплаты →
      </a>
      <a class="btn ghost" href="/api/pay.php?items=<?= e(urlencode($sel)) ?>" target="_blank" rel="noopener">
        проверить через pay.php
      </a>
    </div>
  <?php endif; ?>

  <h2>Как понять, что всё работает</h2>
  <ol class="steps">
    <li>В блоке «Окружение» нет красных «НЕТ».</li>
    <li>Кнопка «открыть страницу оплаты» ведёт на <code>auth.robokassa.ru</code>
        и там видна <strong>та же сумма</strong>, что и здесь.</li>
    <li>Если Robokassa пишет про неверную подпись — значит логин и пароли
        в <code>api/_pay-config.php</code> не совпадают с настройками магазина.</li>
    <li>Кнопка «проверить через pay.php» должна привести туда же —
        это тот путь, которым пойдёт реальный покупатель с сайта.</li>
  </ol>

  <h2>Журнал заказов</h2>
  <?php
  $log = __DIR__ . '/../data/orders.log';
  $lines = is_file($log) ? array_slice(array_filter(explode("\n", (string)@file_get_contents($log))), -12) : array();
  ?>
  <div class="card">
    <?php if ($lines): ?>
      <div class="mono" style="white-space:pre-wrap;line-height:1.7;"><?= e(implode("\n", array_reverse($lines))) ?></div>
    <?php else: ?>
      <span style="color:#888;">Пока пусто. Каждый переход через <code>pay.php</code> добавит строку.</span>
    <?php endif; ?>
  </div>

  <div class="row" style="margin-top:28px;">
    <a class="btn ghost" href="/admin/">← в админку</a>
  </div>

</div>
</body>
</html>
