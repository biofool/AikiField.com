<?php
/**
 * AikiField coaching auth — STAGING config (aikifield.peec.biz).
 *
 * This file is committed (it holds no secrets) but only ever reaches a live
 * server via `./sync.sh staging deploy` — the production deploy target
 * (`./sync.sh deploy`) explicitly excludes it (see the EXCLUDES handling in
 * sync.sh). Once present, it's picked up automatically by
 * includes/coach-config.load.php's normal file-existence precedence chain —
 * no environment variable or cPanel configuration required.
 *
 * Staging must never be able to reach the real Cloud Run backend or trigger
 * real registrations/logins against production data. COACH_BACKEND_URL below
 * points at a placeholder host on the `.invalid` TLD (reserved by RFC 2606 —
 * guaranteed to never resolve), so any coach-api call made on staging fails
 * loudly with a 502 "Coach backend unavailable" instead of silently reaching
 * production.
 *
 * To actually exercise the auth UI on staging, replace COACH_BACKEND_URL
 * below with a real non-prod backend you control — for example, run
 * tests/e2e/stub-backend.php somewhere reachable (it's a plain PHP script:
 * `php -S 0.0.0.0:8201 tests/e2e/stub-backend.php`) and point at that. Do
 * NOT ever put the production Cloud Run URL from coach-config.php here. See
 * docs/STAGING.md.
 */

define('COACH_BACKEND_URL', 'https://stub-backend.aikifield-staging.invalid');

// No proxy secret on staging — there is no real backend to authenticate to,
// and the placeholder URL above never resolves.
define('COACH_PROXY_SECRET', '');

define('COACH_VERIFY_TLS', true);
define('COACH_TIMEOUT', 10);

// No captcha widget on staging.
define('TURNSTILE_SITE_KEY', '');
define('COACH_LOGIN_REDIRECT', '/beta/');
