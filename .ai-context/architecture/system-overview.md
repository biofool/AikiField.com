# System Overview

## Trust boundaries and data flows

```
┌─────────────┐      ┌─────────────────┐      ┌──────────────────┐
│  Browser     │      │  Cloudflare CDN  │      │  peec.biz origin  │
│  (visitor)   │─────▶│  (edge, NZ PoP)  │─────▶│  (Chicago, Apache)│
└─────────────┘      └─────────────────┘      └────────┬─────────┘
                                                        │
                           ┌────────────────────────────┼────────┐
                           │                            │        │
                    ┌──────▼─────┐           ┌─────────▼──┐  ┌──▼────────┐
                    │ login.php  │           │contact-     │  │dashboard  │
                    │ (blind)    │           │handler.php  │  │.php (blind│
                    └──────┬─────┘           └─────────────┘  │ ?key=)    │
                           │                                  └───────────┘
                    ┌──────▼─────┐
                    │coach-proxy │
                    │  .php      │
                    └──────┬─────┘
                           │ cURL (X-Proxy-Secret)
                           ▼
                    ┌──────────────────────────┐
                    │  AIRichardMoon backend    │
                    │  (Cloud Run, FastAPI)     │
                    │  /v1/auth/* endpoints     │
                    └──────────────────────────┘
```

## Users and external systems

| Actor | Trust level | Access |
|-------|------------|--------|
| Public visitor | Untrusted | All static `.html` pages, `projects.php`, `assessment.html` |
| Authenticated member | Low-trust (PHP session) | `/beta/*.php` (7-day cookie, same-origin) |
| Dashboard operator | Medium-trust (`?key=`) | `dashboard.php` (Cloudflare analytics) |
| Cloudflare edge | Trusted intermediary | Origin lock allows only CF IP ranges |
| AIRichardMoon backend | Trusted (shared secret) | `coach-proxy.php` forwards via cURL |

## Deployable units

| Unit | Technology | Deploy mechanism |
|------|-----------|-----------------|
| Static marketing site | HTML/CSS/JS | `sync.sh` rsync to `public_html/aikifield/` |
| PHP auth/contact layer | PHP 8.0+ | Same rsync (same docroot) |
| Beta assessment SPA | PHP-gated HTML + vanilla JS | Same rsync |
| Ops dashboard | PHP | Same rsync (blind URL) |
| Cloudflare zone config | Python script | `scripts/cloudflare_migrate.py --apply` |
| DVC-tracked binaries | DVC | `dvc push` (separate from rsync) |

## Key architectural decisions (DECLARED in PRD/AGENTS.md)

1. **Blind login page** — `login.php` is not linked from nav; gates `/beta/`
   only. `noindex,nofollow`. (OBSERVED: `<meta name="robots"
   content="noindex,nofollow">` in `login.php:235`)
2. **Same-origin PHP session** — cookie covers whole `aikifield.com`;
   `/beta/` pages read it. No cross-domain SSO needed. (OBSERVED:
   `session_set_cookie_params(['path' => '/'])` in `login.php:128-135`)
3. **Third frontend surface** — same backend user store as
   `quantumaikido.com` and `AIRichardMoon/frontend`; same session
   contract (keys: `qa_email`, `qa_session_token`, `qa_target_env`,
   `qa_is_admin`). (DECLARED: `docs/coach-auth-prd.md`)
4. **Triple-PRD rule** — auth changes must update all three PRDs and
   deploy all repos together. (DECLARED: `AGENTS.md:188-191`)
5. **Cloudflare origin lock** — only CF edge IPs reach origin;
   `includes/cloudflare-ips.php` mirrored in `.htaccess`. (OBSERVED:
   `.htaccess:42-72`, `includes/cloudflare-ips.php`)
6. **Fail open on backend unreachable** — `beta-gate.load.php` does not
   log users out on transient backend failures; backs off retry. (OBSERVED:
   `includes/beta-gate.load.php:106-113`)
7. **No chat on AikiField** — `coach-chat.js` was deleted; live chat lives
   on `quantumaikido.com/members.php`. (DECLARED: `docs/coach-auth-prd.md`)

## Evidence classification

- **OBSERVED**: directly verified in source code (file:line references)
- **INFERRED**: strongly suggested by code structure but not directly
  established at runtime
- **DECLARED**: stated in PRD, AGENTS.md, or code comments
- **UNKNOWN**: insufficient evidence to confirm
