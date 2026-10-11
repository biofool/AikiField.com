# Architecture

## Project Overview

AikiField.com is the marketing website for AikiField -- a fractional CISO and
security-leadership consultancy for product companies (Series A-C startups,
SaaS, AI-powered product teams). The site presents services, approach,
engagement process, sponsored projects, a self-assessment tool, and a
contact/inquiry flow. It is a static multi-page HTML/CSS/JS site with no
build step and no framework.

## Project-specific

**AikiField.com** is the marketing website for AikiField, a fractional CISO
and security-leadership consultancy serving product companies (Series A-C
startups, SaaS, AI-powered product teams). The site is a static multi-page
HTML/CSS/JS site -- no build step, no framework. Pages: `index.html` (home),
`approach.html`, `services.html`, `process.html`, `projects.php`,
`assessment.html`, `contact.html`. Styles live in `css/`, scripts in `js/`.
Note: `projects.html` 301-redirects to `projects.php` via `.htaccess`.
`projects.php` is kept as `.php` for that redirect and because the `/beta/`
pages link to it; it is a fully public marketing page (no auth).

`SITE_CONTENT.md` is the source of truth for all site copy -- update it
alongside the HTML when text changes. `sync.sh` handles deploy/dry-run
(`./sync.sh dryrun`, `./sync.sh deploy`). Use `--staging` or `--prod` to
select the target explicitly: `./sync.sh --staging deploy`,
`./sync.sh --prod dryrun`. Staging deploys run `scripts/ci-local.sh`
(php-lint + unit + Playwright e2e against a detached HEAD worktree) in
parallel and gate on it before exiting — skip with `--skip-ci`, override
steps via `CI_LOCAL_ARGS`. Large binary assets (e.g.
`AikiField.pdf`, redesign zips) are tracked via DVC, not git directly
(remote `r2` → Cloudflare R2 `s3://biofool-dvc/aikifield`; keys in
gitignored `.dvc/config.local`). The
`input/` directory holds source materials and is gitignored.

### Contact page — direct booking is post-submit only

The direct Outlook booking URL (`outlook.office.com/bookwithme/...`) must
NOT appear as a standalone CTA on the contact page. It is only exposed
inside the success and error banners that appear AFTER the contact form
is submitted (`#form-success` / `#form-error`). The form is the sole
primary conversion path; direct booking is a follow-up option, not a
competing CTA. Do not add a "Book a Discovery Call" button to the main
page layout, hero, or left column — keep it hidden until form submission.

## Environment

- **Shell:** bash on Linux (Ubuntu).
- **Deploy:** `./sync.sh dryrun` (preview), `./sync.sh deploy` (push to
  production). Treat `sync.sh` as production-sensitive -- always dry-run first.
  Use `--staging` or `--prod` to select a target explicitly:
  `./sync.sh --staging dryrun`, `./sync.sh --prod deploy`.
- **DVC:** used for large binary assets (`AikiField.pdf`, redesign zips).
  `dvc pull` / `dvc push` to sync tracked binaries. Remote `r2` is
  Cloudflare R2 (`s3://biofool-dvc/aikifield`); keys in gitignored
  `.dvc/config.local`.
- **Git:** remote is `https://github.com/biofool/AikiField.com.git`, branch
  `main`.

## Architecture

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
  pages under `/digital-experience/` (hub + one page per experience, issue
  #71). The experiences themselves are gated PHP behind
  `includes/beta-gate.load.php`: `games/lucky-wave/*.php`,
  `for-review/games/verbal-aikido/index.php`, `games/exercises/index.php`, and
  `/members`. Submenu behaviour: `js/nav-menu.js` + `.af-nav__group` rules
  in `css/redesign.css`.
- **Games AI help:** `games/ai-coach.php` (+ `games/ai-coach.json`
  vocabulary) — members-only "Ask the AI Chat" button in Lucky Wave V1/V2
  and Verbal Aikido; composes the message server-side and calls the AI Chat
  (`/v1/chat-secure`) as the signed-in member. No API keys in the games.
  Lucky Wave stores each round (+ AI answer) in `localStorage`
  `waveLuck_results` (last 30, shared by V1/V2), reopens it after sign-in,
  and for signed-in players syncs it to their AI Chat account via
  `games/results.php` → AI Chat backend `POST /v1/game-results/sync`
  (Firestore). Deploy the backend first; until then sync falls back to
  browser-only storage.
- **Content source of truth:** `SITE_CONTENT.md` -- update this alongside HTML
  when any site copy changes.
- **Binary assets:** `AikiField.pdf` and redesign zips are DVC-tracked
  (`.dvc` files committed, binaries in Cloudflare R2 remote).
- **Source materials:** `input/` (gitignored).
- **Deploy script:** `sync.sh` (production-sensitive -- supports dry-run).
