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
 */

define('COACH_BACKEND_URL', 'http://0.0.0.0:8201');  // stub backend

// Must match QA_STUB_PROXY_SECRET in playwright.config.js. The stub enforces
// it exactly like the real backend does, so a proxy that forgets to load
// config fails the suite loudly instead of silently returning 403.
define('COACH_PROXY_SECRET', 'test-proxy-secret');

define('COACH_VERIFY_TLS', false);  // stub is plain HTTP
define('COACH_TIMEOUT', 10);

define('TURNSTILE_SITE_KEY', '');    // no captcha widget in tests
define('COACH_LOGIN_REDIRECT', '/beta/');
