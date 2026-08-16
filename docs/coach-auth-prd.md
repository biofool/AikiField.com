# PRD — AikiField Coaching Auth Integration

## Summary

AikiField.com (a static marketing site for a fractional-CISO consultancy)
authenticates against the **Quantum Aikido coaching backend**
(`AIRichardMoon`, FastAPI on Google Cloud Run) — the same backend that
powers `quantumaikido.com/members.php`. The auth surface is now a **blind
`/login.php` page** that exists solely to gate the pre-release `/beta/`
assessment pages. It is NOT linked from the public navigation.

**History:** AikiField.com previously hosted a coaching login + inline AI
Chat on its public **Demonstration Technologies** page (`projects.php`) as a
marketing CTA. That surface was removed — `projects.php` now shows an
**invitation card** pointing visitors to the contact form to request a live
demo. The login form + PHP session handler were extracted to the blind
`/login.php` so `/beta/` gating keeps working without a public login on the
marketing site. The inline AI Chat (`coach-chat.js`) was removed entirely;
the live chat lives on `quantumaikido.com`.

AikiField.com remains a **third frontend surface** for the shared coaching
auth flow (same backend user store, same session contract), alongside
`quantumaikido.com/web` (PHP frontend) and the `AIRichardMoon/frontend`
(backend-served static pages) — but the surface is now minimal (beta gating
only), not a public chat.

## Why this exists

The `/beta/` assessment pages are pre-release tools that should not be
public. They reuse the same coaching session as the (now-removed) projects
login so a member who already has a coaching account can sign in once and
access all beta pages for 7 days. The login page is blind (not in the nav,
`noindex,nofollow`) because it is an access gate, not a marketing surface.

## UI layout (login.php — blind, beta-gating only)

The login page uses a **two-column layout** (`.coach-login-layout`):
- **Left column** (`.coach-login-forms`): sign-in form, registration form,
  password reset, email confirmation — all the interactive auth steps.
- **Right column** (`.coach-login-caveats`, a `<details>` element): an intro
  panel ("Beta Access") and a privacy notice. On desktop (≥768px) the
  caveats are always visible and sticky. On mobile (<768px) the caveats
  appear first as a collapsible section with a toggle.

### Copy (login.php)

- Login heading: "Sign In"
- Login intro: "Sign in or register to access the beta assessment pages."
- Registration heading: "Create Account"
- Registration intro: "Sign up with your email and password to access the
  beta pages."
- **Invitation code is optional** — label includes "(if you have one)",
  placeholder says "(optional)".
- Email field label: "Email address or login ID"
- **Consent notice** below the login form: "By signing in, you confirm
  that you have read the privacy notice and agree to the processing
  described in the Privacy Policy."
- Intro panel: "Beta Access [Members]" — explains the session lasts 7 days
  and covers the whole `aikifield.com` origin, and that the same account
  works on quantumaikido.com.
- Privacy notice: 3-bullet summary (session cookie, backend on Cloud Run,
  don't enter sensitive info) + links to the Privacy Policy and AI Security
  & Safety Notice.

### ?next= redirect support

`login.php` accepts a `?next=<URL-encoded path>` query parameter. The
`includes/beta-gate.load.php` gate passes the originally-requested URI so
the user lands back on the page they wanted after signing in. Only
same-origin relative paths (starting with a single `/`, no scheme/host) are
accepted — this prevents open-redirect abuse. Defaults to `/beta/` when
`?next=` is absent or invalid.

### Already-authed fast path

If a visitor hits `/login.php` with an existing valid session, PHP redirects
them straight to the `?next=` target (or `/beta/`) without rendering the
form.

## projects.php — invitation card (no auth)

`projects.php` is now a fully public marketing page. The right column shows
an invitation card (`#see-it-live`) instead of the login/chat:

- Tags: "See it live" | "Free"
- Heading: "Want to see it in action?"
- Lead: "If you want to see it live, request an invitation when you contact
  us — we're happy to show you how easy it is to stand one up."
- Body: points at the live chat on quantumaikido.com and offers a
  corpus-specific build grounded in the visitor's own knowledge base.
- Button: "Request an invitation" → `contact.html`
- The page-header CTA ("See it live — request an invitation ↓") anchors to
  `#see-it-live`.

No PHP session handling, no `coach-login.js`, no `coach-chat.js`, no
`coach-auth.css`, no Turnstile widget on `projects.php`.

## Sister PRDs (dual-PRD rule — now a triple-PRD rule)

This auth flow spans **three** repos. Any change to the login, registration,
auth endpoints, session model, invitation codes, or proxy routing MUST update
all three PRDs and deploy all affected repos together:

1. **This PRD**: `AikiField.com/docs/coach-auth-prd.md` (AikiField frontend surface)
2. **QA frontend PRD**: `quantumaikido.com/web/docs/coach-dashboard-prd.md`
3. **Backend PRD**: `AIRichardMoon/backend/PRD.md`

Mismatched versions break the auth flow. See `AGENTS.md` (cross-repo
coordination section) and `~/.codeium/windsurf/memories/global_rules.md`.

## Architecture

```
aikifield.com/login.php     ──┐  (blind; gates /beta/ only)
                              │  (login form, coach-login.js)
                              ▼
aikifield.com/coach-api/*  ──▶  coach-proxy.php  ──▶  AIRichardMoon backend
   (.htaccess rewrite)            (PHP + cURL)         (Cloud Run, FastAPI)
                                                          │
                                                          ▼
                                                  /v1/auth/verify
                                                  /v1/auth/register-with-password
                                                  /v1/auth/check-session
                                                  /v1/auth/request-reset
                                                  /v1/auth/reset-password
                                                  /v1/auth/confirm-email
```

`projects.php` is no longer in this diagram — it is a static marketing page
with no auth surface. The invitation card on `projects.php` links to
`contact.html`, not to `login.php`.

AikiField's `coach-proxy.php` is a trimmed port of
`quantumaikido.com/web/coach-proxy.php`. It forwards `/coach-api/*` to
`COACH_BACKEND_URL`, sends `X-Proxy-Secret` when configured, and rewrites
OAuth `Location` headers back to `/login.php` (for future social-login
enablement; social login is currently disabled in `coach-login.js`).

### Rate-limit UX (issue #262)

Backend auth endpoints (`/v1/auth/verify`, `/v1/auth/login`, etc.) enforce
IP-based rate limiting. When a request is rate-limited, the backend returns
`429` with a user-safe JSON body:

```json
{"ok": false, "error": "Too many login attempts. Please wait a moment and try again.", "retry_after": <seconds>}
```

`coach-login.js` maps `429` to its own user-facing message via
`httpErrorMessage(429)` and ignores any raw backend limit details. The
concrete thresholds remain in server logs and admin alerts only.
AikiField's `coach-proxy.php` forwards `CF-Connecting-IP` and
`X-Forwarded-For` so the backend rate-limits per real visitor IP rather than
the shared proxy IP.

### File inventory (AikiField.com)

| File | Purpose | Source |
|---|---|---|
| `login.php` | **Blind** standalone login page (gates `/beta/` only). PHP session POST handlers (`backend-login`, `logout`), `?next=` redirect support, already-authed fast path. Not linked from nav. | extracted from the former `projects.php` auth block (issue #51 lineage) |
| `projects.php` | Demonstration Technologies marketing page — **fully public**, no auth. Shows the invitation card (`#see-it-live`) instead of the login/chat. Kept as `.php` for the `projects.html` → `projects.php` 301 and because `/beta/` pages link to it. | was the auth host; auth removed |
| `coach-proxy.php` | PHP reverse proxy `/coach-api/*` → backend | ported from QA `coach-proxy.php` (trimmed) |
| `coach-login.js` | Login/register/reset/confirm JS (loaded by `login.php`) | ported from QA `coach-login.js` |
| `coach-auth.css` | Login styling (loaded by `login.php`) | copied verbatim from QA |
| `includes/coach-config.load.php` | Config loader (local override → staging → production). Precedence: `QA_CONFIG_FILE` env var → `coach-config.local.php` (gitignored) → `coach-config.staging.php` (staging remote only) → `coach-config.php` (production). See `docs/STAGING.md` in the QA repo for the subdomain staging mechanism. | ported from QA |
| `coach-config.php` | Non-secret production config (backend URL, empty secret placeholders, `COACH_LOGIN_REDIRECT` default `/beta/`) | new template |
| `coach-config.local.php` | **gitignored** — holds the real `COACH_PROXY_SECRET` / Turnstile key | operator-provided |
| `.htaccess` | Routes `/coach-api/*` → `coach-proxy.php`; 301 `projects.html` → `projects.php`; 301s for the old `/beta/*.html` URLs → `/beta/*.php` | new |
| `includes/beta-gate.load.php` | Page gate for `/beta/*.php` — re-establishes the same `qa_email` / `qa_session_token` session as `login.php` (identical `session_set_cookie_params`) and redirects to `/login.php?next=<original path>` if absent. No new auth endpoint, session model, or proxy route — reuses the session `login.php` sets. Includes periodic re-validation against the backend's `/v1/auth/check-session` (every 6h via `qa_session_checked_at`) — if the backend explicitly rejects the session, the local session is destroyed and the user is redirected to login. Fails open on backend unreachable. **Note (issue #265)**: the sister repo `quantumaikido.com` now verifies sessions on **every request** in its `coach-auth-check.php` (not just every 6h); AikiField's 6h cadence is sufficient here because `/beta/` pages don't have the `coach-auth.js` crash-on-null-elements issue that motivated the per-request check in QA. | updated (was redirecting to `/projects.php#coach-login`) |
| `beta/data.php` | Session-gated JSON delivery for the beta assessment pages (`beta/js/assessment.js` fetches `data.php?f=<name>` instead of `data/<name>.json` directly); `beta/data/.htaccess` denies direct access to the raw JSON so the gate can't be bypassed by fetching the file straight | new |

### Removed in this revision

- `coach-chat.js` — **deleted**. The inline AI Chat no longer runs on
  `aikifield.com`; the live chat lives on `quantumaikido.com/members.php`.
- The authed/unauthed branch in `projects.php` — removed. The page is now a
  single static render for all visitors.
- The PHP session/login/logout handlers, Turnstile script block,
  `coach-auth.css` preload, and `coach-login.js`/`coach-chat.js` script
  loads from `projects.php` — all moved to `login.php` or dropped.

### What was NOT ported (intentionally, still applies)

- `coach-auth-check.php` (page gate) — `projects.php` is a **public** page;
  the invitation card is a CTA, not a gate. The page gate is scoped to
  `/beta/` only (see `includes/beta-gate.load.php` above).
- `dashboard-env.php` — AikiField has no dashboard. Staging wrappers ARE
  ported (see [Staging folder](#staging-folder-stagingloginphp) below).
- The environment-toggle UI (`#coach-env-controls`) and the profile link
  (`/profile.php`) — AikiField has no profile page.

## Session model

- PHP session cookie on `aikifield.com` (HttpOnly, Secure on HTTPS,
  SameSite=Lax, 7-day lifetime). Session keys: `qa_email`,
  `qa_session_token`, `qa_target_env`, `qa_is_admin` — identical to QA.
- `coach-login.js` posts `email` + `sessionToken` to `login.php`
  (`action=backend-login`), which verifies against
  `/v1/auth/check-session` and stores the session.
- On success the user is redirected to the `?next=` target (or `/beta/`).
  The session cookie covers the whole `aikifield.com` origin, so all
  `/beta/` pages read it via `includes/beta-gate.load.php`.
- There is **no chat** on `aikifield.com` anymore. `coach-chat.js` was
  deleted. The session exists only to gate `/beta/`.

> **Note — quantumaikido.com has migrated to JWT cookies (issue #119).**
> The sister frontend `quantumaikido.com` was migrated from a PHP shared host
> (GreenGeeks) to Cloudflare Pages. Its session management changed from PHP
> sessions (`session_start()` + `$_SESSION[...]`) to a signed JWT cookie named
> `qa_session` (HMAC-SHA256, 7-day expiry, HttpOnly, Secure, SameSite=Lax).
> The PHP endpoints were ported to Cloudflare Pages Functions
> (`/functions/login.js`, `/functions/members.js`,
> `/functions/coach-api/[[path]].js`, `/functions/logout.js`, etc.).
>
> **AikiField.com still uses PHP sessions** — it has not been migrated to
> Cloudflare Pages yet. The session model documented above is current and
> correct for AikiField. When AikiField is migrated, follow the same pattern
> as quantumaikido.com: port `login.php` → `/functions/login.js`,
> `coach-proxy.php` → `/functions/coach-api/[[path]].js`, and replace the PHP
> session with a signed JWT cookie. The backend API contract does not change
> (the backend still issues/validates session tokens via
> `/v1/auth/check-session`); only the frontend storage mechanism changes.
>
> Reference: https://github.com/biofool/quantumaikido.com/issues/119
> See also: `quantumaikido.com/web/docs/coach-dashboard-prd.md` §4.1.2
> (Cloudflare Pages Functions migration) and `AIRichardMoon/backend/PRD.md`
> (backend note — API contract unchanged).

### No cross-domain session issue

The login and the gated `/beta/` pages are all on `aikifield.com` (same
origin), so the PHP session cookie authenticates both. There is no redirect
to `quantumaikido.com` and no cross-domain SSO needed. The account itself is
shared (same backend user store), so a user who also visits
`quantumaikido.com/members.php` uses the same credentials — but that's a
separate session on a separate domain, independent of this integration.

## Configuration & secrets

| Constant | Where | Notes |
|---|---|---|
| `COACH_BACKEND_URL` | `coach-config.php` | Public Cloud Run URL (not a secret) |
| `COACH_PROXY_SECRET` | `coach-config.local.php` (gitignored) | MUST match backend `PROXY_SECRET` in GCP Secret Manager. When empty, auth endpoints still work, but **registration requires a Turnstile captcha** (backend enforces captcha when the proxy secret is absent). |
| `TURNSTILE_SITE_KEY` | `coach-config.local.php` (gitignored) | Cloudflare Turnstile site key for `aikifield.com`. Required for registration if `COACH_PROXY_SECRET` is empty. |
| `COACH_LOGIN_REDIRECT` | `coach-config.php` | Post-login fallback destination (default `/beta/`). `login.php` overrides this per-request with the `?next=` query parameter. |
| `COACH_LOGIN_URL` | `coach-config.php` | **Removed Aug 13 2026.** Previously an optional external login redirect for cross-repo parity with quantumaikido.com. Removed because the external Workers login caused a cross-domain auth failure (sessionStorage on the Workers domain could not create cookies on quantumaikido.com). AikiField never used this — its `login.php` gates `/beta/` only. |
| `COACH_VERIFY_TLS` | `coach-config.php` | Leave `true` in production. |

### Backend-side requirements (AIRichardMoon)

- Auth endpoints (`/v1/auth/*`) are already exempt from `X-Proxy-Secret`, so
  login/register work immediately. **No backend change required for login.**
- For **registration without captcha**: AikiField's proxy must send a valid
  `X-Proxy-Secret`. The backend already accepts any proxy that presents the
  shared secret — no per-origin allowlist exists. No backend change needed.
- **CORS**: not required. The browser talks to `/coach-api/*` on
  `aikifield.com` (same origin); the proxy does the cross-origin call
  server-side. The backend's `cors_origins` setting is irrelevant here.
- **Google OAuth** (if re-enabled in `coach-login.js`): the AikiField callback
  URL `https://aikifield.com/coach-api/v1/auth/google/callback` must be
  registered as an authorized redirect URI in the Google Cloud console OAuth
  client. Currently disabled, so no action needed.

## Cloud strategy — CloudManagement coordination

AikiField.com is static HTML + a thin PHP proxy on peec.biz shared hosting
(no paid APIs, no cloud resources of its own). The proxy forwards to the
AIRichardMoon Cloud Run backend, which is already tracked in CloudManagement.
Adding this auth surface does **not** add a cloud resource, so no
CloudManagement inventory update is required.

### CDN layer (issue #25 — Cloudflare migration, live)

`aikifield.com` is served through a Cloudflare Free plan zone
(`71a04598ce4a9580faf7c0ee79f6da6c`), giving edge caching at Cloudflare's
Auckland and Wellington PoPs (the primary audience is NZ). Measured TTFB
from NZ is ~30ms. The proxy chain:

```
browser → Cloudflare edge (NZ) → greengeeks origin (Chicago) → coach-proxy.php → Cloud Run backend
```

Cloudflare cache rules:
- `*.html` — cache at edge for 1 hour
- `*.css`, `*.js`, `*.svg` — cache at edge for 1 year (immutable)
- `*.php` — bypass cache (dynamic, session-based)
- `/beta/*` — bypass cache (session-gated PHP pages)

Verified through the edge: `projects.php` and `/beta/*` return
`cf-cache-status: DYNAMIC`, and `/coach-api/v1/auth/providers` returns JSON,
so cookies and the proxy chain pass through unchanged. `/coach-api/*` is not
yet covered by an explicit bypass rule — it is uncached incidentally rather
than by configuration.

**Auth flow is unchanged by the migration.** The CDN sits in front of an
otherwise identical chain, so the triple-PRD rule is not triggered: session
handling, cookie attributes, `coach-proxy.php` behaviour and the backend
endpoints are all untouched, and only `aikifield.com` sits behind the edge.
If any of those need to change, the rule applies in full and
`docs/coach-dashboard-prd.md` (QuantumAikido) plus `backend/PRD.md`
(AIRichardMoon) must move with it.

Because HTML is cached at the edge for an hour, a deploy is invisible to
visitors until the cache is purged — `sync.sh` purges automatically via
`scripts/cloudflare_migrate.py --purge` after a successful upload.

### Performance optimizations (issue #25, Phase 1 + Phase 5)

Completed optimizations deployed to production:
- `.htaccess`: cache-control on static HTML (1hr), immutable on CSS/JS/SVG (1yr)
- `.htaccess`: www → non-www 301 redirect, http → https 301 redirect
- `.htaccess`: `X-Powered-By` header suppressed, `Referrer-Policy` header added
- Favicon (`/favicon.svg`) created and deployed — eliminates 404 round trip
- Canonical URLs (`rel="canonical"`) on all pages
- Google Fonts: reduced from 4 weights to 3 (dropped 500) — saves ~2 font file downloads
- Google Fonts CSS: loaded asynchronously via `preload` + `onload` swap (non-render-blocking)
- `coach-auth.css`: loaded synchronously on `login.php` (the only page that needs it now that `projects.php` is auth-free)
- `defer` attribute added to `carousel.js`, `coach-login.js` (`coach-chat.js` was removed)
- Open Graph + Twitter Card meta tags on all pages
- `theme-color` and `apple-touch-icon` meta tags on all pages
- Removed unused `css/style.css` and `js/main.js` from server
- Deployed `fractional-ciso.html` and `board-security-clarity.html` (were 404 on production)

## Deploy

1. `./sync.sh dryrun` — preview the rsync to `peec.biz:public_html/aikifield/`.
2. Fill in `coach-config.local.php` locally with `COACH_PROXY_SECRET` (and
   `TURNSTILE_SITE_KEY` if using captcha) and deploy it out-of-band (it is
   gitignored). **Never commit it.**
3. `./sync.sh deploy` — push to production.
4. Confirm `https://aikifield.com/projects.php` loads (public, invitation
   card visible, no login form, no `coach-login.js`/`coach-chat.js`).
5. Confirm `https://aikifield.com/login.php` loads the login form (blind —
   not linked from nav) and `coach-login.js` is loaded.
6. Confirm `https://aikifield.com/beta/assessment.php` 302-redirects to
   `https://aikifield.com/login.php?next=%2Fbeta%2Fassessment.php`.
7. Confirm `https://aikifield.com/coach-api/v1/auth/providers` returns JSON.
8. Confirm `https://aikifield.com/projects.html` 301-redirects to
   `projects.php`.

**Staging deploy** (`./sync.sh staging deploy` → `aikifield.peec.biz`):

1. `./sync.sh staging dryrun` — preview the rsync to
   `peec.biz:public_html/aikifield.peec.biz/`.
2. Ensure `coach-config.staging.php` defines `COACH_STAGING_URL` pointing
   to the staging Cloud Run backend
   (`https://quantum-aikido-coach-staging-6bfpsd3kkq-uc.a.run.app`).
3. `./sync.sh staging deploy` — push to staging.
4. Confirm `https://aikifield.peec.biz/staging/login.php` loads the login
   form with `window.COACH_API_BASE = "/staging/coach-api"` and
   `window.COACH_FORCE_STAGING = true`.
5. Confirm `https://aikifield.peec.biz/staging/coach-api/v1/auth/providers`
   returns JSON from the staging backend.
6. Test a full register → login → beta-access round-trip on staging.

### Staging folder (`/staging/*`)

A dedicated staging entry point is available at
`https://aikifield.peec.biz/staging/login.php` so operators can test
login/registration changes in staging before promoting to production.
This mirrors the quantumaikido.com `/staging/` pattern — see
[§Staging folder in the QA PRD](https://github.com/biofool/quantumaikido.com/blob/main/docs/coach-dashboard-prd.md#staging-folder-stagingmembersphp).

Every file in `/staging/` is a thin wrapper: it defines `COACH_FORCE_STAGING`
and `require`s its parent. There is no staging-specific markup, JS or CSS
anywhere — one implementation, two environments.

| Wrapper | Parent | Staging URL |
|---|---|---|
| `staging/login.php` | `login.php` | `/staging/login.php` |
| `staging/coach-proxy.php` | `coach-proxy.php` | `/staging/coach-api/*` |

- **`staging/login.php`** — the parent detects the constant and sets
  `window.COACH_API_BASE = "/staging/coach-api"` + `window.COACH_FORCE_STAGING = true`
  so all client-side API calls route through the staging proxy. The login
  redirect after successful auth goes to `/beta/` (same as production —
  AikiField has no separate staging beta folder; the session cookie covers
  the whole origin).
- **`staging/coach-proxy.php`** — thin PHP wrapper that defines
  `COACH_FORCE_STAGING` and includes the parent `coach-proxy.php`. The parent
  detects the constant and always selects `COACH_STAGING_URL` as the backend
  (ignoring `X-Target-Environment` and the default `COACH_BACKEND_URL`).
  **Requires `COACH_STAGING_URL` to be defined in `coach-config.staging.php`**
  (currently it is empty — see below).
- **`staging/.htaccess`** — rewrites `^coach-api(/.*)?$` to
  `staging/coach-proxy.php`, mirroring the root `.htaccess` rule. It also
  inherits (and duplicates as a fallback) the extensionless URL rewrite from
  the root `.htaccess` so that `/staging/login` resolves to
  `/staging/login.php`. Without this, per-directory rewrite rules replace
  rather than merge with the parent's rules and those URLs 404 (same issue
  as QA #115).
- **`coach-config.staging.php`** — must define `COACH_STAGING_URL` pointing
  to the staging Cloud Run backend
  (`https://quantum-aikido-coach-staging-6bfpsd3kkq-uc.a.run.app`).
  Currently this file defines `COACH_BACKEND_URL` as a non-resolving
  `.invalid` placeholder. When the staging folder is deployed, either:
  - **Option A (recommended):** set `COACH_STAGING_URL` to the staging
    Cloud Run URL and keep `COACH_BACKEND_URL` as the `.invalid` placeholder
    (so the root proxy still can't reach production from the staging
    subdomain, but `/staging/coach-api/*` routes to the staging backend).
  - **Option B:** set `COACH_BACKEND_URL` directly to the staging Cloud Run
    URL (simpler, but then the root `/coach-api/*` on the staging subdomain
    also hits the staging backend — acceptable since the staging subdomain
    is not public-facing).
- **`coach-proxy.php`** — the parent must be updated to check
  `COACH_FORCE_STAGING`: when set, use `COACH_STAGING_URL` (falling back to
  `COACH_BACKEND_URL` if `COACH_STAGING_URL` is empty) instead of always
  using `COACH_BACKEND_URL`. This mirrors the QA proxy's
  `COACH_FORCE_STAGING` handling.
- **`login.php`** — the parent must be updated to check
  `COACH_FORCE_STAGING`: when set, override `$apiBase` to
  `/staging/coach-api` and set `window.COACH_FORCE_STAGING = true` so
  `coach-login.js` routes all auth calls through the staging proxy.
- **No-index** — the staging page inherits `<meta name="robots"
  content="noindex, nofollow">` from the parent `login.php` and is not
  linked from the public site. Operators must be given the direct URL.
- **No OAuth on staging** — AikiField does not currently have Google OAuth
  enabled (see Future considerations). The staging login exercises
  email/password registration and login only. When OAuth is enabled, the
  proxy must construct the OAuth callback URL as
  `/staging/coach-api/v1/auth/google/callback` (mirroring QA's pattern).

### Branch and staging policy

This repo is part of a three-repo coaching system (AikiField.com frontend,
quantumaikido.com frontend, AIRichardMoon backend). All three repos MUST
maintain a three-branch workflow: `dev` → `staging` → `main`:

- **`dev` branch** — integration branch. Features and fixes are merged
  here first for integration testing with other repos.
- **`staging` branch** — validation branch. Changes promoted from `dev`
  are verified against the staging backend before reaching production.
- **`main` branch** — production. Only merged from `staging` via PR after
  validation passes.
- **Do not delete `dev` or `staging` after merge.** Both branches are
  permanent — they are reused for every release cycle. Deleting them (as
  happened to `staging` on 2026-08-15) forces recreation and loses branch
  protection rules and CI history.
- **Cross-repo coordination** — when auth, session, invitation, or
  profile changes touch all three repos, integrate on `dev`, validate on
  `staging`, and merge all three `staging` branches to `main` in the same
  cycle before deploying any to production. Mismatched frontend/backend
  versions break the auth flow.
- **AikiField `/staging/` folder** — mirrors the QA staging pattern (see
  [Staging folder](#staging-folder-stagingloginphp) above). Contains thin
  wrappers for `login.php` and `coach-proxy.php`. Deployed to
  `aikifield.peec.biz` via `./sync.sh staging deploy`.

## Verification

- `php -l` on all `.php` files (passes as of this writing).
- Built-in server, `projects.php`: returns 200, invitation card
  (`#see-it-live`) rendered, no `coach-login`/`coach-chat`/`coach-shell`
  markup, no `coach-auth.css`, no Turnstile script, no PHP warnings.
- Built-in server, `login.php` (unauthed): returns 200, login form
  rendered, `coach-login.js` loaded, registration form present, no PHP
  warnings.
- Built-in server, `login.php` (authed via fake session cookie): 302
  redirects to the `?next=` target (or `/beta/`) without rendering the form.
- Built-in server, `beta/assessment.php` (unauthed): 302 redirects to
  `/login.php?next=%2Fbeta%2Fassessment.php`.
- Proxy end-to-end: `/coach-api/v1/auth/providers` → 200 with the live
  backend's provider list (verified against the Cloud Run backend).
- Full login → beta-access round-trip must be tested on `peec.biz` (Apache +
  mod_rewrite) after deploy, since the built-in PHP server does not process
  `.htaccess`.
- Staging: `php -l` on `staging/login.php` and `staging/coach-proxy.php`.
- Staging: built-in server, `staging/login.php` (unauthed): returns 200,
  login form rendered, `coach-login.js` loaded,
  `window.COACH_API_BASE = "/staging/coach-api"`,
  `window.COACH_FORCE_STAGING = true`.
- Staging: `/staging/coach-api/v1/auth/providers` → 200 with the staging
  backend's provider list (requires `COACH_STAGING_URL` in
  `coach-config.staging.php`).
- Staging: full login → beta-access round-trip on `aikifield.peec.biz`
  after `./sync.sh staging deploy`.

## Future considerations

- Cross-domain SSO via one-time token exchange (only needed if you want a
  single login to carry across `aikifield.com` AND `quantumaikido.com`
  simultaneously — not currently needed; the live chat lives on QA).
- Re-enable Google OAuth on AikiField (register the AikiField callback URI
  `https://aikifield.com/coach-api/v1/auth/google/callback`).
- Bring the inline chat back to `aikifield.com` (would require restoring
  `coach-chat.js` and a chat host page; currently out of scope — the
  invitation card routes demo requests through the contact form instead).
- AikiField profile page (`/profile.php`) if profile management is wanted
  here (currently profile management is only on `quantumaikido.com`).
