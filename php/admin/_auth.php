<?php
// Лёгкий gate для админки. Совместим с PHP 5.6+: используем «легаси» сигнатуру
// session_set_cookie_params, не полагаемся на samesite/array-API из PHP 7.3.

// === НАСТРОЙКИ ===
// Сейчас слабый временный вариант — поменяй когда захочешь.
const ADMIN_LOGIN    = '1';
const ADMIN_PASSWORD = '8';

const RL_MAX  = 5;
const RL_SECS = 900; // 15 минут

// === ОПРЕДЕЛЯЕМ HTTPS НАДЁЖНО ===
// За nginx/прокси Beget может прокидывать HTTP_X_FORWARDED_PROTO=https,
// а сам $_SERVER['HTTPS'] быть не выставлен.
function _is_https() {
    if (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off') return true;
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) &&
        strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') return true;
    if (!empty($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443) return true;
    return false;
}

// === ИНИЦИАЛИЗАЦИЯ СЕССИИ ===
// Cookie БЕЗ Secure — иначе если сервер за прокси думает что HTTPS, а ответ
// пришёл по HTTP, браузер выкидывает cookie и сессия не создаётся (особенно
// iOS Safari). Сайт всё равно сейчас на HTTP, безопасность не теряется.
if (session_status() === PHP_SESSION_NONE) {
    @session_set_cookie_params(0, '/', '', false, true);
    @session_name('MURJAK_ADMIN');
    @session_start();
}

function admin_is_authed() {
    return !empty($_SESSION['authed']);
}

function admin_csrf_token() {
    if (empty($_SESSION['csrf'])) {
        if (function_exists('random_bytes')) {
            $_SESSION['csrf'] = bin2hex(random_bytes(16));
        } else {
            $_SESSION['csrf'] = bin2hex(openssl_random_pseudo_bytes(16));
        }
    }
    return $_SESSION['csrf'];
}

function admin_csrf_check($token) {
    return !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], (string)$token);
}

function admin_logout() {
    $_SESSION = array();
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $p['path'], $p['domain'],
            !empty($p['secure']) ? true : false,
            !empty($p['httponly']) ? true : false);
    }
    @session_destroy();
}

// === RATE LIMIT ===
function _rl_file() {
    return __DIR__ . '/../data/attempts.json';
}

function _rl_load() {
    $f = _rl_file();
    if (!is_file($f)) return array();
    $raw = @file_get_contents($f);
    $j = @json_decode($raw, true);
    return is_array($j) ? $j : array();
}

function _rl_save($a) {
    $f = _rl_file();
    @file_put_contents($f, json_encode($a), LOCK_EX);
}

function _rl_ip() {
    return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
}

function admin_rl_check() {
    $ip   = _rl_ip();
    $now  = time();
    $data = _rl_load();
    $rec  = isset($data[$ip]) ? $data[$ip] : array('n' => 0, 't' => 0);
    if ($now - $rec['t'] > RL_SECS) return true;
    return $rec['n'] < RL_MAX;
}

function admin_rl_hit() {
    $ip   = _rl_ip();
    $now  = time();
    $data = _rl_load();
    $rec  = isset($data[$ip]) ? $data[$ip] : array('n' => 0, 't' => $now);
    if ($now - $rec['t'] > RL_SECS) {
        $rec = array('n' => 1, 't' => $now);
    } else {
        $rec['n']++;
        $rec['t'] = $now;
    }
    $data[$ip] = $rec;
    _rl_save($data);
}

function admin_rl_reset() {
    $ip   = _rl_ip();
    $data = _rl_load();
    unset($data[$ip]);
    _rl_save($data);
}

// === ВХОД ===
function admin_try_login($login, $password) {
    if (!admin_rl_check()) {
        return 'Слишком много попыток. Подожди 15 минут.';
    }
    $ok = hash_equals(ADMIN_LOGIN, (string)$login)
       && hash_equals(ADMIN_PASSWORD, (string)$password);
    if (!$ok) {
        admin_rl_hit();
        return 'Неверный логин или пароль.';
    }
    admin_rl_reset();
    @session_regenerate_id(true);
    $_SESSION['authed'] = true;
    return null;
}
