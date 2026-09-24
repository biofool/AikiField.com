<?php
/**
 * Gate + file server for /for-review/* — the games review area moved here
 * from quantumaikido.com/for-review/games* (see docs/coach-auth-prd.md).
 *
 * .htaccess rewrites every request under /for-review/ to this script. The
 * session gate is the same one that protects /beta/ (beta-gate.load.php):
 * unauthenticated visitors are redirected to /login.php?next=<path>, and the
 * shared coaching session cookie means an existing Quantum Aikido account
 * signs straight in. session_start() inside the gate also emits
 * `Cache-Control: no-store` etc., so gated responses are never edge-cached
 * by Cloudflare.
 *
 * Static assets are readfile()d with an explicit Content-Type; .html and
 * .php files are include()d so embedded PHP (e.g. the CSRF token block in
 * games.html, or games-comments.php) still executes.
 */

require_once __DIR__ . '/beta-gate.load.php'; // redirects to /login.php when unauthed

$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
if (strpos($uriPath, '/for-review') !== 0) {
    http_response_code(404);
    exit;
}
$rel = ltrim(substr($uriPath, strlen('/for-review')), '/');

// Dynamic/extensionless routes — kept identical to the old QA URLs so the
// cross-domain redirects from quantumaikido.com/for-review/* land cleanly.
$aliases = [
    ''                   => 'games.html',
    'games'              => 'games.html',
    'games.html'         => 'games.html',
    'games-comments'     => 'games-comments.php',
    'games-comments.php' => 'games-comments.php',
];
if (array_key_exists($rel, $aliases)) {
    include __DIR__ . '/../for-review/' . $aliases[$rel];
    exit;
}

$base = realpath(__DIR__ . '/../for-review');
$path = $base === false ? false : realpath($base . '/' . $rel);
if ($path === false || strpos($path, $base . '/') !== 0) {
    http_response_code(404);
    exit;
}
if (is_dir($path)) {
    $path = realpath($path . '/index.html');
    if ($path === false || strpos($path, $base . '/') !== 0) {
        http_response_code(404);
        exit;
    }
}

$types = [
    'html' => 'text/html; charset=utf-8',
    'css'  => 'text/css; charset=utf-8',
    'js'   => 'text/javascript; charset=utf-8',
    'jsx'  => 'text/plain; charset=utf-8',
    'json' => 'application/json; charset=utf-8',
    'svg'  => 'image/svg+xml',
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'webp' => 'image/webp',
    'ico'  => 'image/x-icon',
    'md'   => 'text/plain; charset=utf-8',
    'txt'  => 'text/plain; charset=utf-8',
];
$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
if (!isset($types[$ext])) {
    http_response_code(403);
    exit;
}

header('Content-Type: ' . $types[$ext]);
if ($ext === 'html') {
    include $path; // executes embedded PHP (games.html CSRF block, index pages)
} else {
    readfile($path);
}
