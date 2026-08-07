<?php
/**
 * Session gate for /beta/. Reuses the same PHP session that projects.php
 * establishes for the coaching chat login — no separate auth mechanism.
 *
 * Usage (from beta/*.php): require dirname(__DIR__) . '/includes/beta-gate.load.php';
 * See docs/coach-auth-prd.md for the shared session contract.
 */

require dirname(__DIR__) . '/includes/coach-config.load.php';

if (session_status() === PHP_SESSION_NONE) {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') == 443);
    session_set_cookie_params([
        'lifetime' => 86400 * 7,  // 7 days
        'path'     => '/',
        'domain'   => '',
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

$qaEmail         = $_SESSION['qa_email'] ?? null;
$qaSessionToken  = $_SESSION['qa_session_token'] ?? null;
$betaAuthed      = !empty($qaEmail) && !empty($qaSessionToken);

if (!$betaAuthed) {
    header('Location: /projects.php#coach-login');
    exit;
}
