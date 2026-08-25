# Frontend Architecture

## Static marketing pages (OBSERVED)

| Page | File | Notes |
|------|------|-------|
| Home | `index.html` | Hero, proof metrics, why AikiField |
| Process | `process.html` | Four agreements, six phases |
| Approach | `approach.html` | Three principles |
| Services | `services.html` | Fractional CISO, DevSecOps, etc. |
| Projects | `projects.php` | Public marketing; `.php` for 301 redirect; invitation card |
| Assessment | `assessment.html` | Public self-assessment (not the beta one) |
| Contact | `contact.html` | Form posts to `contact-handler.php`; Turnstile widget |
| Case studies | `case-studies.html` | |
| Board security | `board-security-clarity.html` | |
| Fractional CISO | `fractional-ciso.html` | |
| Fractional CISO SaaS | `fractional-ciso-for-saas.html` | |
| DevSecOps | `ai-devsecops-vulnerability-remediation.html` | |

## Stylesheets (OBSERVED)

- `css/redesign.css` (~1509 lines) — main stylesheet, accessibility-focused
  redesign; `af-*` class namespace
- `coach-auth.css` (~1492 lines) — login form styling; loaded only by
  `login.php`; `coach-*` class namespace
- `beta/css/assessment.css` — scoped dark theme; `bta-*` / `--bta-*`
  namespace

## JavaScript (OBSERVED)

- `js/carousel.js` — carousel component for marketing pages
- `js/locale-utils.js` (~507 lines) — `AFLocale` global; Intl API wrappers;
  locale detection/persistence; RTL support
- `js/language-selector.js` (~96 lines) — `<select>`-based language
  switcher; depends on `locale-utils.js`
- `coach-login.js` (~523 lines) — login/register/reset/confirm JS; loaded
  only by `login.php`; posts to `login.php` for session establishment
- `beta/js/assessment.js` (~767 lines) — scoring, localStorage, SVG radar,
  cross-view, scenario rendering

## i18n system (OBSERVED)

- Config: `data/i18n-config.json` — `supportedLocales: ["en", "es"]` (only
  these are live; others are stubs)
- String files: `data/i18n-strings/{en,es,fr,de,pt,ja,zh,ko,ar,he,fa,hi}.json`
  — 1116 lines each (844 keys)
- RTL locales: `ar`, `he`, `fa` (applied via `[dir]` attribute)
- Scripts: `scripts/extract_i18n_strings.py`, `scripts/translate-strings.py`,
  `scripts/generate_locale_files.py`, `scripts/apply_i18n_attrs.py`
- SVG assets: `assets/i18n/<locale>/{aichat-flow,projects-overview,studio-finder-flow}.svg`

## Beta assessment SPA (OBSERVED)

- Entry: `beta/index.php` (requires `beta-gate.load.php`)
- Hub: `beta/assessment.php` — explains both assessments, shows completion
  state, unlocks cross-view
- Sub-pages: `beta/assessment-organisation.php` (5 categories × 4 questions),
  `beta/assessment-leadership.php` (7 dimensions × 4 questions + 4 scenarios),
  `beta/assessment-crossview.php` (unlocks when both complete)
- Data delivery: `beta/data.php` (session-gated JSON; `beta/data/.htaccess`
  denies direct access to raw JSON)
- Data files: `beta/data/{questions,crossview,scenarios,practices}.json`
- All scoring is client-side (localStorage); nothing transmitted to server

## Accessibility (DECLARED + OBSERVED)

- Skip links (`af-skip-link`), ARIA labels, semantic HTML5
- `coach-login.js` uses `aria-live` regions for status announcements
- Language selector is native `<select>` for keyboard navigation
- Color contrast was an explicit redesign goal (DECLARED: `CLAUDE.md:76-77`)
