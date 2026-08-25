# Workflow: Contact Form

## Entry Point

User fills out the form on `contact.html` and clicks submit. Browser
POSTs to `contact-handler.php`.

## Execution Path

### 1. Form render (contact.html)

1. `contact.html` loads static HTML
2. Inline JS fetches `/turnstile-sitekey.php` → `{siteKey: "..."}`
3. If `siteKey` is non-empty, renders Cloudflare Turnstile widget
4. Form fields: `name`, `email`, `organization`, `interest`, `message`,
   `website` (honeypot, hidden from users)

### 2. POST handling (contact-handler.php)

1. `contact-handler.php:24` requires `includes/coach-config.load.php`
   (for Turnstile keys)
2. `contact-handler.php:30` requires `includes/cloudflare-ips.php`
   (for client IP trust)
3. `contact-handler.php:62-63` — staging guard: checks hostname or
   `STAGING=1` env var
4. `contact-handler.php:66-70` — method check: POST only, 405 otherwise
5. `contact-handler.php:90-93` — `strip_header_injection()` on name,
   organization, interest (removes CR/LF — CWE-93)
6. `contact-handler.php:95-99` — trim email, message

### 3. Rate limiting

1. `contact-handler.php:106-139` — `contact_rate_limited()`:
   - Keys on `contact_client_ip()` (Cloudflare-aware)
   - Fixed-window: 5 requests / 600s per IP
   - Counter: `data/ratelimit/<sha256(ip)>.json`
   - File lock (`flock(LOCK_EX)`) for concurrency safety
   - Fails open if storage unavailable
2. `contact-handler.php:141-154` — if rate limited:
   - 429 + `Retry-After: 600`
   - HTML error page with link back to `contact.html`

### 4. Honeypot check

1. `contact-handler.php:157-161` — if `website` field is non-empty:
   - Pretend success (redirect with `?status=success`)
   - Bots don't know it failed; real users never see this field

### 5. Turnstile verification

1. `contact-handler.php:171-179` — `contact_verify_turnstile()`:
   - If `TURNSTILE_SECRET_KEY` unset → fail open (return true)
   - If token empty → return false
   - cURL to `challenges.cloudflare.com/turnstile/v0/siteverify`
2. If verification fails → redirect with `?status=error`

### 6. Email sending

1. `contact-handler.php` builds email with sanitized fields
2. On staging: logs `STAGING contact-handler: no-op, would have
   emailed ...` instead of calling `mail()`
3. On production: `mail($RECIPIENT_EMAIL, subject, body, headers)`
   - Recipient: `kenneth@aikifield.com`
   - From: `contact@aikifield.com`
4. On success: redirect to `contact.html?status=success`
5. On failure: redirect to `contact.html?status=error&msg=...`

### 7. Post-submit UX (contact.html)

1. `contact.html` reads `?status=` query param
2. Success: shows `#form-success` banner (includes Outlook booking URL
   as follow-up option)
3. Error: shows `#form-error` banner (also includes booking URL)
4. **Booking URL is post-submit only** — never a standalone CTA
   (DECLARED: `AGENTS.md:193-201`)

## Evidence

| Step | File | Lines |
|------|------|-------|
| Form render | `contact.html` | (static) |
| Turnstile sitekey | `turnstile-sitekey.php` | 1-25 |
| POST handling | `contact-handler.php` | 1-275 |
| Rate limiting | `contact-handler.php` | 106-154 |
| Honeypot | `contact-handler.php` | 157-161 |
| Turnstile verify | `contact-handler.php` | 171-179 |
| Staging guard | `contact-handler.php` | 62-63 |
| Client IP | `contact-handler.php` | 43-53 |
| Header injection | `contact-handler.php` | 90-93 |

## Failure Paths

| Failure | Behavior |
|---------|----------|
| Method not GET | 405 + `Allow: POST` |
| Rate limited | 429 + `Retry-After: 600` + HTML error page |
| Honeypot filled | Redirect with `?status=success` (silent bot trap) |
| Turnstile fail | Redirect with `?status=error` |
| Turnstile unconfigured | Fail open (no verification) |
| `mail()` failure | Redirect with `?status=error&msg=...` |
| Staging | No-op (logs, no email sent) |
| Storage unavailable | Rate limiter fails open |

## Change Guidance

**Before modifying:**
1. Check `change-impact/relationships.yaml`
2. If changing Turnstile config: affects `login.php` too (shared
   `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`)
3. If changing rate-limit logic: test with `data/ratelimit/` cleared
4. If changing email recipient/sender: update `$RECIPIENT_EMAIL` /
   `$FROM_EMAIL` constants
5. If changing staging detection: update `docs/STAGING.md`
6. **Never** add the Outlook booking URL as a standalone CTA ( violates
   the post-submit-only rule)
7. Run `php -l contact-handler.php`
8. No e2e tests exist for the contact form — manual testing required
