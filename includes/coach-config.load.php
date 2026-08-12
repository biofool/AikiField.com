<?php
/**
 * Canonical config loader for the AikiField coaching auth integration.
 *
 * Ported from quantumaikido.com/web/includes/coach-config.load.php (issue #100)
 * so AikiField loads backend config the same way the QA frontend does.
 *
 * Precedence (first file found wins — later `define()` calls on an already
 * defined constant are ignored, so the highest-priority file must load first):
 *
 *   1. $_ENV/getenv('COACH_CONFIG_FILE')  — dev/test harness only
 *   2. coach-config.local.php             — developer overrides (gitignored)
 *   3. coach-config.staging.php           — staging remote only (see below)
 *   4. coach-config.php                   — deployed production config
 *
 * coach-config.staging.php is committed to the repo but sync.sh only ever
 * deploys it to the staging remote (public_html/aikifield.peec.biz/) — the
 * production deploy target excludes it by name. So on prod this file simply
 * never exists and step 3 is skipped; on staging it exists and safely
 * overrides COACH_BACKEND_URL with a non-resolving placeholder instead of
 * the real Cloud Run backend. See docs/STAGING.md.
 *
 * Usage (from the web root):   require __DIR__ . '/includes/coach-config.load.php';
 * Usage (from a subdirectory): require dirname(__DIR__) . '/includes/coach-config.load.php';
 */

(static function (): void {
    $root = dirname(__DIR__);

    $candidates = [];
    $override = getenv('COACH_CONFIG_FILE');
    if (is_string($override) && $override !== '') {
        // Only honour absolute paths that exist — never interpolate into a path.
        if ($override[0] === '/' && is_file($override)) {
            $candidates[] = $override;
        } else {
            error_log('coach-config.load: COACH_CONFIG_FILE is set but not a readable absolute path: ' . $override);
        }
    }
    $candidates[] = $root . '/coach-config.local.php';
    $candidates[] = $root . '/coach-config.staging.php';
    $candidates[] = $root . '/coach-config.php';

    foreach ($candidates as $file) {
        if (is_file($file)) {
            require $file;
            return;
        }
    }

    error_log('coach-config.load: no config file found; falling back to built-in defaults');
})();

// --- Defaults for anything the config file did not define ------------------
// Never fail silently: a missing backend URL is logged, not guessed quietly.
if (!defined('COACH_BACKEND_URL')) {
    error_log('coach-config.load: COACH_BACKEND_URL undefined — defaulting to http://localhost:8001');
    define('COACH_BACKEND_URL', 'http://localhost:8001');
}
if (!defined('COACH_STAGING_URL')) {
    define('COACH_STAGING_URL', '');
}
if (!defined('COACH_VERIFY_TLS')) {
    define('COACH_VERIFY_TLS', true);
}
if (!defined('COACH_TIMEOUT')) {
    define('COACH_TIMEOUT', 60);
}
if (!defined('COACH_PROXY_SECRET')) {
    define('COACH_PROXY_SECRET', '');
}
if (!defined('TURNSTILE_SITE_KEY')) {
    define('TURNSTILE_SITE_KEY', '');
}
// Where to send the user after a successful login. The coaching login now
// lives on the blind /login.php page that gates /beta/. login.php reads a
// ?next= query parameter and overrides this per-request; this is the
// fallback when ?next= is absent.
if (!defined('COACH_LOGIN_REDIRECT')) {
    define('COACH_LOGIN_REDIRECT', '/beta/');
}
