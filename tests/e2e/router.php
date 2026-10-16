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
 *   .htaccess  /for-review/games/lucky-wave/* → /games/lucky-wave/…  (301)
 *   .htaccess  /games/lucky-wave/*.html  → /games/lucky-wave/*.php  (301, issue #71)
 *   .htaccess  /games/verbal-aikido/* → /for-review/games/verbal-aikido/*  (301)
 *   .htaccess  /games/exercises/index.html → /games/exercises/  (301)
 *   .htaccess  /games/exercises/:slug    → exercises/index.php (internal, issue #71)
 *   .htaccess  /members                  → members.php
 *   .htaccess  any directory whose own .htaccess says `Require all denied`
 *              (data/exercises/, data/private/, data/ask/, beta/data/) → 403
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

// ── Directories the real site denies (`Require all denied`) ────────────────
// Apache applies a directory's .htaccess to everything beneath it, including
// files that do not exist. php -S ignores .htaccess, so read the REAL files:
// if the deny line is removed from one, this router stops denying it too and
// the specs that expect a 403 fail.

/** True when the .htaccess at $file has an active top-level `Require all denied`. */
function af_router_htaccess_denies(string $file): bool
{
    $lines = file($file, FILE_IGNORE_NEW_LINES);
    if ($lines === false) {
        error_log('e2e router: cannot read ' . $file);
        return false;
    }
    $depth = 0; // inside <IfModule>, <FilesMatch>, ... a deny is conditional: ignore it
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') {
            continue;
        }
        if (str_starts_with($line, '</')) {
            $depth = max(0, $depth - 1);
        } elseif ($line[0] === '<') {
            $depth++;
        } elseif ($depth === 0 && preg_match('/^Require\s+all\s+denied$/i', $line) === 1) {
            return true;
        }
    }
    return false;
}

/** True when $path (URL path) sits in or below a directory that denies all. */
function af_router_denied(string $root, string $path): bool
{
    $dir = $root;
    foreach (array_filter(explode('/', $path), 'strlen') as $segment) {
        $dir .= '/' . $segment;
        if (!is_dir($dir)) {
            break; // the rest is a file name or a path that does not exist
        }
        if (is_file($dir . '/.htaccess') && af_router_htaccess_denies($dir . '/.htaccess')) {
            return true;
        }
    }
    return false;
}

if (af_router_denied($root, $path)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Forbidden\n";
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
    '#^/games/verbal-aikido/index\.html$#' => '/for-review/games/verbal-aikido/',
    '#^/games/exercises/index\.html$#' => '/games/exercises/',
    // Issue #106: intermediate Digital Experience preview pages → direct entry.
    '#^/digital-experience/unified-field-chat\.html$#' => '/members',
    '#^/digital-experience/practices\.html$#' => '/games/exercises/',
    '#^/digital-experience/moon-practices\.html$#' => '/games/exercises/',
];

// Lucky Wave was promoted from the gated review area; Verbal Aikido moved back.
if (preg_match('#^/for-review/games/lucky-wave(/.*)?$#', $path, $m)) {
    http_response_code(301);
    header('Location: /games/lucky-wave' . ($m[1] ?? ''));
    exit;
}
foreach ($redirects as $pattern => $target) {
    if (preg_match($pattern, $path)) {
        http_response_code(301);
        header('Location: ' . $target);
        exit;
    }
}
if (preg_match('#^/games/verbal-aikido(/.*)?$#', $path, $m)) {
    http_response_code(301);
    header('Location: /for-review/games/verbal-aikido' . ($m[1] ?? ''));
    exit;
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

// ── /for-review/* → gated dispatcher ────────────────────────────────────────

if (preg_match('#^/for-review(/|$)#', $path)) {
    $_SERVER['SCRIPT_NAME'] = '/includes/for-review-serve.php';
    chdir($root);
    require $root . '/includes/for-review-serve.php';
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
