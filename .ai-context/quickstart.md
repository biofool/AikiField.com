# Quickstart — AikiField.com

## System shape

Static HTML/CSS/JS marketing site + thin PHP layer (auth proxy, contact
form, beta gate, ops dashboard). No build step, no framework. Deployed via
`sync.sh` (rsync) to peec.biz shared hosting behind Cloudflare CDN.

## Major entry points

- **Public pages:** `index.html`, `approach.html`, `services.html`,
  `process.html`, `projects.php`, `assessment.html`, `contact.html`,
  `case-studies.html`, `board-security-clarity.html`,
  `fractional-ciso.html`, `fractional-ciso-for-saas.html`,
  `ai-devsecops-vulnerability-remediation.html`
- **Blind auth:** `login.php` → `coach-proxy.php` → AIRichardMoon backend
- **Beta gate:** `includes/beta-gate.load.php` (required by `/beta/*.php`)
- **Ops dashboard:** `dashboard.php` (`?key=` auth, Cloudflare logs)
- **Contact handler:** `contact-handler.php`
- **Config:** `includes/coach-config.load.php` (env→local→staging→prod)

## Architectural boundaries

- **Static marketing** (`.html`, `css/redesign.css`, `js/`) — no auth, no
  server-side logic except `projects.php` (kept as PHP for 301 redirect)
- **Coaching auth** (`login.php`, `coach-proxy.php`, `coach-login.js`,
  `coach-auth.css`, `includes/`) — gates `/beta/` only; same-origin PHP
  session; proxies to Cloud Run backend
- **Beta assessment** (`beta/*.php`, `beta/js/assessment.js`,
  `beta/css/assessment.css`, `beta/data/`) — session-gated SPA, data stays
  in browser (localStorage)
- **Contact form** (`contact.html`, `contact-handler.php`,
  `turnstile-sitekey.php`) — POST handler with rate limiting, Turnstile,
  header injection guards
- **Infra scripts** (`scripts/`, `sync.sh`) — Cloudflare management, i18n,
  deploy; Python + PHP + shell

## Dependency rules

- PHP pages `require` config via `includes/coach-config.load.php` (never
  hardcode backend URL or secrets)
- `coach-config.local.php` is gitignored — holds real secrets
- `coach-config.staging.php` deployed to staging only (excluded from prod
  by `sync.sh`)
- `includes/cloudflare-ips.php` shared by `coach-proxy.php` and
  `contact-handler.php` for IP trust decisions
- `includes/beta-gate.load.php` requires `coach-config.load.php` — same
  session contract as `login.php`

## Coding patterns

- `SITE_CONTENT.md` is canonical for all site copy — update alongside HTML
- Accessibility is first-class (semantic HTML, ARIA, skip links, contrast)
- `noindex,nofollow` on blind pages (`login.php`, `/beta/*.php`,
  `dashboard.php`)
- Error handling: `error_log()` for backend failures; never fail silently
- Config: `define()` constants via loader; never interpolate secrets into
  paths
- i18n: `data/i18n-config.json` + `data/i18n-strings/<locale>.json`;
  only `en` and `es` are live (others are stubs)

## Essential commands

```bash
# Preview locally
python3 -m http.server 8080

# Deploy (ALWAYS dryrun first)
./sync.sh dryrun
./sync.sh deploy
./sync.sh --staging deploy

# E2E tests (Playwright + PHP built-in server + stub backend)
bash tests/e2e/run.sh

# Unit tests
php tests/unit/test-cloudflare-ip-trust.php
python3 tests/unit/test_allocate_cloudflare_token.py

# PHP lint (also runs in sync.sh pre-deploy)
find . -name '*.php' -not -path '*/vendor/*' -not -path '*/tests/*' -exec php -l {} +

# Cloudflare IP freshness check
php scripts/verify-cloudflare-ips.php

# Cloudflare zone convergence (dry-run)
python3 scripts/cloudflare_migrate.py
```

## Highest-risk areas

1. **Cross-repo auth contract** — triple-PRD rule; see
   `workflows/coaching-auth-flow.md`
2. **Cloudflare origin lock** — `.htaccess` + `cloudflare-ips.php` sync
3. **Session revalidation** — fails open on backend unreachable
4. **`sync.sh`** — production-sensitive; dryrun before deploy

## Navigation

`AGENTS.md`/`CLAUDE.md` → this file → `index.md` → domain
`architecture/` → `components/` → `workflows/` →
`change-impact/relationships.yaml` → `conventions/` →
`testing/test-map.yaml` → source code
