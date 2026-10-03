<?php
/**
 * Router for the AikiField e2e app server.
 *
 *   php -S 0.0.0.0:8200 -t <webroot> tests/e2e/router.php
 *
 * The PHP built-in server does not read .htaccess, so the rewrites the site
 * depends on are reproduced here:
 *
 *   .htaccess  /coach-api/*              → coach-proxy.php
 *   .htaccess  /projects.html            → /projects.php  (301)
 *   .htaccess  /beta/assessment.html     → /beta/assessment.php  (301)
 *   .htaccess  /beta/assessment-*.html   → /beta/assessment-*.php  (301)
 *   .htaccess  /for-review/games/(lucky-wave|verbal-aikido)/* → /games/…  (301)
 *   .htaccess  /games/lucky-wave/*.html  → /games/lucky-wave/*.php  (301, issue #71)
 *   .htaccess  /games/{verbal-aikido,exercises}/index.html → /games/…/  (301)
 *   .htaccess  /games/exercises/:slug    → exercises/index.php (internal, issue #71)
 *   .htaccess  /members                  → members.php
 *
 * Everything else returns false, which lets the built-in server serve the
 * file (or execute the .php page) with the correct SCRIPT_NAME — login.php
 * posts back to $_SERVER['SCRIPT_NAME'], so that has to stay accurate.
 */
declare(strict_types=1);

$root = realpath(__DIR__ . '/../..');
if ($root === false) {
    http_response_code(500);
    error_log('e2e router: cannot resolve web root from ' . __DIR__);
    echo 'e2e router: cannot resolve web root';
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($path) || $path === '') {
    return false;
}
$path = rawurldecode($path);
if (str_contains($path, '..')) {
    http_response_code(400);
    exit;
}

// ── 301 redirects for old static URLs ──────────────────────────────────────

$redirects = [
    '#^/projects\.html$#'                  => '/projects.php',
    '#^/beta/assessment\.html$#'           => '/beta/assessment.php',
    '#^/beta/assessment-organisation\.html$#' => '/beta/assessment-organisation.php',
    '#^/beta/assessment-leadership\.html$#'   => '/beta/assessment-leadership.php',
    '#^/beta/assessment-crossview\.html$#'    => '/beta/assessment-crossview.php',
    // Digital Experience gate (issue #71): old .html game entry points → gated .php
    '#^/games/lucky-wave/RideTheLuckyWaveV1-legacy\.html$#' => '/games/lucky-wave/RideTheLuckyWaveV1-legacy.php',
    '#^/games/lucky-wave/RideTheLuckyWaveV2\.html$#' => '/games/lucky-wave/RideTheLuckyWaveV2.php',
    '#^/games/verbal-aikido/index\.html$#' => '/games/verbal-aikido/',
    '#^/games/exercises/index\.html$#' => '/games/exercises/',
];

// Digital Experience games promoted from the gated review area.
if (preg_match('#^/for-review/games/(lucky-wave|verbal-aikido)(/.*)?$#', $path, $m)) {
    http_response_code(301);
    header('Location: /games/' . $m[1] . ($m[2] ?? ''));
    exit;
}

foreach ($redirects as $pattern => $target) {
    if (preg_match($pattern, $path)) {
        http_response_code(301);
        header('Location: ' . $target);
        exit;
    }
}

// ── /coach-api/* → coach-proxy.php ──────────────────────────────────────────

if (preg_match('#^/coach-api(/|$)#', $path)) {
    $file = $root . '/coach-proxy.php';
    if (!is_file($file)) {
        http_response_code(500);
        error_log('e2e router: rewrite target missing: ' . $file);
        echo 'e2e router: rewrite target missing: /coach-proxy.php';
        exit;
    }
    // coach-proxy.php reads $_SERVER['REQUEST_URI'] to strip the /coach-api
    // prefix, so it must stay as the browser sent it.
    $_SERVER['SCRIPT_NAME'] = '/coach-proxy.php';
    chdir(dirname($file));
    require $file;
    exit;
}

// ── /members → members.php (AI chat, session-gated) ─────────────────────────

if (preg_match('#^/members/?$#', $path)) {
    $_SERVER['SCRIPT_NAME'] = '/members.php';
    chdir($root);
    require $root . '/members.php';
    exit;
}

// ── /games/exercises/:slug → exercises/index.php (internal rewrite, issue #71)
// REQUEST_URI keeps the pretty slug so beta-gate's ?next= preserves it and
// the JS router can read the slug after sign-in.
if (preg_match('#^/games/exercises/([a-z0-9-]+)/?$#', $path)
    && !is_file($root . $path) && !is_dir($root . $path)) {
    $_SERVER['SCRIPT_NAME'] = '/games/exercises/index.php';
    chdir(dirname($root . '/games/exercises/index.php'));
    require $root . '/games/exercises/index.php';
    exit;
}

return false;
