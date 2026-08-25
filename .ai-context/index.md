# AikiField.com — AI Context Index

**Repository revision:** `f8b3b868273b42006194d56005765316d68548d8`
**Last verified:** 2026-08-22
**Analyzer:** Context Compiler v2 (Prompt C)

> If this revision differs from `git rev-parse HEAD`, run an incremental
> refresh — see `manifest.yaml` and `deltas/latest.yaml`.

## What this repo is

AikiField.com is the marketing website for AikiField, a fractional-CISO and
security-leadership consultancy. Static multi-page HTML/CSS/JS site with no
build step, no framework. A thin PHP layer provides: (1) a blind `/login.php`
that gates pre-release `/beta/` assessment pages by authenticating against
the Quantum Aikido coaching backend (AIRichardMoon, FastAPI on Cloud Run),
and (2) a contact form handler. Deployed via `sync.sh` (rsync to peec.biz
shared hosting) behind Cloudflare CDN.

## Navigation map

| Domain | Start here | Covers |
|--------|-----------|--------|
| **Architecture** | `architecture/index.md` → `architecture/system-overview.md` | System context, deployable units, data flows |
| **Coaching auth** | `workflows/coaching-auth-flow.md` | Login → proxy → backend → session → beta-gate |
| **Contact form** | `workflows/contact-form.md` | POST → validation → rate-limit → Turnstile → mail |
| **Beta assessment** | `components/beta-assessment.md` | Session-gated SPA, localStorage scoring, radar viz |
| **Cloudflare/infra** | `components/cloudflare-infra.md` | CDN, origin lock, IP trust, dashboard, migrate script |
| **i18n** | `components/i18n.md` | Locale config, string files, selector, RTL |
| **Conventions** | `conventions/index.md` | Coding patterns, config, errors, persistence |
| **Change impact** | `change-impact/relationships.yaml` | Component deps, dependents, pre-change risks |
| **Tests** | `testing/test-map.yaml` | E2e (Playwright), unit (PHP/Python), validation |
| **Debt/risks** | `debt/register.yaml` | Known issues, architectural risks, evidence gaps |
| **Unknowns** | `unknowns/register.yaml` | Unresolved questions + cheapest verification |

## Key entry points (OBSERVED)

- **Public pages:** `index.html`, `approach.html`, `services.html`,
  `process.html`, `projects.php`, `assessment.html`, `contact.html`,
  `case-studies.html`, `board-security-clarity.html`,
  `fractional-ciso.html`, `fractional-ciso-for-saas.html`,
  `ai-devsecops-vulnerability-remediation.html`
- **Blind auth:** `login.php` (gates `/beta/` only, not in nav,
  `noindex,nofollow`)
- **API proxy:** `coach-proxy.php` (`.htaccess` routes `/coach-api/*` → here)
- **Beta gate:** `includes/beta-gate.load.php` (required by all `/beta/*.php`)
- **Ops dashboard:** `dashboard.php` (blind, `?key=` auth, Cloudflare logs)
- **Contact handler:** `contact-handler.php` (POST from `contact.html`)
- **Config loader:** `includes/coach-config.load.php` (precedence:
  env → local → staging → production)
- **Deploy:** `sync.sh` (rsync to peec.biz; `dryrun` / `deploy`;
  `--staging` / `--prod`)

## Critical cross-repo coordination (DECLARED)

This repo is the **third frontend surface** of a shared coaching auth flow
spanning three repos. Any change to login/registration/auth/session/
invitation/proxy MUST update all three PRDs and deploy all affected repos
together:

1. `docs/coach-auth-prd.md` (this repo)
2. `~/projects/quantumaikido.com/docs/coach-dashboard-prd.md`
3. `~/projects/AIRichardMoon/backend/PRD.md`

See `AGENTS.md` and `decisions/architecture-decisions.md`.

## Highest-risk areas

1. **Coaching auth flow** — cross-repo contract; mismatched versions break
   login. See `workflows/coaching-auth-flow.md`.
2. **Cloudflare origin lock** — `.htaccess` IP allowlist +
   `includes/cloudflare-ips.php` must stay in sync; stale list degrades
   rate-limiting accuracy.
3. **Session revalidation** — `beta-gate.load.php` fails open on backend
   unreachable (intentional); 6h revalidation cadence vs QA's per-request.
4. **Contact form** — rate limiting, Turnstile, header injection, staging
   guard. See `workflows/contact-form.md`.
5. **`sync.sh`** — production-sensitive; always `dryrun` before `deploy`.

## Size & shape

- ~607 files (excluding `input/`, `node_modules/`, `.git/`)
- ~12.4K LOC of application code (PHP/JS/CSS/HTML, excluding `input/`)
- 26 PHP files, 17 HTML pages, 12 CSS, 79 JS (most in `node_modules/`)
- No build step, no framework, no package manager for the site itself
- DVC for large binaries (`AikiField.pdf`); `input/` is gitignored
