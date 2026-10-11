# Security — AikiField.com

2026-10 security audit: XSS escaping in `js/books.js`, workflow action pins + `persist-credentials: false`, re-vendored `cloud_management_client` 0.15.2 (scheme check, env-parse hardening, spool traversal guard). Auth-gate note added to `docs/coach-auth-prd.md` (#377).

## Standing rules
- Never commit secrets (`.env`, `*.key`, `credentials*.json` are gitignored).
- Never read or log secret values — key names and lengths only.
- Security fixes land reviewed-but-uncommitted first, then roll dev → main.
