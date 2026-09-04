<?php
// Совместимо с PHP 5.6+ — никаких type hints / ?? операторов.
require __DIR__ . '/_auth.php';

$STOCK_FILE    = __DIR__ . '/../data/stock.json';
$PRODUCTS_FILE = __DIR__ . '/../data/products.json';

function load_stock($f) {
    if (!is_file($f)) return array();
    $j = json_decode(@file_get_contents($f), true);
    return is_array($j) ? $j : array();
}

function save_stock($f, $s) {
    $tmp = $f . '.tmp';
    if (false === @file_put_contents($tmp, json_encode($s))) return false;
    return @rename($tmp, $f);
}

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

function pv($a, $k, $d) { return isset($a[$k]) ? $a[$k] : $d; }

// === ОБРАБОТКА POST ===
$err = null;
$msg = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = pv($_POST, 'action', '');

    if ($action === 'login') {
        $err = admin_try_login(pv($_POST, 'login', ''), pv($_POST, 'password', ''));
        if ($err === null) {
            header('Location: ' . $_SERVER['REQUEST_URI']);
            exit;
        }
    } elseif ($action === 'logout' && admin_is_authed()) {
        admin_logout();
        header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
        exit;
    } elseif ($action === 'toggle' && admin_is_authed()) {
        if (!admin_csrf_check(pv($_POST, 'csrf', ''))) {
            $err = 'Сессия устарела, обнови страницу.';
        } else {
            $id    = (string)(int)pv($_POST, 'id', 0);
            $stock = load_stock($STOCK_FILE);
            $cur   = isset($stock[$id]) ? (bool)$stock[$id] : true;
            $stock[$id] = !$cur;
            if (save_stock($STOCK_FILE, $stock)) {
                $msg = 'Сохранено.';
            } else {
                $err = 'Не удалось сохранить. Проверь права записи на data/stock.json.';
            }
        }
    }
}

$products = json_decode(@file_get_contents($PRODUCTS_FILE), true);
if (!is_array($products)) $products = array();
$stock = load_stock($STOCK_FILE);
?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MURJAK · админка</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 20px;
    background: #0a0a0a; color: #fff;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 28px; letter-spacing: 0.02em; }
  .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
  .err { background: #3a1010; color: #ffb4b4; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; }
  .ok  { background: #103a1d; color: #b4ffc8; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; }
  form.login { max-width: 320px; margin: 80px auto 0; display: grid; gap: 12px; }
  form.login input {
    padding: 14px 14px; background: #181818; color: #fff;
    border: 1px solid #2a2a2a; border-radius: 6px;
    font: inherit; font-size: 16px; /* >=16px чтобы iOS Safari не зумил */
    -webkit-appearance: none; appearance: none;
    width: 100%;
  }
  form.login button, .btn {
    padding: 14px 14px; background: #fff; color: #000;
    border: 0; border-radius: 6px; font: inherit; font-weight: 600;
    font-size: 16px;
    cursor: pointer;
    /* iOS-сафари ломает кастомные input/button — сбрасываем appearance.
       touch-action: manipulation убирает 300ms tap-delay. */
    -webkit-appearance: none; appearance: none;
    -webkit-tap-highlight-color: rgba(255,255,255,0.2);
    touch-action: manipulation;
    min-height: 48px;
    width: 100%;
  }
  .btn.ghost { background: transparent; color: #fff; border: 1px solid #2a2a2a; }
  .list { display: grid; gap: 14px; }
  .row {
    display: grid; grid-template-columns: 64px 1fr auto; gap: 16px;
    align-items: center; padding: 12px; background: #141414;
    border: 1px solid #1f1f1f; border-radius: 8px;
  }
  .row img { width: 64px; height: 64px; object-fit: cover; background: #222; border-radius: 6px; }
  .row .name { font-weight: 600; }
  .row .state { font-size: 12px; color: #888; margin-top: 2px; }
  .row .state.off { color: #ff8a8a; }
  form.toggle { margin: 0; }
  form.toggle button { padding: 10px 14px; border-radius: 6px; border: 0; cursor: pointer; font: inherit; font-weight: 600; }
  form.toggle button.off { background: #fff; color: #000; }
  form.toggle button.on  { background: #2a2a2a; color: #fff; border: 1px solid #3a3a3a; }
</style>
</head>
<body>
<div class="wrap">

<?php if (!admin_is_authed()): ?>
  <h1 style="text-align:center;">MURJAK · вход</h1>
  <?php if ($err): ?><div class="err"><?php echo h($err); ?></div><?php endif; ?>
  <form class="login" method="post" novalidate>
    <input type="hidden" name="action" value="login">
    <input name="login" type="text" placeholder="логин"
           autocomplete="username" autocapitalize="none" autocorrect="off"
           spellcheck="false" inputmode="text" required>
    <input name="password" type="password" placeholder="пароль"
           autocomplete="current-password" autocapitalize="none" autocorrect="off"
           spellcheck="false" required>
    <button type="submit" name="submit">войти</button>
  </form>
<?php else: ?>
  <div class="top">
    <h1>наличие товаров</h1>
    <form method="post" style="margin:0;">
      <input type="hidden" name="action" value="logout">
      <button class="btn ghost" type="submit">выйти</button>
    </form>
  </div>

  <?php if ($err): ?><div class="err"><?php echo h($err); ?></div><?php endif; ?>
  <?php if ($msg): ?><div class="ok"><?php echo h($msg); ?></div><?php endif; ?>

  <div class="list">
    <?php foreach ($products as $p):
      $id = (string)pv($p, 'id', '');
      $in = isset($stock[$id]) ? (bool)$stock[$id] : true;
    ?>
      <div class="row">
        <img src="<?php echo h(pv($p, 'photo', '')); ?>" alt="" onerror="this.style.visibility='hidden'">
        <div>
          <div class="name"><?php echo h(pv($p, 'name', '')); ?></div>
          <div class="state <?php echo $in ? '' : 'off'; ?>">
            <?php echo $in ? 'в наличии' : 'нет в наличии'; ?>
          </div>
        </div>
        <form class="toggle" method="post">
          <input type="hidden" name="action" value="toggle">
          <input type="hidden" name="id" value="<?php echo h($id); ?>">
          <input type="hidden" name="csrf" value="<?php echo h(admin_csrf_token()); ?>">
          <?php if ($in): ?>
            <button class="off" type="submit">убрать из наличия</button>
          <?php else: ?>
            <button class="on" type="submit">вернуть в наличие</button>
          <?php endif; ?>
        </form>
      </div>
    <?php endforeach; ?>
  </div>
<?php endif; ?>

</div>
</body>
</html>
