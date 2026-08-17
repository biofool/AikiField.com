<?php
/**
 * locale-router.php — PHP built-in server router for testing URL path-based
 * localization locally (php -S 0.0.0.0:8080 tests/locale-router.php).
 *
 * Mimics the .htaccess locale-prefix strip-and-serve behavior:
 *  - /es/approach.html → serves approach.html (URL stays /es/approach.html)
 *  - /es/ → serves index.html
 *  - /es/beta/assessment.php → 301 redirect to /beta/assessment.php
 *  - /es/coach-api/foo → 301 redirect to /coach-api/foo
 *  - /es/login.php → 301 redirect to /login.php
 *
 * Also passes through the existing .htaccess rewrites:
 *  - /coach-api/* → coach-proxy.php
 *  - /projects.html → 301 to /projects.php
 *  - /beta/assessment.html → 301 to /beta/assessment.php
 *
 * Supported locales MUST match data/i18n-config.json and .htaccess.
 */

// Locale list — single source of truth is data/i18n-config.json, but we
// hardcode here because the router runs before the site is fully bootstrapped.
// Keep in sync with .htaccess and data/i18n-config.json.
$LOCALES = array('en','es','fr','de','pt','ja','zh','ko','ar','he','fa','hi');
$LOCALE_PATTERN = implode('|', $LOCALES);

// Non-localizable paths (301 redirect to non-prefixed URL if requested with prefix)
$NON_LOCALIZABLE_DIRS = array('beta', 'coach-api');
$NON_LOCALIZABLE_PHP = array('login', 'coach-proxy', 'contact-handler', 'turnstile-sitekey');

$root = __DIR__ . '/..'; // site root is one level up from tests/
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// ── Locale prefix handling ──────────────────────────────────────────────
if (preg_match("#^/($LOCALE_PATTERN)(?:(/.*)?)?$#i", $uri, $m)) {
    $locale = strtolower($m[1]);
    $rest = isset($m[2]) ? $m[2] : '/';

    // Normalize: if rest is empty, treat as /
    if ($rest === '' || $rest === null) {
        $rest = '/';
    }

    // Non-localizable directory paths: 301 redirect to non-prefixed URL
    foreach ($NON_LOCALIZABLE_DIRS as $dir) {
        if (preg_match("#^/$dir(/|$)#", $rest)) {
            header("Location: $rest", true, 301);
            return true;
        }
    }

    // Non-localizable PHP files: 301 redirect to non-prefixed URL
    foreach ($NON_LOCALIZABLE_PHP as $php) {
        if (preg_match("#^/$php\.php$#", $rest)) {
            header("Location: $rest", true, 301);
            return true;
        }
    }

    // Strip-and-serve: serve the underlying file
    if ($rest === '/') {
        $file = 'index.html';
    } else {
        $file = ltrim($rest, '/');
    }

    $filepath = $root . '/' . $file;

    // Check if the stripped path maps to an existing file
    if (file_exists($filepath) && is_file($filepath)) {
        // Preserve the original URI so locale-utils.js can read the locale from the path
        // (PHP built-in server sets SCRIPT_NAME based on the router, not the request)
        $_SERVER['SCRIPT_NAME'] = $uri;
        $_SERVER['PHP_SELF'] = $uri;

        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));

        // Serve PHP files by inclusion (so they execute)
        if ($ext === 'php') {
            // Change directory so relative includes work
            chdir($root);
            include $filepath;
            return true;
        }

        // Serve static files with appropriate content type
        $contentTypes = array(
            'html' => 'text/html; charset=utf-8',
            'css' => 'text/css; charset=utf-8',
            'js' => 'text/javascript; charset=utf-8',
            'json' => 'application/json; charset=utf-8',
            'svg' => 'image/svg+xml',
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'ico' => 'image/x-icon',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
            'ttf' => 'font/ttf',
            'otf' => 'font/otf',
            'eot' => 'application/vnd.ms-fontobject',
            'txt' => 'text/plain; charset=utf-8',
            'xml' => 'application/xml; charset=utf-8',
            'pdf' => 'application/pdf',
        );

        $ct = isset($contentTypes[$ext]) ? $contentTypes[$ext] : 'application/octet-stream';
        header("Content-Type: $ct");
        header("Cache-Control: no-cache, must-revalidate");
        readfile($filepath);
        return true;
    }

    // Stripped file doesn't exist — 404
    http_response_code(404);
    header("Content-Type: text/plain; charset=utf-8");
    echo "404 Not Found: $file\n";
    return true;
}

// ── Existing .htaccess rewrites (pass-through) ──────────────────────────

// /coach-api/* → coach-proxy.php (internal rewrite)
if (preg_match('#^/coach-api(/.*)?$#', $uri)) {
    $_SERVER['SCRIPT_NAME'] = '/coach-proxy.php';
    chdir($root);
    include $root . '/coach-proxy.php';
    return true;
}

// /projects.html → 301 to /projects.php
if ($uri === '/projects.html') {
    header("Location: /projects.php", true, 301);
    return true;
}

// /beta/assessment*.html → 301 to /beta/assessment*.php
$betaRedirects = array(
    '/beta/assessment.html' => '/beta/assessment.php',
    '/beta/assessment-organisation.html' => '/beta/assessment-organisation.php',
    '/beta/assessment-leadership.html' => '/beta/assessment-leadership.php',
    '/beta/assessment-crossview.html' => '/beta/assessment-crossview.php',
);
if (isset($betaRedirects[$uri])) {
    header("Location: " . $betaRedirects[$uri], true, 301);
    return true;
}

// ── Default: let PHP built-in server serve the file normally ────────────
return false;
