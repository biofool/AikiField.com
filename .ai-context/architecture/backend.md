# Backend (PHP Server-Side) Architecture

## Overview

AikiField.com has no standalone backend service. The PHP layer runs on the
same shared host (peec.biz) as the static files. It provides four
server-side functions: auth proxy, login/session management, contact form
handling, and an ops dashboard.

## Components

### coach-proxy.php (OBSERVED)

- **Responsibility:** Reverse proxy `/coach-api/*` → AIRichardMoon Cloud Run
- **Entry:** `.htaccess` `RewriteRule ^coach-api(/.*)?$ coach-proxy.php [L]`
- **Method allow-list:** GET, POST, PUT, PATCH, DELETE (405 otherwise)
- **Headers forwarded:** content-type, x-auth-email, x-auth-session,
  x-request-id, authorization
- **Client IP:** `qa_resolve_client_ip_headers()` from
  `includes/cloudflare-ips.php` — only trusts CF-Connecting-IP /
  X-Forwarded-For when REMOTE_ADDR is a genuine Cloudflare edge IP
- **Proxy secret:** `X-Proxy-Secret` header when `COACH_PROXY_SECRET` set
- **OAuth:** Rewrites `Location: /login.html` → `/projects.php` (for
  future social-login enablement; currently disabled in `coach-login.js`)
- **Timeout:** `COACH_TIMEOUT` (default 60s; 30s in proxy, 10s in
  check-session calls)
- **TLS:** `COACH_VERIFY_TLS` (default true)
- **Error:** 502 JSON on cURL failure

### login.php (OBSERVED)

- **Responsibility:** Blind login page; PHP session POST handlers;
  `?next=` redirect; already-authed fast path
- **Session:** `session_set_cookie_params` — 7-day, HttpOnly, Secure on
  HTTPS, SameSite=Lax, path=/
- **Session keys:** `qa_email`, `qa_session_token`, `qa_target_env`,
  `qa_is_admin`, `qa_session_checked_at`
- **POST `action=backend-login`:** Verifies email+sessionToken against
  backend `/v1/auth/check-session`; stores in `$_SESSION` on success;
  returns JSON `{ok: bool}`
- **POST `action=logout`:** Destroys session, redirects to self
- **Open-redirect guard:** `af_safe_redirect()` — rejects absolute URLs,
  scheme-relative, backslashes (WHATWG `\`→`/`), CR/LF, login.php targets;
  verifies same-origin via `af_url_is_offsite()`
- **Turnstile:** Conditionally rendered when `TURNSTILE_SITE_KEY` defined
- **Loads:** `coach-auth.css`, `coach-login.js`, `css/redesign.css`

### includes/beta-gate.load.php (OBSERVED)

- **Responsibility:** Session gate for `/beta/*.php`; redirects
  unauthenticated to `/login.php?next=<original path>`
- **Session:** Identical `session_set_cookie_params` as `login.php`
- **Revalidation:** Every 6h (`BETA_REVALIDATE_INTERVAL_SECONDS`),
  calls `qa_revalidate_beta_session()` → backend
  `/v1/auth/check-session`; fails open on transport error (null);
  destroys session on explicit rejection (false)
- **Retry backoff:** 60s (`BETA_REVALIDATE_RETRY_BACKOFF_SECONDS`)
  after a failed check, to avoid per-request timeout storm
- **Returns:** null (fail open) / true (valid) / false (revoked)

### includes/coach-config.load.php (OBSERVED)

- **Responsibility:** Config loader with file-existence precedence
- **Precedence:** (1) `COACH_CONFIG_FILE` env var (dev/test),
  (2) `coach-config.local.php` (gitignored), (3)
  `coach-config.staging.php` (staging remote only),
  (4) `coach-config.php` (production)
- **Defaults:** COACH_BACKEND_URL → `http://localhost:8001`,
  COACH_VERIFY_TLS → true, COACH_TIMEOUT → 60, COACH_PROXY_SECRET → '',
  TURNSTILE_SITE_KEY → '', COACH_LOGIN_REDIRECT → `/beta/`
- **Constants:** Also defines `DASHBOARD_ADMIN_KEY`,
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` (all default '')

### contact-handler.php (OBSERVED)

- **Responsibility:** POST handler for `contact.html` form
- **Validation:** `strip_header_injection()` (CWE-93), email format,
  required fields, honeypot (`website` field)
- **Rate limiting:** Fixed-window per IP (`data/ratelimit/`), 5
  requests/600s; 429 + Retry-After on excess
- **Turnstile:** Server-side verification via
  `contact_verify_turnstile()`; fails open when
  `TURNSTILE_SECRET_KEY` unset
- **Staging guard:** No-ops on `aikifield.peec.biz` hostname or
  `STAGING=1` env var (logs instead of mailing)
- **Client IP:** `contact_client_ip()` — same Cloudflare IP trust
  logic as `coach-proxy.php`

### dashboard.php (OBSERVED)

- **Responsibility:** Blind ops dashboard; Cloudflare GraphQL Analytics
- **Auth:** `?key=` or `X-Dashboard-Key` header; `hash_equals()` against
  `DASHBOARD_ADMIN_KEY`
- **Data:** `CloudflareLogsScanner` class (`includes/cloudflare-logs.class.php`)
  — 4xx/5xx errors, firewall/WAF events, daily traffic summary
- **Output:** HTML (default) or JSON (`?format=json`)
- **Config:** Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID`

### turnstile-sitekey.php (OBSERVED)

- **Responsibility:** Exposes `TURNSTILE_SITE_KEY` as JSON for static
  `contact.html` (which can't read PHP constants directly)
- **Security:** Only site key (non-secret); `TURNSTILE_SECRET_KEY` never
  exposed

## External backend dependency (INFERRED from PRD + proxy code)

- **Service:** AIRichardMoon (FastAPI on Google Cloud Run)
- **URL:** `https://quantum-aikido-coach-6bfpsd3kkq-uc.a.run.app`
  (OBSERVED: `coach-config.php:22`)
- **Endpoints used:** `/v1/auth/verify`, `/v1/auth/register-with-password`,
  `/v1/auth/check-session`, `/v1/auth/request-reset`,
  `/v1/auth/reset-password`, `/v1/auth/confirm-email`, `/v1/auth/providers`
- **Auth:** `X-Proxy-Secret` header (exempt for `/v1/auth/*` endpoints)
- **Rate limiting:** Backend enforces IP-based limits; proxy forwards
  real client IP via CF-Connecting-IP / X-Forwarded-For
