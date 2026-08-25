# Component: Static Marketing

## Responsibility

Public-facing marketing pages for AikiField (fractional CISO /
security-leadership consultancy). Hand-authored HTML5/CSS3/vanilla JS.
No build step, no framework, no server-side logic (except `projects.php`
which is PHP for 301 redirect compatibility).

## Files

| File | Role |
|------|------|
| `index.html` | Home — hero, proof metrics, why AikiField (~41K) |
| `approach.html` | Three principles (~15K) |
| `services.html` | Fractional CISO, DevSecOps, threat modeling, coaching (~25K) |
| `process.html` | Four agreements, six phases (~16K) |
| `projects.php` | Sponsored projects; public; invitation card (~46K) |
| `assessment.html` | Public self-assessment (not the beta one) (~23K) |
| `contact.html` | Inquiry form; Turnstile widget; post-submit booking CTA (~16K) |
| `case-studies.html` | Case studies (~15K) |
| `board-security-clarity.html` | Board security clarity (~37K) |
| `fractional-ciso.html` | Fractional CISO detail (~28K) |
| `fractional-ciso-for-saas.html` | Fractional CISO for SaaS (~24K) |
| `ai-devsecops-vulnerability-remediation.html` | DevSecOps remediation (~33K) |
| `css/redesign.css` | Main stylesheet, `af-*` namespace (~1509 lines) |
| `js/carousel.js` | Carousel component |
| `SITE_CONTENT.md` | Source of truth for all site copy (~1118 lines) |
| `robots.txt` | Robots directives |
| `sitemap.xml` | Sitemap |
| `favicon.svg` | Favicon |

## Interfaces

- All pages are static HTML served by Apache
- `projects.php` is PHP but outputs static HTML (no POST handling)
- `contact.html` posts to `contact-handler.php` (separate component)

## Dependencies

- **Runtime:** Apache (static file serving); PHP (for `projects.php`)
- **CDN:** Cloudflare edge caching (1h for HTML, 1yr for assets)
- **Fonts:** Google Fonts (Source Serif 4, Public Sans)

## Consumers

- Public visitors (no auth required)
- Search engines (except blind pages)

## Conventions (DECLARED + OBSERVED)

- **`SITE_CONTENT.md` is canonical for copy** — update alongside HTML
  when text changes (DECLARED: `CLAUDE.md:73-74`)
- **Accessibility first-class** — semantic HTML, ARIA, skip links,
  color contrast, keyboard navigation (DECLARED: `CLAUDE.md:76-77`)
- **`af-*` CSS namespace** — `redesign.css` uses `af-*` class prefix
- **`bta-*` CSS namespace** — beta assessment uses `bta-*` prefix
- **`projects.html` → `projects.php` 301** — `.htaccess` redirect
  (OBSERVED: `.htaccess:117`)
- **Contact page booking CTA** — Outlook booking URL is post-submit
  only, never a standalone CTA (DECLARED: `AGENTS.md:193-201`)

## Redirects (OBSERVED: `.htaccess`)

- `projects.html` → `projects.php` (301)
- `beta/assessment.html` → `beta/assessment.php` (301)
- `beta/assessment-organisation.html` → `beta/assessment-organisation.php` (301)
- `beta/assessment-leadership.html` → `beta/assessment-leadership.php` (301)
- `beta/assessment-crossview.html` → `beta/assessment-crossview.php` (301)
- `www.aikifield.com` → `aikifield.com` (301)
- `http://` → `https://` (301)

## Test coverage

- E2E: `tests/e2e/specs/homepage.spec.js` — smoke tests for homepage
  (200, title, brand, nav, footer)
- See `../testing/test-map.yaml`

## Known risks

See `../debt/register.yaml`.
