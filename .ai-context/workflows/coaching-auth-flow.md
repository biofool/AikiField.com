# Workflow: Coaching Auth Flow

## Entry Point

User navigates to any `/beta/*.php` page without an established session,
OR user navigates directly to `/login.php`.

## Execution Path

### 1. Beta gate redirect (includes/beta-gate.load.php)

1. User requests `/beta/assessment.php` (or any beta page)
2. `beta/assessment.php:1` requires `includes/beta-gate.load.php`
3. `beta-gate.load.php:13` requires `includes/coach-config.load.php`
4. `beta-gate.load.php:53-65` starts PHP session (identical cookie
   params as `login.php:128-135`)
5. `beta-gate.load.php:67-69` reads `qa_email` + `qa_session_token`
6. If authenticated (`$betaAuthed`):
   - `beta-gate.load.php:89-115` — periodic revalidation (every 6h)
     via `qa_revalidate_beta_session()` → backend
     `/v1/auth/check-session`
     - `true` → update `qa_session_checked_at`, continue
     - `false` → destroy session, redirect to login
     - `null` (transport error) → fail open, set
       `qa_session_check_failed_at`, continue
   - Page renders normally
7. If NOT authenticated:
   - `beta-gate.load.php:117-124` — redirect to
     `/login.php?next=<url-encoded REQUEST_URI>`

### 2. Login page render (login.php)

1. `login.php:44` requires `includes/coach-config.load.php`
2. `login.php:125-137` starts PHP session (7-day, HttpOnly, Secure,
   SameSite=Lax, path=/)
3. `login.php:139-141` checks if already authed
4. `login.php:145-146` resolves `?next=` via `af_safe_redirect()`
   (defaults to `/beta/`)
5. `login.php:149-152` — if already authed, redirect to `?next=` target
6. `login.php:227+` renders HTML: login form, register form, reset form,
   confirm step, caveats panel
7. `coach-login.js` loaded — handles client-side auth flow

### 3. Client-side auth (coach-login.js)

1. User enters email + password, clicks "Sign in"
2. `coach-login.js` posts to `/coach-api/v1/auth/verify` (via
   `coach-proxy.php`)
3. On success, backend returns `{ok: true, email, sessionToken, ...}`
4. `coach-login.js` posts `{action: "backend-login", email,
   sessionToken}` to `login.php` (same page, POST)
5. On failure, shows error in `#coach-login-status` (aria-live)

### 4. Session establishment (login.php POST handler)

1. `login.php:157` — checks `POST action=backend-login`
2. `login.php:162-180` — cURL to backend `/v1/auth/check-session` with
   email + sessionToken (10s timeout)
3. `login.php:181-194` — on success:
   - `session_regenerate_id(true)`
   - Stores `qa_email`, `qa_session_token`, `qa_target_env`,
     `qa_is_admin`, `qa_session_checked_at` in `$_SESSION`
4. `login.php:204-207` — returns JSON `{ok: bool}`
5. `coach-login.js` reads response, redirects to
   `window.COACH_LOGIN_REDIRECT` (set by PHP to `?next=` value)

### 5. Proxy forwarding (coach-proxy.php)

1. `.htaccess:108` — `RewriteRule ^coach-api(/.*)?$ coach-proxy.php [L]`
2. `coach-proxy.php:24` requires config loader
3. `coach-proxy.php:25` requires `includes/cloudflare-ips.php`
4. `coach-proxy.php:81-88` — method allow-list check (405 if not
   GET/POST/PUT/PATCH/DELETE)
5. `coach-proxy.php:90-100` — strip `/coach-api` prefix from URI
6. `coach-proxy.php:113` — build backend URL:
   `COACH_BACKEND_URL + path`
7. `coach-proxy.php:117-121` — forward allow-listed request headers
8. `coach-proxy.php:132-145` — resolve client IP headers via
   `qa_resolve_client_ip_headers()` (trust-checked)
9. `coach-proxy.php:148-150` — add `X-Proxy-Secret` if configured
10. `coach-proxy.php:195-210` — cURL to backend (CURLOPT_TIMEOUT =
    COACH_TIMEOUT)
11. `coach-proxy.php:218-226` — 502 JSON on cURL failure
12. `coach-proxy.php:228-266` — forward response headers + body

### 6. Subsequent beta page access

1. User navigates to another `/beta/*.php` page
2. `beta-gate.load.php` reads same session cookie
3. If within 6h of last check → page renders (no backend call)
4. If past 6h → revalidation via `qa_revalidate_beta_session()`

## Evidence

| Step | File | Lines |
|------|------|-------|
| Beta gate | `includes/beta-gate.load.php` | 1-125 |
| Login render | `login.php` | 1-528 |
| Session POST | `login.php` | 157-208 |
| Open-redirect guard | `login.php` | 54-119 |
| Client-side auth | `coach-login.js` | 1-523 |
| Proxy forwarding | `coach-proxy.php` | 1-267 |
| Config loading | `includes/coach-config.load.php` | 1-95 |
| IP trust | `includes/cloudflare-ips.php` | 1-178 |
| .htaccess routing | `.htaccess` | 107-108 |

## Failure Paths

| Failure | Behavior | Evidence |
|---------|----------|----------|
| Backend unreachable (proxy) | 502 JSON `{detail, backendUrl}` | `coach-proxy.php:218-226` |
| Backend unreachable (login) | `error_log()`, returns `{ok: false}` | `login.php:198-201` |
| Backend unreachable (gate) | Fail open (null), set `qa_session_check_failed_at`, 60s backoff | `beta-gate.load.php:106-113` |
| Backend rejects session (gate) | Destroy session, redirect to login | `beta-gate.load.php:99-105` |
| Bad credentials | `coach-login.js` shows error in aria-live region | `coach-login.js` |
| Rate limited (429) | `coach-login.js` maps to user-safe message via `httpErrorMessage(429)` | DECLARED: PRD |
| Open redirect attempt | `af_safe_redirect()` falls back to `/beta/` | `login.php:54-81` |
| Method not allowed | 405 + `Allow` header | `coach-proxy.php:82-88` |
| Turnstile failure | `onTurnstileError` clears tokens | `login.php:255-257` |

## Change Guidance

**Before modifying any file in this flow:**
1. Read `docs/coach-auth-prd.md` (this repo's PRD)
2. Check `change-impact/relationships.yaml` for dependencies
3. If changing login/registration/auth/session/invitation/proxy:
   - Update ALL THREE PRDs (triple-PRD rule)
   - Update ALL THREE AGENTS.md files if coordination rules change
   - Deploy all affected repos together
4. Run `bash tests/e2e/run.sh` (Playwright + stub backend)
5. Run `php tests/unit/test-cloudflare-ip-trust.php`
6. Run `php -l` on all modified PHP files
7. Run `./sync.sh dryrun` before deploying

**Co-change files:**
- `login.php` ↔ `coach-login.js` (session POST contract)
- `login.php` ↔ `includes/beta-gate.load.php` (session cookie params
  must match)
- `coach-proxy.php` ↔ `includes/cloudflare-ips.php` (IP trust)
- `coach-proxy.php` ↔ `.htaccess` (routing)
- `includes/coach-config.load.php` ↔ `coach-config.php` ↔
  `coach-config.staging.php` (config constants)
