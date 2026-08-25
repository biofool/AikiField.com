# Component: Coaching Auth

## Responsibility

Blind `/login.php` page that gates pre-release `/beta/` assessment pages
by authenticating against the Quantum Aikido coaching backend
(AIRichardMoon, FastAPI on Cloud Run). Third frontend surface of a
shared auth flow spanning three repos.

## Files

| File | Role | Lines |
|------|------|-------|
| `login.php` | Blind login page; PHP session POST handlers; `?next=` redirect; already-authed fast path | 528 |
| `coach-proxy.php` | Reverse proxy `/coach-api/*` → Cloud Run backend | 267 |
| `coach-login.js` | Login/register/reset/confirm JS (loaded by `login.php`) | 523 |
| `coach-auth.css` | Login form styling (loaded by `login.php`) | 1492 |
| `includes/coach-config.load.php` | Config loader (env→local→staging→prod) | 95 |
| `includes/beta-gate.load.php` | Session gate for `/beta/*.php` | 125 |
| `includes/cloudflare-ips.php` | Cloudflare edge IP ranges + trust functions | 178 |
| `coach-config.php` | Non-secret production config template | 72 |
| `coach-config.staging.php` | Staging config (deployed to staging only) | 38 |
| `coach-config.local.php` | Gitignored — real secrets | UNKNOWN |
| `.htaccess` | Routes `/coach-api/*` → `coach-proxy.php`; origin lock; redirects | 162 |

## Interfaces

### Inbound (browser → login.php)

- `GET /login.php?next=<url-encoded-path>` — render login form (or
  redirect if already authed)
- `POST /login.php` with `action=backend-login` — establish session
  (called by `coach-login.js` after backend auth)
- `POST /login.php` with `action=logout` — destroy session

### Inbound (browser → coach-proxy.php via .htaccess)

- `ANY /coach-api/*` — forwarded to backend

### Outbound (login.php → backend)

- `POST /v1/auth/check-session` — verify email+sessionToken (cURL, 10s
  timeout)

### Outbound (coach-proxy.php → backend)

- `ANY /v1/auth/*`, `ANY /v1/chat-secure`, etc. — forwarded as-is
- Headers: `X-Proxy-Secret`, `CF-Connecting-IP`/`X-Forwarded-For`
  (trust-checked), forwarded request headers

## Dependencies

- **Code:** `includes/coach-config.load.php`, `includes/cloudflare-ips.php`
- **Config:** `COACH_BACKEND_URL`, `COACH_PROXY_SECRET`,
  `COACH_VERIFY_TLS`, `COACH_TIMEOUT`, `TURNSTILE_SITE_KEY`,
  `COACH_LOGIN_REDIRECT`
- **External:** AIRichardMoon backend (Cloud Run, FastAPI)
- **Runtime:** PHP 8.0+ with cURL; Apache mod_rewrite

## Consumers

- `beta/index.php`, `beta/assessment.php`,
  `beta/assessment-organisation.php`, `beta/assessment-leadership.php`,
  `beta/assessment-crossview.php`, `beta/data.php` — all require
  `includes/beta-gate.load.php` which reads the same session
- `contact-handler.php` — shares config loader and `cloudflare-ips.php`
  (for Turnstile keys and IP trust, not for auth)

## State/data

- PHP session: `qa_email`, `qa_session_token`, `qa_target_env`,
  `qa_is_admin`, `qa_session_checked_at`, `qa_session_check_failed_at`
- Cookie: `PHPSESSID`, 7-day, HttpOnly, Secure, SameSite=Lax, path=/
- No database; no server-side user store (backend owns user data)

## Boundaries

- **Same-origin only** — session cookie covers whole `aikifield.com`;
  no cross-domain SSO
- **Blind URL** — `login.php` is `noindex,nofollow`, not in nav
- **Beta gate scope** — only `/beta/*.php` requires auth; all other
  pages are public
- **No chat** — `coach-chat.js` was deleted; this surface is beta-gating
  only

## Security considerations

- Open-redirect guard: `af_safe_redirect()` rejects absolute URLs,
  scheme-relative, backslashes, CR/LF, login.php targets
- Proxy secret: empty `COACH_PROXY_SECRET` → registration requires
  Turnstile captcha (backend enforces)
- Client IP trust: only forwards CF-Connecting-IP when REMOTE_ADDR is
  genuine Cloudflare edge IP; otherwise overwrites with REMOTE_ADDR
- Method allow-list in proxy: GET/POST/PUT/PATCH/DELETE only
- Session regeneration on successful login (`session_regenerate_id(true)`)

## Cross-repo coordination (DECLARED)

Any change to login/registration/auth/session/invitation/proxy MUST:
1. Update `docs/coach-auth-prd.md` (this repo)
2. Update `~/projects/quantumaikido.com/docs/coach-dashboard-prd.md`
3. Update `~/projects/AIRichardMoon/backend/PRD.md`
4. Deploy all affected repos together

## Test coverage

- E2E: `tests/e2e/specs/login.spec.js`, `tests/e2e/specs/proxy.spec.js`,
  `tests/e2e/specs/redirects.spec.js`
- Unit: `tests/unit/test-cloudflare-ip-trust.php`
- Stub backend: `tests/e2e/stub-backend.php`
- See `../testing/test-map.yaml`

## Known risks

See `../debt/register.yaml` and `../change-impact/relationships.yaml`.
