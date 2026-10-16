<?php
/**
 * Backend config for the AikiField e2e suite.
 *
 * Loaded by includes/coach-config.load.php through the COACH_CONFIG_FILE
 * environment variable, which playwright.config.js sets on the app web server.
 * Nothing here talks to Cloud Run and no real password is ever needed.
 *
 * The backend URL MUST point at the stub backend started by Playwright on
 * port 8201 — coach-proxy.php and login.php both forward to it during tests.
 * AF_E2E_STUB_PORT overrides the port (same env var playwright.config.js
 * uses) so ci-local.sh can run the suite on non-default ports.
 */

define('COACH_BACKEND_URL', 'http://0.0.0.0:' . (getenv('AF_E2E_STUB_PORT') ?: '8201'));  // stub backend

// Must match QA_STUB_PROXY_SECRET in playwright.config.js. The stub enforces
// it exactly like the real backend does, so a proxy that forgets to load
// config fails the suite loudly instead of silently returning 403.
define('COACH_PROXY_SECRET', 'test-proxy-secret');

define('COACH_VERIFY_TLS', false);  // stub is plain HTTP
define('COACH_TIMEOUT', 10);

define('TURNSTILE_SITE_KEY', '');    // no captcha widget in tests
define('COACH_LOGIN_REDIRECT', '/beta/');

// Session timings, shortened so tests/e2e/specs/session-reliability.spec.js
// runs in seconds (production: 6 h revalidation, 35 s check timeout, 6 h grace;
// see includes/coach-session.php). 2 + 5 = a session counts as stale 7 s after
// its last successful check when the backend cannot be reached.
define('COACH_SESSION_REVALIDATE_SECONDS', 2);
define('COACH_SESSION_CHECK_TIMEOUT', 2);
define('COACH_SESSION_UNKNOWN_GRACE', 5);
