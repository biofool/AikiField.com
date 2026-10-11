# AikiField.com — Security Leadership and Aikido-Based Coaching

The marketing website for AikiField, a practice that combines fractional CISO
and security-leadership services with aikido-based leadership coaching. The
site serves product companies and somatic movement studios, offering service
information, a self-assessment, free digital support for studios, practice
games, and a gated AI coaching experience.

It is a static multi-page HTML/CSS/JS site with lightweight PHP includes and
form handlers. There is no build step and no frontend framework.

## Overview

- **Home** (`index.html`) — Hero with value proposition, audience gateway,
  coach biography, and how the coaching works.
- **Services** (`services.html`) — Fractional CISO, security program buildout,
  AI-assisted DevSecOps, threat modeling, and leadership coaching.
- **Process** (`process.html`) — Four agreements and six phases that guide
  every engagement.
- **Approach** (`approach.html`) — Three principles: inspired presence,
  decisive collaboration, and energy mastery.
- **Case Studies** (`case-studies.html`) — Past client work and outcomes.
- **Assessment** (`assessment.html`) — Security maturity and leadership
  presence self-assessment with scoring guidance.
- **Free Services For Studios** (`somatic-studios/index.html`) — Free digital
  support for yoga, aikido, tai chi, dance, and movement studios, including a
  studio visibility review and World Studio Finder listing.
- **Demonstration Technologies** (`projects.php`) — Public marketing page for
  sponsored projects and beta experiences.
- **Digital Experience** (`digital-experience/index.html`) — Public previews of
  members-only games and the Unified Field AI chat.
- **Games** (`games/index.html`) — Free practice exercises and upcoming games.
- **Contact** (`contact.html`) — Inquiry form and direct contact information.

## Prerequisites

- A web browser (for viewing)
- `python3` (for optional local static server)
- `rsync` and SSH access to `peec.biz` (for deployment)
- DVC (for pulling large binary assets such as PDFs)
- `php` (to run PHP linting and local form/auth tests)

## Setup

```bash
# Clone the repository
git clone https://github.com/biofool/AikiField.com.git
cd AikiField.com

# Pull DVC-tracked large files (AikiField.pdf, redesign zips)
dvc pull
```

No build step is required. Copy `coach-config.local.php` from the template if
you need local auth or Turnstile testing; it is gitignored and not required to
view static pages.

## How to run locally

### Static preview

```bash
# Open the home page directly
open index.html

# Or run a local static server
python3 -m http.server 8080
# Visit http://localhost:8080
```

### PHP pages and forms locally

PHP pages such as `login.php`, `members.php`, `projects.php`, and form
handlers need a PHP server to render:

```bash
php -S 0.0.0.0:8080
```

For end-to-end tests, use the test router in `tests/e2e/router.php` and the
stub backend in `tests/e2e/stub-backend.php`. See `tests/e2e/run.sh`.

## Deployment

Deployments are handled by `sync.sh`, which rsyncs the site to `peec.biz` and
optionally purges the Cloudflare edge cache. Production and staging are
separate docroots and may require different branches.

```bash
# Preview what would change (dry run)
./sync.sh dryrun

# Deploy to production
./sync.sh deploy

# Deploy to staging from the staging branch
./sync.sh --staging deploy

# Deploy to both staging and production in sequence
./sync.sh deploy-all
```

Production docroot: `public_html/aikifield.peec.biz/` (serves `aikifield.com`).
Staging docroot: `public_html/aikifield-staging/` (serves `aikifield.peec.biz`
and `staging.peec.biz`).

`sync.sh` runs a PHP syntax check before deploying. Always dry-run first — the
script is production-sensitive and can purge Cloudflare cache.

## Common commands

```bash
# Run PHP syntax check manually
find . -name '*.php' -not -path '*/vendor/*' -not -path '*/tests/*' -exec php -l {} \;

# Run the end-to-end test suite
bash tests/e2e/run.sh

# Verify Cloudflare IP range list
php scripts/verify-cloudflare-ips.php

# Pull or push DVC assets
dvc pull
dvc push
```

## Project structure

```
AikiField.com/
├── index.html              # Home page
├── services.html           # Service offerings
├── process.html            # Engagement process
├── approach.html           # Approach and principles
├── case-studies.html       # Client case studies
├── assessment.html         # Self-assessment tool
├── contact.html            # Contact / inquiry form
├── projects.php            # Demonstration Technologies (public marketing)
├── login.php               # Blind login page for /beta/ and /members gating
├── members.php             # Gated AI coaching chat
├── somatic-studios/        # Free digital support for movement studios
├── digital-experience/     # Public previews of gated experiences
├── games/                  # Free practice exercises and game hub
├── beta/                   # Gated assessment pages
├── for-review/             # Gated review area
├── css/                    # Stylesheets
├── js/                     # Shared JavaScript
├── includes/               # PHP includes (auth gate, config loader, Cloudflare IPs)
├── data/                   # JSON data, i18n glossary, audit logs, ratelimit store
├── scripts/                # Deployment helpers and fix scripts
├── tests/                  # Unit and end-to-end tests
├── sync.sh                 # Deployment script
├── SITE_CONTENT.md         # Source of truth for site text
├── AikiField.pdf           # PDF brochure (DVC-tracked)
├── AGENTS.md               # Cross-project agent rules
└── CLAUDE.md               # AI agent guidance
```

## Important caveats

- **Coaching pages are intentionally unlinked.** `login.php`, `members.php`,
  and `/beta/` pages are "blind" — they are not in the public navigation and
  are reached only via direct links, welcome emails, or invitation codes.
  Do not add links to them in the duplicated page navigation or public pages
  without explicit approval.
- **Auth changes are triple-PRD.** Changes to login, registration, sessions,
  invitations, or the coaching proxy must update the PRDs and code in
  `quantumaikido.com`, `AIRichardMoon`, and this repo, and be deployed together.
- **Secrets stay local.** `coach-config.local.php` holds secrets such as the
  proxy secret, Turnstile keys, and dashboard credentials. It is gitignored and
  must never be committed.
- **Cloudflare origin lock.** `.htaccess` only allows HTTP(S) requests from
  Cloudflare edge IPs. Direct origin access is blocked. Update
  `includes/cloudflare-ips.php` and `.htaccess` together when Cloudflare
  publishes new IP ranges.
- **Staging guard.** `contact-handler.php` and `studio-review-handler.php`
  detect staging hostnames and redirect mail so test forms do not reach the
  live inbox.
- **No framework or build step.** All HTML, CSS, and JavaScript are written
  by hand. Keep JavaScript and CSS breakpoints in sync when making responsive
  changes.

## Tech stack

- **Frontend:** Hand-authored HTML5, CSS3, vanilla JavaScript
- **Fonts:** Google Fonts (Source Serif 4, Public Sans)
- **Accessibility:** Skip links, ARIA labels, semantic HTML
- **Backend integration:** PHP includes and proxy (`coach-proxy.php`) to the
  Quantum Aikido backend on Cloud Run
- **Hosting:** Shared host (`peec.biz`) via rsync, fronted by Cloudflare
- **Data versioning:** DVC for large binary assets
- **Testing:** Playwright end-to-end tests, PHP unit tests, Python unit tests
