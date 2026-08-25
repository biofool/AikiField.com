# Workflow: Deploy

## Entry Point

Operator runs `./sync.sh dryrun` (preview) or `./sync.sh deploy` (push
to production). Use `--staging` or `--prod` to select target.

## Execution Path

### 1. Pre-flight checks (sync.sh)

1. `sync.sh:4-6` — load `.env.secrets` (CLOUDFLARE_API_TOKEN / CFT)
2. `sync.sh:21-58` — set up paths (LOCAL_PATH, REMOTE_HOST,
   REMOTE_USER, REMOTE_PATH, SSH_KEY)
3. `sync.sh:62-97` — build EXCLUDES list (`.git/`, `.dvc/`, `.devin/`,
   `input/`, `logs/`, `.env*`, `scripts/`, `data/audit/`,
   `data/ratelimit/`, `*.md`, `*.py`, `*.sh`, `tests/`, `node_modules/`,
   `coach-config.staging.php` for prod, `SITE_CONTENT.md`, `AGENTS.md`,
   `.claude/`)
4. Parse arguments: command (dryrun/deploy/upload/download/logs/report)
   + remote (staging/prod)

### 2. PHP lint gate (sync.sh:115-140)

1. `php_lint()` runs `php -l` on every `.php` file (excluding vendor/,
   tests/)
2. If any file fails → `exit 1` (deploy aborted)
3. Skip with `SKIP_PHP_LINT=1`

### 3. Cloudflare IP freshness check (sync.sh:150-169)

1. `cloudflare_ip_check()` runs
   `php scripts/verify-cloudflare-ips.php`
2. Warn-only (never aborts deploy)
3. Skip with `SKIP_CLOUDFLARE_IP_CHECK=1`

### 4. Rsync (sync.sh)

1. `do_rsync()` builds rsync command with EXCLUDES + SSH key
2. `dryrun`: `rsync --dry-run -avz` (preview only)
3. `deploy`: `rsync -avz --delete` (push to remote)
4. Staging-specific: `coach-config.staging.php` included (not excluded)
5. Prod-specific: `coach-config.staging.php` excluded by name

### 5. Post-deploy (sync.sh)

1. Optional: Cloudflare cache purge (if `--purge-all` flag)
2. Optional: log download (`./sync.sh logs`)
3. Optional: report generation (`./sync.sh report`)

## Evidence

| Step | File | Lines |
|------|------|-------|
| Secrets loading | `sync.sh` | 4-6 |
| Path setup | `sync.sh` | 21-58 |
| Excludes | `sync.sh` | 62-97 |
| PHP lint | `sync.sh` | 115-140 |
| CF IP check | `sync.sh` | 150-169 |
| Rsync | `sync.sh` | 99-105 |
| Remote selection | `sync.sh` | 142-199 |

## Failure Paths

| Failure | Behavior |
|---------|----------|
| PHP syntax error | `exit 1` — deploy aborted |
| CF IP check fails | Warning only — deploy continues |
| SSH key missing | rsync fails — deploy aborted |
| Network unreachable | rsync fails — deploy aborted |
| `SKIP_PHP_LINT=1` | Lint skipped |
| `SKIP_CLOUDFLARE_IP_CHECK=1` | IP check skipped |

## Change Guidance

**Before modifying:**
1. `sync.sh` is production-sensitive — always `dryrun` before `deploy`
2. If changing EXCLUDES: verify that `coach-config.local.php` is still
   excluded (it's gitignored but sync.sh also excludes `.env*` —
   `coach-config.local.php` is NOT matched by `.env*`; it's deployed
   if present locally. This is intentional — the operator's local
   `coach-config.local.php` needs to reach the server.)
3. If changing remote paths: update `KNOWN_REMOTES` array
4. If adding new pre-deploy checks: follow the `php_lint` pattern
   (function + skip env var)
5. If changing staging behavior: update `docs/STAGING.md`
6. Never deploy `.env.secrets` (excluded by `.env*` pattern)
