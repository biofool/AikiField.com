<!-- AI coding config version: 2026-07-25 — sourced from biofool/starter template.
     Shared settings across all biofool projects; see ~/.codeium/windsurf/memories/shared_template_config.md -->

# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project Overview

AikiField.com is the marketing website for AikiField -- a fractional CISO and
security-leadership consultancy for product companies (Series A-C startups,
SaaS, AI-powered product teams). The site presents services, approach,
engagement process, sponsored projects, a self-assessment tool, and a
contact/inquiry flow. It is a static multi-page HTML/CSS/JS site with no
build step and no framework.

## Environment

- **Shell:** bash on Linux (Ubuntu).
- **Deploy:** `./sync.sh dryrun` (preview), `./sync.sh deploy` (push to
  production). Treat `sync.sh` as production-sensitive -- always dry-run first.
  Use `--staging` or `--prod` to select a target explicitly:
  `./sync.sh --staging dryrun`, `./sync.sh --prod deploy`.
- **DVC:** used for large binary assets (`AikiField.pdf`, redesign zips).
  `dvc pull` / `dvc push` to sync tracked binaries.
- **Git:** remote is `https://github.com/biofool/AikiField.com.git`, branch
  `main`.

## Commands

- **Preview locally:** open `index.html` in a browser, or run a static server
  (e.g. `python3 -m http.server`).
- **Deploy:** `./sync.sh dryrun` then `./sync.sh deploy` (default prod). Use
  `--staging` or `--prod` to select the target explicitly.
- **DVC sync:** `dvc pull` / `dvc push`.
- **Git:** standard `git add` / `git commit` / `git push` on `main`.

No test suite, linter, or build pipeline -- this is a hand-authored static
site. Validate changes by visual review and accessibility checks.

## Architecture

- **Pages (root):** `index.html`, `approach.html`, `services.html`,
  `process.html`, `projects.php`, `assessment.html`, `contact.html`.
  (`projects.html` 301-redirects to `projects.php` via `.htaccess`.
  `projects.php` is a fully public marketing page — no auth, no chat — kept
  as `.php` for the redirect and because `/beta/` pages link to it.)
- **Styles:** `css/` (e.g. `css/redesign.css`) + `coach-auth.css` (login
  form, loaded only by `login.php`).
- **Scripts:** `js/` + `coach-login.js` (login/register/reset/confirm,
  loaded only by `login.php`).
- **Coaching auth (PHP, beta-gating only):** `login.php` (blind standalone
  login page — gates `/beta/` only, not linked from nav; PHP session POST
  handlers + `?next=` redirect), `coach-proxy.php`
  (`/coach-api/*` → AIRichardMoon backend), `coach-login.js`,
  `includes/coach-config.load.php`, `coach-config.php` (non-secret
  template), `coach-config.local.php` (gitignored — `COACH_PROXY_SECRET` /
  `TURNSTILE_SITE_KEY`), `includes/beta-gate.load.php` (redirects unauthed
  `/beta/` requests to `/login.php?next=…`), `.htaccess`.
  See `docs/coach-auth-prd.md`. Note: `projects.php` no longer hosts any
  login or chat — it shows an invitation card instead. The inline
  `coach-chat.js` was removed; the live chat lives on
  `quantumaikido.com/members.php`.
- **Content source of truth:** `SITE_CONTENT.md` -- update this alongside HTML
  when any site copy changes.
- **Binary assets:** `AikiField.pdf` and redesign zips are DVC-tracked
  (`.dvc` files committed, binaries in DVC remote).
- **Source materials:** `input/` (gitignored).
- **Deploy script:** `sync.sh` (production-sensitive -- supports dry-run).

## Conventions

- **SITE_CONTENT.md is canonical for copy.** When editing page text, update
  both the HTML and `SITE_CONTENT.md` so they stay in sync.
- **Accessibility is a first-class concern.** The redesign was explicitly an
  accessibility overhaul -- preserve semantic HTML, ARIA, color-contrast, and
  keyboard-navigation improvements.
- **DVC for large files.** Never commit large binaries directly to git; use
  DVC (`.dvc` file + `dvc push`).
- **`input/` is gitignored** -- it holds working/source materials only.
- **`sync.sh` is production-sensitive.** Always run `dryrun` before `deploy`.
- **Coaching auth = shared flow (triple-PRD rule).** The blind `login.php`
  authenticates against the AIRichardMoon backend (same as
  quantumaikido.com) and gates the `/beta/` pages. `projects.php` is public
  and shows an invitation card. Changes to login/registration/auth/session/
  invitation flow MUST update all three PRDs (`docs/coach-auth-prd.md` here,
  `docs/coach-dashboard-prd.md` in QA, `backend/PRD.md` in AIRichardMoon) and
  deploy all affected repos together. Never commit `coach-config.local.php`.
- **Contact page: direct booking is post-submit only.** The Outlook booking
  URL must NOT appear as a standalone CTA on the contact page. It is only
  exposed inside the success/error banners after the form is submitted. The
  form is the sole primary conversion path; direct booking is a follow-up
  option, not a competing CTA.

## Global conventions (apply to every project)

The canonical home for cross-project rules is `AGENTS.md` (read by Devin).
The items below are mirrored here so Claude Code applies them too. If you
edit one, edit both.

- **Validation requests -- do not change code.** When asked to validate or
  check a conclusion, investigate and report only. Do not start editing code
  unless the user explicitly asks for a fix or implementation.
- **Never read secrets files.** Do not read, cat, or print `.env`,
  `.env.secrets`, `*.key`, `credentials*.json`, `service-account*.json`, or
  any file containing API keys, tokens, or passwords. Ask the user to
  provide credentials directly or via environment variables.
- **Never commit or log secrets.** Keep `.gitignore` entries for `.env`,
  `*.key`, `*.pem`, `credentials.json`, `cookies.txt`. Treat
  infrastructure-touching scripts as production-sensitive; prefer dry-run
  flags.
- **API cost comparisons -- be accurate and specific.** Verify pricing from
  official sources, distinguish per-call vs. subscription vs. tiered, compute
  break-even volume, separate marginal from total cost, account for free
  tiers, double-check arithmetic, state all assumptions.
- **Never fail silently.** Every exception or unavailable dependency must be
  logged at WARNING or ERROR with a specific message. No bare
  `except: pass` / `except: return`.
- **No backslash line continuations in shell commands shown to the user.**
  Long `gcloud`/`terraform`/`gsutil`/`kubectl` commands stay on one line.
- **One-off fix scripts** go in `scripts/fix/`, support `--dry-run`, write
  audit JSON to `data/audit/` (or `audit/`), and support `--limit`/`--offset`.
- **Prefer stored data files over hardcoding.** Never hardcode arrays or
  lookup tables with more than 15 items in source -- read from a
  version-controlled JSON/YAML/TOML file instead.
- **Cross-repo coordination.** If this project is part of a paired repo
  system (e.g. frontend + backend with a shared auth flow), document the
  sister repo in `AGENTS.md` and require both PRDs + both repos to be
  updated and deployed together for shared-flow changes.

See `AGENTS.md` for the full text of each rule.
