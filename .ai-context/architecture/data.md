# Data Architecture

## Overview

AikiField.com has no database. All persistent data is in static JSON files
or server-side files (rate-limit counters, audit logs). The beta
assessment SPA stores all user data in browser localStorage — nothing is
transmitted to the server.

## Data stores

### Beta assessment data (OBSERVED)

| File | Content | Access |
|------|---------|--------|
| `beta/data/questions.json` | 48 questions (20 org + 28 leadership) | Via `beta/data.php?f=questions.json` (session-gated) |
| `beta/data/crossview.json` | Axis definitions + 24 interpretations + fallback | Via `beta/data.php?f=crossview.json` |
| `beta/data/scenarios.json` | 4 pressure scenarios + tendency readings | Via `beta/data.php?f=scenarios.json` |
| `beta/data/practices.json` | 30-day practices keyed by group id | Via `beta/data.php?f=practices.json` |

- `beta/data/.htaccess` denies all direct access (`Require all denied`)
- `beta/data.php` re-checks session before serving; allow-list of
  filenames (`in_array($file, $allowed, true)`)

### i18n data (OBSERVED)

| File | Content |
|------|---------|
| `data/i18n-config.json` | Locale config: supportedLocales (`en`,`es`), localeNames, rtlLocales, currency, timezone |
| `data/i18n-strings/<locale>.json` | 844 translation keys per locale (12 locales) |
| `data/i18n-glossary.json` | Translation glossary |
| `data/translations/es.json` | Spanish translations (separate from i18n-strings?) |

- Only `en` and `es` are live (`supportedLocales` in config)
- Other locales (`fr`,`de`,`pt`,`ja`,`zh`,`ko`,`ar`,`he`,`fa`,`hi`) are
  stubs — offering them would silently serve English
- RTL: `ar`, `he`, `fa` get `dir="rtl"` on `<html>`

### Rate-limit counters (OBSERVED)

- `data/ratelimit/<sha256(ip)>.json` — fixed-window counter per IP
- Created by `contact-handler.php` (`contact_rate_limited()`)
- Gitignored (regenerated on every run)
- Format: `{"windowStart": <unix>, "count": <int>}`

### Audit records (OBSERVED)

- `data/audit/cloudflare-migrate-<timestamp>.json` — convergence audit
- `data/audit/cloudflare-token-*.json` — token allocation audit
- `data/audit/cloudflare-token-dashboard-*.md` — dashboard reports
- Gitignored (regenerated on every run)

### PHP session data (INFERRED)

- Standard PHP session files on peec.biz (shared hosting default)
- Session keys: `qa_email`, `qa_session_token`, `qa_target_env`,
  `qa_is_admin`, `qa_session_checked_at`, `qa_session_check_failed_at`
- Cookie: `PHPSESSID` (default), 7-day lifetime, HttpOnly, Secure on
  HTTPS, SameSite=Lax, path=/

### DVC-tracked binaries (OBSERVED)

- `AikiField.pdf` — PDF brochure
- `AikiField homepage accessibility redesign.zip.dvc` — DVC pointer file

## Data lifecycle

| Data | Created by | Lifetime | Cleanup |
|------|-----------|----------|---------|
| Rate-limit counters | `contact-handler.php` | 600s window | Not actively cleaned (gitignored) |
| Audit JSON | `cloudflare_migrate.py`, `allocate_cloudflare_token.py` | Per-run | Not actively cleaned (gitignored) |
| PHP session | `login.php` | 7 days (cookie) | PHP GC (shared hosting default) |
| localStorage (beta) | `beta/js/assessment.js` | Browser-controlled | User clears browser data |
| i18n strings | `scripts/translate-strings.py` | Permanent (versioned) | Manual |
| DVC binaries | `dvc push` | Permanent | `dvc gc` (manual) |

## No database migrations

There is no database and therefore no migration system. Schema changes
to JSON data files (beta assessment, i18n) are manual edits to the
committed files.
