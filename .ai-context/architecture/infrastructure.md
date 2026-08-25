# Infrastructure Architecture

## Hosting (OBSERVED)

- **Origin:** peec.biz shared hosting (GreenGeeks/cPanel), Chicago
- **Docroot:** `public_html/aikifield/` (prod), `public_html/aikifield.peec.biz/` (staging)
- **SSH:** `peecbiz@peec.biz`, key `~/.ssh/quantumaikido_ed25519`
- **PHP:** 8.0+ required (uses `str_starts_with`, `str_contains`,
  `str_ends_with`, named args, `declare(strict_types=1)`)
- **Apache:** mod_rewrite, mod_headers, mod_authz_host, mod_expires

## CDN — Cloudflare (OBSERVED + DECLARED)

- **Zone:** `aikifield.com` (ID `71a04598ce4a9580faf7c0ee79f6da6c`)
- **Plan:** Free
- **Nameservers:** `ingrid`/`yevgen.ns.cloudflare.com`
- **Edge PoPs:** New Zealand (~30ms TTFB vs ~900ms direct to Chicago)
- **Proxy chain:** browser → Cloudflare edge (NZ) → GreenGeeks origin
  (Chicago) → `coach-proxy.php` → Cloud Run backend

### Origin lock (OBSERVED: `.htaccess:42-72`)

- `mod_authz_host` `Require ip` allow-list for all Cloudflare IPv4/IPv6
  CIDR ranges + localhost
- Fallback: `mod_rewrite` regex for IPv4 only (if mod_authz_host absent)
- IP list mirrored in `includes/cloudflare-ips.php` (PHP) for
  `coach-proxy.php` and `contact-handler.php` IP trust decisions
- Freshness check: `scripts/verify-cloudflare-ips.php` (wired into
  `sync.sh` pre-deploy, warn-only)

### DNS desired state (OBSERVED: `scripts/cloudflare_migrate.py:45-50`)

- Apex `aikifield.com` → A record, proxied
- `www.aikifield.com` → CNAME to apex, proxied (301s to apex)
- `mail.aikifield.com` → A record, NOT proxied (SMTP:25 not in CF port
  list); must be direct A, never CNAME to apex
- SPF must not use `+a`/`+mx` (would authorize Cloudflare's range to
  send as this domain)

### Security headers (OBSERVED: `.htaccess:10-26`)

- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Vary: Accept-Encoding` (pinned to avoid UA-based fragmentation)
- `X-Powered-By` unset (suppresses PHP version leak)

### Caching (OBSERVED: `.htaccess:127-161`)

- HTML: `Cache-Control: public, max-age=3600` (1 hour)
- Static assets (CSS/JS/SVG/fonts/images): `public, max-age=31536000,
  immutable` (1 year)
- PHP pages send their own no-cache headers

## Deploy — sync.sh (OBSERVED)

- **Mechanism:** rsync over SSH to peec.biz
- **Commands:** `dryrun`, `deploy`, `upload`, `download`, `logs`,
  `report`, `help`
- **Remote selection:** `--staging` / `--prod` or bare word
  (`./sync.sh staging deploy`)
- **Pre-deploy gates:**
  1. `php_lint()` — `php -l` on every `.php` file (aborts on error;
     skip with `SKIP_PHP_LINT=1`)
  2. `cloudflare_ip_check()` — `scripts/verify-cloudflare-ips.php`
     (warn-only; skip with `SKIP_CLOUDFLARE_IP_CHECK=1`)
- **Excludes:** `.git/`, `.dvc/`, `.devin/`, `input/`, `logs/`, `.env*`,
  `scripts/`, `data/audit/`, `data/ratelimit/`, `*.md`, `*.py`, `*.sh`,
  `tests/`, `node_modules/`, `coach-config.staging.php` (prod only),
  `SITE_CONTENT.md`, `AGENTS.md`, `.claude/`
- **Staging-specific:** `coach-config.staging.php` deployed to staging
  only (excluded from prod by name in `sync.sh`)

## DVC (OBSERVED)

- Used for large binary assets: `AikiField.pdf`,
  `AikiField homepage accessibility redesign.zip.dvc`
- `.dvcignore` present; `.dvc/config` present
- `dvc pull` / `dvc push` to sync tracked binaries

## Cloudflare management scripts (OBSERVED)

| Script | Purpose |
|--------|---------|
| `scripts/cloudflare_migrate.py` | Converge zone + local config to desired state; dry-run by default, `--apply` to change, `--verify-only` for health check; writes audit JSON to `data/audit/` |
| `scripts/allocate_cloudflare_token.py` | Create/verify least-privilege CF API token; dry-run by default, `--apply` to create |
| `scripts/cloudflare_token_policy.json` | Token policy definition |
| `scripts/generate_cf_ip_allowlist.sh` | Generate IP allowlist from CF published ranges |
| `scripts/verify-cloudflare-ips.php` | Check vendored IP ranges against CF live lists |

## Secrets management (OBSERVED + DECLARED)

| Secret | Location | Gitignored? |
|--------|----------|-------------|
| `COACH_PROXY_SECRET` | `coach-config.local.php` | Yes |
| `TURNSTILE_SITE_KEY` | `coach-config.local.php` | Yes |
| `TURNSTILE_SECRET_KEY` | `coach-config.local.php` | Yes |
| `DASHBOARD_ADMIN_KEY` | `coach-config.local.php` | Yes |
| `CLOUDFLARE_API_TOKEN` | `coach-config.local.php` + `.env.secrets` | Yes (both) |
| `CLOUDFLARE_ZONE_ID` | `coach-config.local.php` | Yes |
| `CFT` (sync.sh) | `.env.secrets` | Yes |

`.env.secrets` is loaded by `sync.sh` for Cloudflare API calls. Never
read, cat, or commit (DECLARED: `AGENTS.md:25-29`).
