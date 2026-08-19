<!-- AI coding config version: 2026-07-25 — sourced from biofool/starter template.
     Shared settings across all biofool projects; see ~/.codeium/windsurf/memories/shared_template_config.md -->

# AGENTS.md — Global Rules for AI Agents

These rules apply to **every** project cloned from this template. They are
cross-project conventions distilled from the biofool project portfolio.
Project-specific guidance belongs in `CLAUDE.md` (or a project-specific
`AGENTS.md` section) — keep this file for rules that should hold everywhere.

Devin reads `AGENTS.md` as its native rules file. Claude Code reads
`CLAUDE.md`; the `Global conventions` section of `CLAUDE.md` mirrors the
non-negotiable items below so both agents stay in sync.

## Validation requests — do not change code

When the user asks to validate or check a conclusion, do NOT start changing
code or making edits. Investigate, verify the conclusion against the actual
state of the codebase/data, and report findings only. If the conclusion is
clearly invalid, state that and wait for instructions. Only make code changes
when the user explicitly asks for a fix or implementation.

## Never read secrets files

NEVER read, cat, print, or otherwise access `.env`, `.env.secrets`,
`.env.local`, `*.key`, `credentials*.json`, `service-account*.json`, or any
file containing API keys, tokens, or passwords. If you need a credential
value to complete a task, ask the user to provide it directly or set it as an
environment variable. Do not attempt to discover secrets by reading files.

## Never commit or log secrets

Never commit credentials, private keys, tokens, or customer-identifying data
to git. Never log secrets to files, stdout, or dashboards. Treat scripts that
touch infrastructure (SSH, Cloudflare, hypervisors, mail, credential stores)
as potentially production-impacting; prefer dry-run flags and documented env
vars. The root `.gitignore` already excludes `.env`, `*.key`, `*.pem`,
`credentials.json`, and `cookies.txt` — keep those entries when editing
`.gitignore`.

## API cost comparisons — be accurate and specific

When comparing API costs between providers or pricing tiers:

1. **Verify pricing from official sources** — do not quote API pricing from
   memory. Look up the current pricing page for each provider (Google Maps
   Platform, OpenCage, Brave, etc.) or cite the source document (e.g., issue
   body, PRD) the figures come from. Pricing changes frequently.
2. **Distinguish per-call vs. subscription vs. tiered pricing** — never
   compare a per-call rate directly against a flat monthly fee without
   computing the break-even volume. Always state the break-even point
   explicitly.
3. **Separate marginal cost from total cost** — "$0" is only accurate for
   marginal cost within a quota. A $40/month subscription is a real cost even
   if individual calls are "free." Always label which you mean.
4. **Account for free tiers and credits** — Google's $200/month free credit,
   OpenCage's 2,500/day free tier, etc. must be factored in. State whether
   the quoted cost is within or beyond the free tier.
5. **Double-check arithmetic** — verify all multiplications, divisions, and
   break-even calculations before stating them. E.g., "$5/1K calls × 1,921
   calls = $9.61" should be confirmed: 1.921 × $5 = $9.605, rounded to $9.61.
   If the issue body states a figure, verify it rather than repeating it
   uncritically.
6. **State all assumptions** — volume per run, runs per month, which API is
   being replaced, whether caching reduces call count, etc. A cost comparison
   without stated assumptions is misleading.

## Never fail silently

Every exception, auth failure, or unavailable dependency must be logged at
WARNING or ERROR level with a specific message. Silent `pass` or bare
`except: return` blocks are forbidden. If a subsystem degrades gracefully
(e.g. an optional sync is disabled), log *why* it was disabled and surface
the status to the UI, dashboard, or log file.

## No backslash line continuations in shell commands shown to the user

Write commands on a single line — backslash continuations break copy-paste.
Long `gcloud`/`terraform`/`gsutil`/`kubectl` commands stay on one line
regardless of length.

## One-off fix scripts (workflow convention)

When building repair/fix scripts for data quality or operational issues:

1. **Store scripts in `scripts/fix/`** — one-off scripts are OK until they
   work, then integrate into the pipeline.
2. **Do NOT run inline code for repairs** — write a script file, test it,
   iterate on the file.
3. **Always support `--dry-run`** — show what would change before modifying
   the database or external system.
4. **Write results to `data/audit/`** (or `audit/`) — JSON output with
   per-record details for an audit trail.
5. **Support `--limit` and `--offset`** for testing on subsets before full
   runs.

## Prefer stored data files over hardcoding

NEVER hardcode arrays or lookup tables with more than 15 items directly in
source files. Prefer reading from a JSON/YAML/TOML data file (version-
controlled, optionally DVC-tracked) whenever possible, even for smaller
lists. This includes country maps, category definitions, keyword lists,
search terms, alias tables, and any other structured data. If the data
doesn't yet exist as a file, create one and read from it rather than
embedding the values in code. This keeps data maintainable and editable
without code changes.

## Executive summaries (for multi-project repos)

If the repository is a monorepo of independent sub-projects, every top-level
sub-project `README.md` should include a non-technical executive summary
between `<!-- exec-summary: begin -->` and `<!-- exec-summary: end -->`
markers. Write for business/leadership audiences: what the project does and
why it matters, without implementation detail. Update it when purpose,
scope, or audience-facing impact changes.

## Cross-repo coordination (when applicable)

Some projects span two repos with a shared flow (e.g. the Quantum Aikido
coaching system: `quantumaikido.com` frontend + `AIRichardMoon` backend). If
this project is part of such a pair, document the sister repo here and the
coordination rule (e.g. "auth changes MUST update both PRDs and deploy both
repos together"). Mismatched frontend/backend versions break the flow. See
`~/projects/quantumaikido.com/AGENTS.md` and
`~/projects/AIRichardMoon/AGENTS.md` for the canonical example.

## Skills

This template ships Brave Search skills in `.devin/skills/` (web-search,
news-search, images-search, videos-search, suggest, spellcheck, local-pois,
local-descriptions, llm-context, answers, bx, search). They require a
`BRAVE_SEARCH_API_KEY` environment variable to make live calls. See
`.devin/skills/web-search/SKILL.md` for setup.

## Project-specific

**AikiField.com** is the marketing website for AikiField, a fractional CISO
and security-leadership consultancy serving product companies (Series A-C
startups, SaaS, AI-powered product teams). The site is a static multi-page
HTML/CSS/JS site -- no build step, no framework. Pages: `index.html` (home),
`approach.html`, `services.html`, `process.html`, `projects.php`,
`assessment.html`, `contact.html`. Styles live in `css/`, scripts in `js/`.
Note: `projects.html` 301-redirects to `projects.php` via `.htaccess`.
`projects.php` is kept as `.php` for that redirect and because the `/beta/`
pages link to it; it is a fully public marketing page (no auth).

`SITE_CONTENT.md` is the source of truth for all site copy -- update it
alongside the HTML when text changes. `sync.sh` handles deploy/dry-run
(`./sync.sh dryrun`, `./sync.sh deploy`). Large binary assets (e.g.
`AikiField.pdf`, redesign zips) are tracked via DVC, not git directly. The
`input/` directory holds source materials and is gitignored.

### Coaching auth (shared flow — triple-PRD rule)

The coaching login authenticates against the Quantum Aikido coaching
backend (`AIRichardMoon`, FastAPI on Cloud Run) via `coach-proxy.php`. The
auth surface is a **blind `/login.php`** page that exists solely to gate
the pre-release `/beta/` assessment pages. It is NOT linked from the public
nav. `projects.php` no longer hosts any login or chat — it shows an
invitation card pointing visitors to `contact.html` to request a live demo.
The inline AI Chat (`coach-chat.js`) was removed; the live chat lives on
`quantumaikido.com/members.php`.

AikiField.com remains a **third frontend surface** for the shared coaching
auth flow (same backend user store, same session contract), alongside
`quantumaikido.com` and `AIRichardMoon/frontend` — but the surface is
now minimal (beta gating only), not a public chat.

Files: `login.php` (blind login + PHP session POST handlers + `?next=`
redirect), `coach-proxy.php`, `coach-login.js` (loaded by `login.php`),
`coach-auth.css`, `includes/coach-config.load.php`,
`coach-config.php` (non-secret template), `coach-config.local.php`
(gitignored — holds `COACH_PROXY_SECRET` / `TURNSTILE_SITE_KEY`), `.htaccess`
(`/coach-api/*` → proxy; `projects.html` → `projects.php` 301;
`/beta/*.html` → `/beta/*.php` 301s), `includes/beta-gate.load.php`
(redirects unauthed `/beta/` requests to `/login.php?next=…`). Full design:
`docs/coach-auth-prd.md`.

**Sister repos:**
- `~/projects/quantumaikido.com` — canonical PHP frontend (`login.php`,
  `members.php`, `coach-proxy.php`, `coach-login.js`, `coach-chat.js`,
  `coach-auth.css`). PRD: `docs/coach-dashboard-prd.md`.
- `~/projects/AIRichardMoon` — backend (FastAPI auth + chat, Cloud Run). PRD:
  `backend/PRD.md`.

**Triple-PRD rule:** any change to the login/registration/auth/session/
invitation/proxy flow MUST update all three PRDs
(`docs/coach-auth-prd.md` here, `docs/coach-dashboard-prd.md` in QA,
`backend/PRD.md` in AIRichardMoon) and deploy all affected repos together.

### Contact page — direct booking is post-submit only

The direct Outlook booking URL (`outlook.office.com/bookwithme/...`) must
NOT appear as a standalone CTA on the contact page. It is only exposed
inside the success and error banners that appear AFTER the contact form
is submitted (`#form-success` / `#form-error`). The form is the sole
primary conversion path; direct booking is a follow-up option, not a
competing CTA. Do not add a "Book a Discovery Call" button to the main
page layout, hero, or left column — keep it hidden until form submission.

### Cloud strategy — CloudManagement coordination

**CloudManagement** (`biofool/CloudManagement`, formerly `biofool/CloudBilling`) is the
canonical source for cloud strategy across all biofool repos. When this repo
changes where data is stored, where jobs run, adds/removes cloud resources, or
changes its cloud provider/region/project, it MUST update:
1. The CloudManagement inventory (`config/accounts.yaml` or Firestore)
2. The CloudManagement PRD (`docs/PRD.md`) if the job-placement policy changes
3. The `biofool/starter` template's cloud-strategy section

This repo has no paid APIs (static HTML on peec.biz shared hosting), so the
coordination rule rarely applies — but if a cloud resource is ever added
(e.g. CDN, R2 bucket), update CloudManagement.

**Cloudflare CDN (issue #25 — live):** `aikifield.com` is served through a
Cloudflare Free plan zone (`71a04598ce4a9580faf7c0ee79f6da6c`, nameservers
`ingrid`/`yevgen.ns.cloudflare.com`), giving edge caching at Cloudflare's NZ
PoPs. TTFB from NZ is ~30ms, down from ~900ms direct to Chicago. The proxy
chain: browser → Cloudflare edge (NZ) → greengeeks origin (Chicago) →
coach-proxy.php → Cloud Run backend.

Zone and local config are converged by `scripts/cloudflare_migrate.py`
(dry-run by default, `--apply` to change, `--verify-only` for a health
check). Declare desired state there rather than clicking in the dashboard,
or the next run reports drift.

**Cloudflare proxies only its HTTP(S) port list** (80/8080/8880/2052/2082/
2086/2095, 443/2053/2083/2087/2096/8443). Anything else must be DNS-only:
`mail` (SMTP:25 — proxying it stops inbound mail), `ftp` (21) and `webdisk`
(2077/2078). `mail` must be a direct A record, never a CNAME to the apex —
a CNAME inherits the apex's proxied IPs. SPF must not use `+a`/`+mx` for the
same reason: post-migration both resolve to Cloudflare's edge and would
authorize their entire range to send as this domain.
