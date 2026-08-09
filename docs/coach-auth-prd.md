# PRD — AikiField Coaching Auth Integration

## Summary

AikiField.com (a static marketing site for a fractional-CISO consultancy) now
hosts a coaching login on its **Demonstration Technologies** page (`projects.php`).
The login authenticates visitors against the **Quantum Aikido coaching
backend** (`AIRichardMoon`, FastAPI on Google Cloud Run) — the same backend
that powers `quantumaikido.com/members.php`. Visitors can sign in or register
(invitation-only) and are then directed to the AikiField AI Chat.

This makes AikiField.com a **third frontend surface** for the shared coaching
auth flow, alongside `quantumaikido.com/web` (PHP frontend) and the
`AIRichardMoon/frontend` (backend-served static pages).

## Why this exists

The Demonstration Technologies page (formerly "Demonstration Technologies") describes
the AikiField AI Chat as a demonstration project. Leading the page with a
working sign-in / registration CTA lets an interested visitor create an
account and enter the chat directly from the project page, instead of having
to find the chat on `quantumaikido.com`.

## UI layout (issues #20, #21 — ported from quantumaikido.com #113)

The unauthed login area uses a **two-column layout** (`.coach-login-layout`):
- **Left column** (`.coach-login-forms`): sign-in form, registration form,
  password reset, email confirmation — all the interactive auth steps.
- **Right column** (`.coach-login-caveats`, a `<details>` element): the intro
  panel ("About AikiField AI Chat") and the privacy notice. On desktop
  (≥768px) the caveats are always visible and sticky. On mobile (<768px)
  the caveats appear first as a collapsible section with a toggle.

### Copy changes (issue #20)

- Login heading: "Sign In" (was "Sign in to the AI Chat")
- Login intro: "Sign in or register to start chatting." (was "Have an
  invitation code? Sign in, or register below...")
- Registration heading: "Create Account" (was "Create your account")
- Registration intro: "Sign up with your email and password to start
  chatting." (was "Register with your email, password, and invitation
  code...")
- **Invitation code is now optional** (was required). Label includes
  "(if you have one)", placeholder says "(optional)", `required` attribute
  removed.
- Email field label: "Email address or login ID" (was "Email or login ID")
- Email placeholder: "name@example.com or your login ID" (was
  "you@example.com or your login ID")
- Registration email placeholder: "name@example.com" (was "you@example.com")
- Password placeholder: "Password" (was "Your password")
- **Consent notice** added below the login form: "By signing in, you
  confirm that you have read the privacy notice and agree to the processing
  described in the Privacy Policy."
- Intro panel subtitle added: "AI-supported guidance for embodied practice,
  awareness, and constructive interaction."
- Intro features rewritten to match QA #113 (3 bullets, not 3 different ones)

### Privacy notice rework (issue #20)

The old 6-bullet collapsible privacy notice (with "invited members only"
language) was replaced with a **3-bullet summary** + expandable details:
- Summary: conversations stored + processed by Gemini, deletion available,
  don't enter sensitive info
- Links: Privacy Policy + AI Security & Safety Notice (visible)
- Full privacy details: 3 additional bullets in a nested `<details>`
- "Before you begin" heading (was "Privacy notice")
- Removed: "invited members only" language, "By logging in you acknowledge
  this notice" (replaced by the consent notice above the login form)
- Removed: the callout banner pointing at the login form

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
aikifield.com/projects.php  ──┐
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

AikiField's `coach-proxy.php` is a trimmed port of
`quantumaikido.com/web/coach-proxy.php`. It forwards `/coach-api/*` to
`COACH_BACKEND_URL`, sends `X-Proxy-Secret` when configured, and rewrites
OAuth `Location` headers back to `/projects.php` (for future social-login
enablement; social login is currently disabled in `coach-login.js`).

### File inventory (AikiField.com)

| File | Purpose | Source |
|---|---|---|
| `projects.php` | Demonstration Technologies page + inline login/register CTA (unauthed) **and** the AI Chat (authed) at top of `<main>`; PHP session POST handlers (`backend-login`, `logout`) | ported from `login.php` + `members.php` (issue #51) |
| `coach-proxy.php` | PHP reverse proxy `/coach-api/*` → backend | ported from QA `coach-proxy.php` (trimmed) |
| `coach-login.js` | Login/register/reset/confirm JS (loaded only when unauthed) | ported from QA `coach-login.js` |
| `coach-chat.js` | Chat UI JS — reads `window.QA_SESSION`, calls `/coach-api/v1/chat-secure` (loaded only when authed) | ported from QA `coach-chat.js` (logout/expiry URLs via `window.COACH_LOGIN_URL`) |
| `coach-auth.css` | Login + chat styling | copied verbatim from QA |
| `includes/coach-config.load.php` | Config loader (local override → production) | ported from QA |
| `coach-config.php` | Non-secret production config (backend URL, empty secret placeholders) | new template |
| `coach-config.local.php` | **gitignored** — holds the real `COACH_PROXY_SECRET` / Turnstile key | operator-provided |
| `.htaccess` | Routes `/coach-api/*` → `coach-proxy.php`; 301 `projects.html` → `projects.php`; 301s for the old `/beta/*.html` URLs → `/beta/*.php` | new |
| `includes/beta-gate.load.php` | Page gate for `/beta/*.php` — re-establishes the same `qa_email` / `qa_session_token` session as `projects.php` (identical `session_set_cookie_params`) and redirects to `/projects.php#coach-login` if absent. No new auth endpoint, session model, or proxy route — reuses the session `projects.php` already sets. | new (issue: gate `/beta/` behind the coach login) |
| `beta/data.php` | Session-gated JSON delivery for the beta assessment pages (`beta/js/assessment.js` fetches `data.php?f=<name>` instead of `data/<name>.json` directly); `beta/data/.htaccess` denies direct access to the raw JSON so the gate can't be bypassed by fetching the file straight | new |

### What was NOT ported (intentionally)

- `coach-auth-check.php` (page gate) — `projects.php` is a **public** page;
  the login form is a CTA, not a gate. The sponsored-projects content stays
  visible to all visitors. A page gate was later added, but scoped to
  `/beta/` only (see `includes/beta-gate.load.php` above) — `/beta/` content
  is unfinished/pre-release, unlike the public Demonstration Technologies page.
- `dashboard-env.php` / staging wrappers — AikiField has no dashboard and no
  `/staging/` folder.
- The environment-toggle UI (`#coach-env-controls`) and the profile link
  (`/profile.php`) — AikiField has no staging backend and no profile page.
  `coach-chat.js` handles their absence gracefully (null-guards on the DOM
  refs).

## Session model

- PHP session cookie on `aikifield.com` (HttpOnly, Secure on HTTPS,
  SameSite=Lax, 7-day lifetime). Session keys: `qa_email`,
  `qa_session_token`, `qa_target_env`, `qa_is_admin` — identical to QA.
- `coach-login.js` posts `email` + `sessionToken` to `projects.php`
  (`action=backend-login`), which verifies against
  `/v1/auth/check-session` and stores the session.
- On success the user is redirected back to `projects.php` (same page). On
  reload, PHP sees the session cookie and renders the **AI Chat inline**
  (`coach-chat.js`) instead of the login form.
- `coach-chat.js` reads the session from `window.QA_SESSION` (PHP-injected
  from the same-domain cookie) and calls `/coach-api/v1/chat-secure` on the
  same origin → `coach-proxy.php` → backend. **No cross-domain redirect.**
  The `aikifield.com` session cookie is valid for the chat because the chat
  lives on `aikifield.com`.

### No cross-domain session issue

Because the chat is hosted inline on `projects.php` (same origin as the
login), the PHP session cookie authenticates both. There is no redirect to
`quantumaikido.com` and no cross-domain SSO needed. The account itself is
shared (same backend user store), so a user who also visits
`quantumaikido.com/members.php` uses the same credentials — but that's a
separate session on a separate domain, independent of this integration.

## Configuration & secrets

| Constant | Where | Notes |
|---|---|---|
| `COACH_BACKEND_URL` | `coach-config.php` | Public Cloud Run URL (not a secret) |
| `COACH_PROXY_SECRET` | `coach-config.local.php` (gitignored) | MUST match backend `PROXY_SECRET` in GCP Secret Manager. When empty, auth endpoints still work, but **registration requires a Turnstile captcha** (backend enforces captcha when the proxy secret is absent). |
| `TURNSTILE_SITE_KEY` | `coach-config.local.php` (gitignored) | Cloudflare Turnstile site key for `aikifield.com`. Required for registration if `COACH_PROXY_SECRET` is empty. |
| `COACH_LOGIN_REDIRECT` | `coach-config.php` | Post-login destination (default QA members chat). |
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
- `coach-auth.css`: loaded asynchronously on `projects.php` (only styles below-fold content)
- `defer` attribute added to `carousel.js`, `coach-login.js`, `coach-chat.js`
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
4. Confirm `https://aikifield.com/projects.php` loads and
   `https://aikifield.com/coach-api/v1/auth/providers` returns JSON.
5. Confirm `https://aikifield.com/projects.html` 301-redirects to
   `projects.php`.

## Verification

- `php -l` on all new `.php` files (passes as of this writing).
- Built-in server, **unauthed**: `projects.php` returns 200, login form
  rendered, `coach-login.js` loaded, chat UI absent, no PHP warnings.
- Built-in server, **authed** (fake session cookie): `projects.php` returns
  200, login form absent, chat UI rendered (`coach-chat-form`), `coach-chat.js`
  loaded, `coach-login.js` NOT loaded, `window.QA_SESSION` injected with the
  email, existing marketing content present, no PHP warnings.
- Proxy end-to-end: `/coach-api/v1/auth/providers` → 200 with the live
  backend's provider list (verified against the Cloud Run backend).
- Full login → chat round-trip must be tested on `peec.biz` (Apache +
  mod_rewrite) after deploy, since the built-in PHP server does not process
  `.htaccess`.

## Future considerations

- Cross-domain SSO via one-time token exchange (only needed if you want a
  single login to carry across `aikifield.com` AND `quantumaikido.com`
  simultaneously — not needed for the chat, which is hosted on AikiField).
- Re-enable Google OAuth on AikiField (register the AikiField callback URI).
- AikiField staging folder (`/staging/projects.php`) mirroring QA's staging
  pattern, if a staging backend is needed for this surface.
- AikiField profile page (`/profile.php`) if profile management is wanted
  here (currently profile management is only on `quantumaikido.com`).
