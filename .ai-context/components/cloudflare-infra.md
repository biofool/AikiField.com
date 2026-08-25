# Component: Cloudflare Infrastructure

## Responsibility

CDN edge caching, origin lock (IP allow-list), security headers,
Cloudflare API management (zone convergence, token allocation, IP
freshness), and ops dashboard (Cloudflare GraphQL Analytics).

## Files

| File | Role |
|------|------|
| `.htaccess` | Origin lock (CF IP allow-list), security headers, caching, redirects, `/coach-api/*` routing |
| `includes/cloudflare-ips.php` | CF edge IP ranges (IPv4/IPv6) + trust functions (`qa_is_cloudflare_ip`, `qa_resolve_client_ip_headers`, `qa_ip_in_cidr`) |
| `includes/cloudflare-logs.class.php` | `CloudflareLogsScanner` class — GraphQL Analytics API queries |
| `dashboard.php` | Blind ops dashboard; `?key=` auth; HTML/JSON output |
| `scripts/cloudflare_migrate.py` | Converge zone + local config to desired state (dry-run/apply/verify-only) |
| `scripts/allocate_cloudflare_token.py` | Create/verify least-privilege CF API token |
| `scripts/cloudflare_token_policy.json` | Token policy definition |
| `scripts/generate_cf_ip_allowlist.sh` | Generate IP allowlist from CF published ranges |
| `scripts/verify-cloudflare-ips.php` | Check vendored IP ranges against CF live lists |

## Interfaces

### Inbound

- `.htaccess` origin lock: `Require ip` for CF CIDR ranges (all requests)
- `dashboard.php`: `?key=<DASHBOARD_ADMIN_KEY>` or `X-Dashboard-Key`
  header; `?hours=24|48|168`; `?format=json`

### Outbound

- `scripts/cloudflare_migrate.py` → Cloudflare API
  (`api.cloudflare.com/client/v4`)
- `scripts/allocate_cloudflare_token.py` → Cloudflare API
- `dashboard.php` → Cloudflare GraphQL API
  (`api.cloudflare.com/client/v4/graphql`)
- `scripts/verify-cloudflare-ips.php` →
  `www.cloudflare.com/ips-v4` and `/ips-v6`

## Dependencies

- **Config:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`,
  `DASHBOARD_ADMIN_KEY` (all in `coach-config.local.php`, gitignored)
- **External:** Cloudflare API, Cloudflare GraphQL Analytics API
- **Runtime:** Python 3 (scripts), PHP 8.0+ (dashboard, verify script),
  Apache mod_authz_host/mod_rewrite/mod_headers

## Consumers

- `coach-proxy.php` — uses `includes/cloudflare-ips.php` for IP trust
- `contact-handler.php` — uses `includes/cloudflare-ips.php` for client
  IP resolution
- `sync.sh` — calls `scripts/verify-cloudflare-ips.php` as pre-deploy
  check
- `.htaccess` — mirrors IP ranges from `includes/cloudflare-ips.php`

## State/data

- `data/audit/cloudflare-migrate-<timestamp>.json` — convergence audit
- `data/audit/cloudflare-token-*.json` — token allocation audit
- `data/audit/cloudflare-token-dashboard-*.md` — dashboard reports
- All gitignored (regenerated on every run)

## Security considerations

- **Origin lock:** Only CF edge IPs reach origin; prevents bypassing
  WAF/rate-limiting/SSL by hitting origin directly
- **IP trust:** `qa_resolve_client_ip_headers()` only forwards
  client-supplied CF-Connecting-IP/X-Forwarded-For when REMOTE_ADDR is
  genuine CF edge IP; otherwise overwrites with REMOTE_ADDR (fails
  closed)
- **IPv4-mapped-IPv6:** `qa_is_cloudflare_ip()` unwraps `::ffff:` prefix
  for dual-stack servers
- **Token least-privilege:** `allocate_cloudflare_token.py` creates
  zone-scoped tokens from `cloudflare_token_policy.json`
- **Dashboard auth:** `hash_equals()` for timing-safe comparison;
  `noindex,nofollow`; blind URL

## Sync requirement (OBSERVED)

The IP ranges in `.htaccess` (lines 44-67) and
`includes/cloudflare-ips.php` (lines 23-49) must stay in sync. Both are
snapshots from Cloudflare's published lists (snapshot 2026-08-11).
`scripts/verify-cloudflare-ips.php` checks freshness; `sync.sh` runs it
pre-deploy (warn-only).

## Test coverage

- Unit: `tests/unit/test-cloudflare-ip-trust.php` (PHP, standalone —
  tests `qa_is_cloudflare_ip` and `qa_resolve_client_ip_headers` with
  synthetic values)
- Unit: `tests/unit/test_allocate_cloudflare_token.py` (Python, mock-
  based — no live Cloudflare calls)
- E2E cannot cover the "genuine Cloudflare IP" branch (loopback only)
- See `../testing/test-map.yaml`

## Known risks

See `../debt/register.yaml`.
