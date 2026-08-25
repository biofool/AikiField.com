# Component: Contact Form

## Responsibility

Receives POST from `contact.html` form, validates input, sends email via
PHP `mail()`, and redirects back with a status query param. Includes
rate limiting, Turnstile CAPTCHA, header injection guards, and a staging
safety guard.

## Files

| File | Role |
|------|------|
| `contact.html` | Static HTML form; posts to `contact-handler.php`; fetches Turnstile site key via `turnstile-sitekey.php` |
| `contact-handler.php` | POST handler: validation, rate limiting, Turnstile verification, mail(), redirect (~275 lines) |
| `turnstile-sitekey.php` | JSON endpoint exposing `TURNSTILE_SITE_KEY` for static `contact.html` |

## Interfaces

### Inbound (browser → contact-handler.php)

- `POST /contact-handler.php` with form fields: `name`, `email`,
  `organization`, `interest`, `message`, `website` (honeypot),
  `cf-turnstile-response` (optional)
- `GET` → 405 Method Not Allowed

### Inbound (contact.html → turnstile-sitekey.php)

- `GET /turnstile-sitekey.php` → `{"siteKey": "..."}`

### Outbound (contact-handler.php)

- `mail()` to `kenneth@aikifield.com` from `contact@aikifield.com`
  (production only; no-op on staging)
- cURL to `https://challenges.cloudflare.com/turnstile/v0/siteverify`
  (when `TURNSTILE_SECRET_KEY` set)

## Dependencies

- **Code:** `includes/coach-config.load.php` (for Turnstile keys),
  `includes/cloudflare-ips.php` (for client IP trust)
- **Config:** `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`
- **External:** Cloudflare Turnstile API (siteverify)
- **Runtime:** PHP 8.0+ with cURL; `mail()` function

## Consumers

- None — this is a leaf component (user-facing only)

## State/data

- `data/ratelimit/<sha256(ip)>.json` — fixed-window counter per IP
  (5 requests / 600s window)
- PHP `mail()` — sends to `kenneth@aikifield.com`

## Security considerations

- **Header injection:** `strip_header_injection()` removes CR/LF from
  name, organization, interest fields (CWE-93)
- **Rate limiting:** Fixed-window per client IP; 429 + Retry-After on
  excess; fails open if storage unavailable
- **Honeypot:** `website` field — if filled, pretends success (bots
  don't retry)
- **Turnstile:** Server-side verification; fails open when
  `TURNSTILE_SECRET_KEY` unset (same behavior as widget not rendering
  when `TURNSTILE_SITE_KEY` unset)
- **Staging guard:** No-ops on `aikifield.peec.biz` hostname or
  `STAGING=1` env var (logs instead of emailing)
- **Client IP:** `contact_client_ip()` — same Cloudflare IP trust
  logic as `coach-proxy.php`
- **Method restriction:** POST only; 405 otherwise

## Contact page UX rule (DECLARED)

The direct Outlook booking URL must NOT appear as a standalone CTA. It
is only exposed inside `#form-success` / `#form-error` banners that
appear AFTER form submission. The form is the sole primary conversion
path. (DECLARED: `AGENTS.md:193-201`, `CLAUDE.md:89-93`)

## Test coverage

- No dedicated e2e tests for contact form (not in `tests/e2e/specs/`)
- See `../testing/test-map.yaml`

## Known risks

See `../debt/register.yaml`.
