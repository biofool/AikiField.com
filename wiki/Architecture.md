# Architecture — AikiField.com

- **Pages (root):** `index.html`, `approach.html`, `services.html`,
  `process.html`, `projects.php`, `assessment.html`, `contact.html`.
  (`projects.html` 301-redirects to `projects.php` via `.htaccess`.
  `projects.php` is a fully public marketing page — no auth, no chat — kept
  as `.php` for the redirect and because `/beta/` pages link to it.)
- **Somatic-studios pathway:** `somatic-studios/` (landing page +
  `thanks.html`, English-only) and `studio-review-handler.php` (intake form
  → email, same honeypot/Turnstile/rate-limit/staging mechanics as
  `contact-handler.php`). Linked as "Free Services For Studios" in the primary nav
  and via the homepage audience gateway (`#paths`).
- **Styles:** `css/` (e.g. `css/redesign.css`) + `coach-auth.css` (login
  form, loaded only by `login.php`).
- **Scripts:** `js/` + `coach-login.js` (login/register/reset/confirm,
  loaded only by `login.php`).
- **Coaching auth (PHP, beta-gating only):** `login.php` (blind standalone
  login page — gates `/beta/` and `/for-review/` (games), not linked from nav; PHP session POST
  handlers + `?next=` redirect), `coach-proxy.php`
  (`/coach-api/*` → AIRichardMoon backend), `coach-login.js`,
  `includes/coach-config.load.php`, `coach-config.php` (non-secret
  template), `coach-config.local.php` (gitignored — `COACH_PROXY_SECRET` /
  `TURNSTILE_SITE_KEY`), `includes/beta-gate.load.php` (redirects unauthed
  `/beta/` requests to `/login.php?next=…`), `.htaccess`.
  See `docs/coach-auth-prd.md`. Note: `projects.php` no longer hosts any
  login or chat — it shows an invitation card instead. The AI chat is
  replicated at `/members` (`members.php` + `coach-chat.js` +
  `css/coach-chat.css`, gated by `beta-gate.load.php`, linked from the
  nav's Digital Experience menu as "Enter the Unified Field Chat");
  `quantumaikido.com/members` stays live too.
- **Primary nav:** duplicated in every page (no include). Services is a
  submenu (Process, Approach); Digital Experience links to public preview

## Top-level layout
- `AEO/`
- `ask/`
- `assets/`
- `beta/`
- `blog/`
- `css/`
- `data/`
- `digital-experience/`
- `docs/`
- `for-review/`
- `games/`
- `includes/`
- `js/`
- `marketing/`
- `scripts/`
- `somatic-studios/`
- `test-results/`
- `tests/`

**Key files:** `AGENTS.md`, `AikiField homepage accessibility redesign.zip.dvc`, `AikiField.pdf`, `CLAUDE.md`, `END_STATE_REPORT_AIKIFIELD.md`, `LICENSE`, `PortfolioDeepDiveMarketing.md`, `PortfolioTechnicalMarketing.md`, `README.md`, `SITE_CONTENT.md`, `TechnicalMarketingReadMe.md`, `ai-devsecops-vulnerability-remediation.html`, `approach.html`, `assessment.html`, `board-security-clarity.html`
