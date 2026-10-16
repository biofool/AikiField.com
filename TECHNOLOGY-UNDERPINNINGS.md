# AikiField.com — Technology Underpinnings

This document describes the main features of AikiField.com and how they are
implemented. It references actual files and technologies in the repository.

## Static marketing pages

The public site is built as hand-authored static HTML pages with shared
stylesheets and vanilla JavaScript.

- **Pages:** `index.html`, `services.html`, `process.html`, `approach.html`,
  `case-studies.html`, `assessment.html`, `contact.html`, `books.html`,
  `fractional-ciso-for-saas.html`, `ai-devsecops-vulnerability-remediation.html`,
  `board-security-clarity.html`.
- **Styles:** `css/redesign.css` is the main stylesheet. `css/home.css`
  contains home-specific styles. `coach-auth.css` styles the login page only.
- **Scripts:** `js/main.js` holds shared JavaScript. `js/nav-menu.js`,
  `js/language-selector.js`, `js/locale-utils.js`, `js/carousel.js`, and
  `js/books.js` handle navigation, i18n, carousels, and the book list.
- **Fonts:** Google Fonts are loaded from `fonts.googleapis.com` with a
  preload directive in each page head.

The navigation is duplicated in each page rather than using a server-side
include. This keeps the site deployable as plain static files while still
allowing interactive submenus and mega-menu markup.

## Content source of truth

`SITE_CONTENT.md` is the source of truth for all site text. Page copy,
navigation labels, and structured-data descriptions are maintained there and
mirrored into the HTML files. `llms.txt` summarizes the site for large language
model context windows.

## Internationalization (i18n)

Selected pages use a lightweight i18n layer.

- **Glossary:** `data/i18n-glossary.json` stores translated strings keyed by
  page and element.
- **Config:** `data/i18n-config.json` defines available locales and routing.
- **Cache:** `data/translation-cache.json` holds cached translations.
- **Router:** `js/locale-utils.js` reads the browser locale and `data-i18n`
  attributes to swap text. `tests/test_locale_path.js` and
  `tests/locale-router.php` exercise the routing logic.

Not all newer copy (for example the 2026-10 home page redesign) has `data-i18n`
keys, so it renders in English across all locales until translations are added.

## Somatic studios pathway

The `/somatic-studios/` path gives yoga, aikido, tai chi, dance, and movement
studios access to free digital support.

- **Landing page:** `somatic-studios/index.html` explains the Studio
  Visibility Review and World Studio Finder listing.
- **Intake form:** The form posts to `studio-review-handler.php`.
- **Handler:** `studio-review-handler.php` validates input, applies a honeypot
  field, checks the Cloudflare Turnstile token when configured, rate-limits by
  IP, detects staging hostnames to avoid sending test mail to the live inbox,
  and sends email via PHP `mail()`.
- **Thank-you page:** `somatic-studios/thanks.html`.

The handler reuses `includes/coach-config.load.php` for Turnstile credentials
and `includes/cloudflare-ips.php` to determine the real client IP behind
Cloudflare.

## Contact form

`contact.html` collects inquiries and posts to `contact-handler.php`.

- **Validation:** server-side checks for name, email, subject, and message.
- **Bot protection:** optional Cloudflare Turnstile widget; the site key is
  exposed through `turnstile-sitekey.php` so the static HTML page can load it.
- **Rate limiting:** per-IP rate limit backed by files in `data/ratelimit/`.
- **Staging guard:** same hostname detection as `studio-review-handler.php`.
- **Mail:** sent via PHP `mail()` to `kenneth@aikifield.com`.

## Coaching authentication and gating

The site shares a coaching backend with `quantumaikido.com` (the
`AIRichardMoon` Cloud Run service). Authentication is handled by a small PHP
layer.

- **Config template:** `coach-config.php` defines production defaults for the
  backend URLs, timeouts, and redirect paths. Secrets live in
  `coach-config.local.php`, which is gitignored and loaded by
  `includes/coach-config.load.php`.
- **Login page:** `login.php` is a blind standalone page that establishes a PHP
  session and authenticates against the backend via `coach-proxy.php`. It
  supports `?next=` redirects back to the originally requested page with an
  open-redirect guard in `af_safe_redirect()`.
- **Proxy:** `coach-proxy.php` forwards `/coach-api/*` requests to the backend,
  adding `X-Proxy-Secret` for trusted non-auth endpoints. It applies IP-based
  rate limiting and Cloudflare edge-IP trust logic from
  `includes/cloudflare-ips.php`.
- **Session gate:** `includes/beta-gate.load.php` checks the PHP session for
  `qa_email` and `qa_session_token`, periodically revalidates against the
  backend `/v1/auth/check-session`, and redirects unauthenticated visitors to
  `/login.php?next=...`.
- **Gated pages:** `/beta/*.php` pages require `includes/beta-gate.load.php`.
  `/members.php` hosts the AI coaching chat; `coach-chat.js` provides the client
  logic and the chat stylesheet is in `css/coach-chat.css`.
- **Client-side login logic:** `coach-login.js` handles registration, login,
  password reset, confirmation, and invitation-code entry, posting through
  `login.php`.

See `docs/coach-auth-prd.md` for the shared-flow contract with
`quantumaikido.com` and `AIRichardMoon`.

## Demonstration Technologies and Digital Experience

- **`projects.php`** is a public marketing page. It previously hosted the
  coaching login inline; now it shows an invitation card that points visitors
  to `contact.html` for a live demo.
- **`digital-experience/`** contains public preview pages for members-only
  experiences: Ride the Lucky Wave, Twenty Practices, and the Unified Field
  Chat. The previews explain the experience and link to the gated paths.
- **`/games/`** serves the public game hub at `games/index.html` and the
  Twenty Practices exercise app at `games/exercises/index.php`. The server
  reads the practice text from `data/exercises/practices.json` (a directory
  the web server denies, issue #114) and sends a signed-in member every
  practice, and an anonymous `?src=li` visitor only the practices marked free.
  The app stores progress in `localStorage`, and supports `?exercise=` and
  `?studio_id=` query parameters plus slug routing via
  `games/exercises/.htaccess`.

## Assessment tools

- **`assessment.html`** — public self-assessment for security maturity and
  leadership presence.
- **`beta/assessment.php`** and related pages — gated, multi-part assessments
  backed by JSON data in `beta/data/` and driven by `beta/js/assessment.js`.

## Operations dashboard

`dashboard.php` provides a lightweight Cloudflare log and analytics dashboard
for operators. It requires `DASHBOARD_ADMIN_KEY`, `CLOUDFLARE_API_TOKEN`, and
`CLOUDFLARE_ZONE_ID` from `coach-config.local.php`.

## Apache, caching, and security

- **`.htaccess`** sets security headers (HSTS, referrer policy, X-Frame-Options,
  X-Content-Type-Options), canonical redirects, Cloudflare origin locking via
  `mod_authz_host`, and the `/coach-api/*` rewrite to `coach-proxy.php`.
- **`includes/cloudflare-ips.php`** mirrors Cloudflare's published IP ranges for
  PHP-side trust decisions in `coach-proxy.php` and the form handlers.
- **`scripts/verify-cloudflare-ips.php`** compares the vendored list against
  Cloudflare's live published ranges before each deploy.

## Deployment

`sync.sh` is the deploy tool.

- **Targets:** production (`public_html/aikifield.peec.biz/`) and staging
  (`public_html/aikifield-staging/`). Staging deploys require the `staging`
  branch.
- **Excludes:** `.git/`, `input/`, `.devin/`, `scripts/`, `tests/`, `*.md`,
  `*.py`, `*.sh`, `marketing/`, `data/private/*.json`, and secrets (`*.env*`).
- **Pre-deploy gates:** PHP syntax check, optional local CI, optional
  dependency audit.
- **Post-deploy actions:** optional Cloudflare cache purge.
- **Logs:** `logs/` holds fetched server access logs; `sync.sh report` can
  generate traffic statistics.

## Testing

- **`tests/e2e/run.sh`** — Playwright end-to-end tests using
  `tests/e2e/playwright.config.js`, `tests/e2e/router.php`,
  `tests/e2e/stub-backend.php`, and `tests/e2e/helpers.js`.
- **`tests/unit/`** — PHP unit tests for Cloudflare IP trust and log
  classification; Python unit tests for Cloudflare migration and token
  allocation scripts.
- **`tests/test_locale_path.js`** and **`tests/locale-router.php`** — i18n
  routing tests.
- **Post-edit hooks:** `.claude/hooks/post_edit_lint.py` runs linters on
  changed files.

## Data files

- **`data/books-search.json`** — book metadata and search index.
- **`data/welcome-messages.json`** — welcome messages used in coaching flows.
- **`data/i18n-glossary.json`**, **`data/i18n-config.json`**,
  **`data/translation-cache.json`** — internationalization data.
- **`data/audit/`** — output directory for one-off fix scripts.
- **`data/ratelimit/`** — per-IP rate-limit counters for form handlers.
- **`data/private/`** — server-side runtime data for the `/for-review/` area.
  The directory deploys, but JSON contents are excluded from rsync.

## Large assets and DVC

Large binary files such as `AikiField.pdf` and the accessibility redesign zip
are tracked by DVC rather than git. `dvc pull` fetches them from the configured
R2 remote. See `.dvc/config` and `.ai-context/` for architecture notes.
