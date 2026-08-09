<?php
/**
 * AikiField coaching auth — production config template.
 *
 * This file is committed with NON-SECRET defaults. The coaching backend URL
 * below is the public Quantum Aikido Cloud Run service (the same one
 * quantumaikido.com proxies to). It is not a secret — direct access to
 * non-auth endpoints is rejected by the backend's X-Proxy-Secret check.
 *
 * SECRETS (PROXY_SECRET, Turnstile site key) must NOT be committed. Put them
 * in coach-config.local.php (gitignored) instead. The loader
 * (includes/coach-config.load.php) reads coach-config.local.php first, so any
 * value defined there overrides the defaults below.
 *
 * Related repos (dual-PRD coordination rule applies):
 *   - ~/projects/quantumaikido.com/web  (docs/coach-dashboard-prd.md)
 *   - ~/projects/AIRichardMoon          (backend/PRD.md)
 *   - this repo                         (docs/coach-auth-prd.md)
 */

// Public Quantum Aikido coaching backend (Cloud Run).
define('COACH_BACKEND_URL', 'https://quantum-aikido-coach-6bfpsd3kkq-uc.a.run.app');

// Shared proxy secret — MUST match PROXY_SECRET in the backend's GCP Secret
// Manager. When set, coach-proxy.php sends it as X-Proxy-Secret so the backend
// accepts non-auth requests (e.g. chat) and waives the captcha requirement on
// registration. Leave empty here and set the real value in
// coach-config.local.php. Auth endpoints (/v1/auth/*) are exempt and work
// without it, but registration will require a Turnstile captcha when it is
// empty.
define('COACH_PROXY_SECRET', '');

// Cloudflare Turnstile site key for bot protection (optional). When empty,
// no captcha widget is rendered. Required for registration IF
// COACH_PROXY_SECRET is empty (the backend demands one or the other).
define('TURNSTILE_SITE_KEY', '');

// Verify TLS certificates when calling the backend. Leave true in production.
define('COACH_VERIFY_TLS', true);

// HTTP timeout (seconds) for proxied backend calls.
define('COACH_TIMEOUT', 60);

// Post-login destination. The coaching login now lives on the blind
// /login.php page that gates the /beta/ assessment pages. login.php reads
// a ?next= query parameter and overrides this default per-request so users
// land back on the page they wanted. This constant is the fallback when
// ?next= is absent. Override only if you want to send authenticated users
// elsewhere by default.
define('COACH_LOGIN_REDIRECT', '/beta/');
