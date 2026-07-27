# AikiField.com — Security Leadership for Product Companies

The marketing website for AikiField, a fractional CISO and security-leadership
consultancy for product companies (Series A–C startups, SaaS, AI-powered
product teams). The site presents services, approach, engagement process,
sponsored projects, a self-assessment tool, and a contact/inquiry flow. It is
a static multi-page HTML/CSS/JS site with no build step and no framework.

## Overview

- **Home** — Hero with value proposition, proof metrics, and "Why AikiField"
  panel.
- **Process** — Four agreements and six phases that guide every engagement.
- **Approach** — Security engineering and leadership development integrated,
  with three principles (inspired presence, decisive collaboration, energy
  mastery).
- **Services** — Fractional CISO, security program buildout, DevSecOps /
  vulnerability backlog clearance, threat modeling, and leadership coaching.
- **Sponsored Projects** — AI coaching backend (Quantum Aikido) and world
  studio discovery pipeline (WorldStudioFinder).
- **Assessment** — Security maturity and leadership presence self-assessment
  with scoring guidance.
- **Contact** — Inquiry form and direct contact information.

## Prerequisites

- A web browser (for viewing)
- `python3` (for optional local static server)
- `rsync` and SSH access to peec.biz (for deployment)
- DVC (for pulling large binary assets like PDFs)

## Setup

```bash
# Clone the repository
git clone https://github.com/biofool/AikiField.com.git
cd AikiField.com

# Pull DVC-tracked large files (AikiField.pdf, redesign zips)
dvc pull
```

No build step, no dependencies to install. The site is hand-authored static
HTML/CSS/JS.

## How to Run

### Local preview

```bash
# Open index.html directly in a browser
open index.html

# Or run a local static server
python3 -m http.server 8080
# Visit http://localhost:8080
```

### Deploy to production

```bash
# Preview what will change (dry run)
./sync.sh dryrun

# Deploy to peec.biz
./sync.sh deploy
```

Deployment syncs the site to `public_html/aikifield/` on peec.biz via rsync.
Always dry-run first — `sync.sh` is production-sensitive.

### DVC sync

```bash
dvc pull   # fetch large binary assets
dvc push   # upload updated large binary assets
```

## Project Structure

```
AikiField.com/
├── index.html          # Home page
├── process.html        # Engagement process
├── approach.html       # Approach and principles
├── services.html       # Service offerings
├── projects.html       # Sponsored projects
├── assessment.html     # Self-assessment tool
├── contact.html        # Contact / inquiry form
├── css/
│   ├── redesign.css    # Main stylesheet (accessibility-focused redesign)
│   └── style.css       # Legacy stylesheet
├── js/
│   ├── main.js         # Shared JS
│   └── carousel.js     # Carousel component
├── input/              # Source content (WordPress export, markdown articles)
│   ├── markdown/       # Markdown source articles
│   └── wp-content/     # WordPress export (plugins, themes, cache)
├── sync.sh             # Deployment script (rsync to peec.biz)
├── SITE_CONTENT.md     # Source of truth for all text content
├── AikiField.pdf       # PDF brochure (DVC-tracked)
├── CLAUDE.md           # AI agent guidance
└── AGENTS.md           # Cross-project agent rules
```

## Pages

| Page | Description |
|------|-------------|
| `index.html` | Home — hero, proof metrics, why AikiField panel |
| `process.html` | Four agreements + six engagement phases |
| `approach.html` | Three principles: inspired presence, decisive collaboration, energy mastery |
| `services.html` | Fractional CISO, program buildout, DevSecOps, threat modeling, coaching |
| `projects.html` | Sponsored projects: Quantum Aikido AI coaching, World Studio Finder |
| `assessment.html` | Security maturity + leadership presence self-assessment |
| `contact.html` | Inquiry form (mailto) + direct contact info |

## Tech Stack

- **Frontend:** Hand-authored HTML5, CSS3, vanilla JavaScript
- **Fonts:** Google Fonts (Source Serif 4, Public Sans)
- **Accessibility:** Skip links, ARIA labels, semantic HTML
- **Hosting:** Shared host (peec.biz) via rsync
- **Data versioning:** DVC for large binary assets (PDFs, redesign zips)
- **No build step, no framework, no dependencies**
