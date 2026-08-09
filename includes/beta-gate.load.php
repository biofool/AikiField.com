<?php
/**
 * Session gate for /beta/. Reuses the same PHP session that login.php
 * establishes for the coaching login — no separate auth mechanism.
 *
 * Unauthenticated visitors are redirected to /login.php?next=<original path>
 * so they land back on the page they wanted after signing in.
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
    // Send the visitor to the blind login page with the originally-requested
    // path so login.php can redirect them back after a successful sign-in.
    $requested = $_SERVER['REQUEST_URI'] ?? '/beta/';
    // REQUEST_URI includes the query string; keep it so deep links survive.
    $next = urlencode($requested);
    header('Location: /login.php?next=' . $next);
    exit;
}
