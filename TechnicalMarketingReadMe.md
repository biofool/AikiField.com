# Technical Marketing Summary — AikiField.com

## One-Line Positioning

A marketing website for a fractional CISO and security-leadership consultancy
that helps product companies build security programs — and the leadership
capacity to sustain them.

## Target Users / Personas

- **Startup founders / executives (Series A–C)** — Leaders who need
  executive-level security guidance without a full-time CISO hire, to win
  enterprise deals and pass security reviews.
- **SaaS / AI-powered product teams** — Engineering teams that need a
  security program right-sized to their risk, with AI-assisted DevSecOps and
  threat modeling integrated into their development workflow.
- **Security leaders under pressure** — CISOs and security managers who want
  coaching on confident decision-making under pressure, blending security
  engineering with presence-based leadership development.
- **Prospective clients exploring services** — Visitors evaluating whether
  AikiField's engagement model fits their needs, via the self-assessment tool
  and service descriptions.

## Key Features (Grounded in Code)

- **Service offerings** — Five engagement types: Fractional CISO, security
  program buildout, DevSecOps / vulnerability backlog clearance, threat
  modeling, and leadership coaching. Each with "what you get" and "best for"
  descriptions (`services.html`).
- **Engagement process** — Four agreements (leadership, management,
  development, inquiry) and six phases from connecting to handoff, providing
  a clear path from diagnosis to sustained program (`process.html`).
- **Three-principle approach** — Inspired presence, decisive collaboration,
  and energy mastery as the leadership qualities cultivated in every
  engagement. Shift from reactive security to proactive leadership
  (`approach.html`).
- **Proof metrics** — Real engagement results displayed on the home page:
  $5M blocked sales channel recovered, 87% customer-reported risk eliminated
  in three meetings, 21→3 day vulnerability remediation (`index.html`).
- **Self-assessment tool** — Two-part assessment: security maturity (five
  categories) and leadership presence (seven dimensions), with scoring
  guidance and a five-step practice design framework (`assessment.html`).
- **Sponsored projects showcase** — Describes the AI coaching backend
  (Quantum Aikido / AIRichardMoon) and the world studio discovery pipeline
  (WorldStudioFinder), connecting the consultancy's phronesis philosophy to
  real engineering projects (`projects.html`).
- **Inquiry form** — Contact form with organization details and needs
  assessment, plus direct email and phone contact (`contact.html`).
- **Accessibility-first design** — Skip links, ARIA labels, semantic HTML,
  keyboard navigation, and color-contrast considerations throughout
  (`css/redesign.css`, all pages).
- **Content source of truth** — `SITE_CONTENT.md` maintains all site copy as
  a single source of truth, kept in sync with the HTML pages.

## Technical Differentiators

- **No framework, no build step** — Hand-authored HTML5/CSS3/vanilla JS.
  Zero dependencies, zero npm install, zero transpilation. The site loads
  fast and can be deployed on any static host.
- **Accessibility as architecture** — The redesign was explicitly an
  accessibility overhaul. Skip links, ARIA labels, semantic HTML, and
  keyboard navigation are structural, not bolted on.
- **Content-code separation** — `SITE_CONTENT.md` serves as the canonical
  source for all text, ensuring copy changes are tracked and reviewable
  independently of HTML structure.
- **DVC for binary assets** — Large files (PDFs, redesign zips) are
  DVC-tracked, keeping the git repo lightweight while versioning binaries.
- **Dual-environment deploy** — `sync.sh` supports dry-run preview before
  production deploy, treating deployment as production-sensitive.

## Use Cases

- **Enterprise deal enablement** — A SaaS startup facing enterprise security
  requirements engages AikiField for fractional CISO services to clear
  security objections and close deals.
- **Security program buildout** — A company that has outgrown ad-hoc security
  engages AikiField to build a right-sized program with roadmap, owners, and
  review cadence.
- **Leadership coaching** — A security leader under pressure receives
  coaching on presence-based decision-making, blending martial-arts
  principles with security leadership.
- **Self-diagnosis** — A prospective client completes the self-assessment to
  understand their security maturity and leadership gaps before engaging.

## Benefits / Value Proposition

- **Executive security without the full-time hire** — Fractional CISO
  services provide 20+ years of CISO experience at a fraction of the cost.
- **80/20 security** — Focus on the 20% of work that delivers 80% of
  results, avoiding enterprise-sized budgets for non-enterprise companies.
- **Security + leadership integrated** — Unlike pure security consultancies,
  AikiField develops the leadership capacity to sustain the program after
  the engagement ends.
- **Proven results** — Real metrics ($5M recovered, 87% risk eliminated, 7x
  faster remediation) demonstrate measurable impact.
- **Fast, accessible website** — No framework overhead means the site loads
  instantly and is accessible to all users, including those with
  disabilities.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Hand-authored HTML5, CSS3, vanilla JavaScript |
| Fonts | Google Fonts (Source Serif 4, Public Sans) |
| Accessibility | ARIA labels, skip links, semantic HTML, keyboard nav |
| Hosting | Shared host (peec.biz) via rsync |
| Binary versioning | DVC (PDFs, redesign zips) |
| Content management | `SITE_CONTENT.md` (source of truth for copy) |
| Deploy | `sync.sh` (rsync with dry-run support) |

## Known Limitations

- **Static site only** — No server-side processing, no forms backend, no
  database. The contact form uses `mailto:`, which requires the user's
  email client.
- **No CMS** — Content updates require editing HTML and `SITE_CONTENT.md`
  manually. No WordPress, no headless CMS.
- **No analytics** — No tracking, analytics, or CRM integration in the
  codebase.
- **Manual deployment** — `sync.sh` deploys via rsync; no CI/CD pipeline.
- **Shared hosting** — Production runs on peec.biz shared hosting, limiting
  performance and server-side capabilities.
- **No test suite** — Changes are validated by visual review and
  accessibility checks only.
