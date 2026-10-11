# AGENTS.md — Global Rules for AI Agents

These rules apply to **every** project cloned from this template. They are
cross-project conventions distilled from the biofool project portfolio.
Project-specific knowledge lives in `.devin/wiki/` — keep this file for rules that should hold everywhere.

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

## Don't trust, verify — adversarial checks before "done"

Post-edit lint hooks run automatically on every edited file
(`.claude/hooks/post_edit_lint.py` for Claude Code, the
`magic-compact-devin` plugin hook for Devin): ruff/py_compile, `php -l`,
`node --check`, `bash -n`/shellcheck, `json.tool`, gofmt, pyyaml. A hook
finding is a defect — fix it. Before reporting done: run the repo's own
gates, review the diff adversarially (callers, edge cases, leftovers,
secrets, silent catches), and name the command that proves the claim.
The `verify-change` skill encodes this gate.

## Automate the annoying stuff

A process explained more than once becomes a hook, a `scripts/` tool, or
a `.devin/skills/<name>/SKILL.md` — not repeated prompt text.

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

## Chat reply style — Simplified Technical English (unless it hurts clarity)

Write all chat replies in **Simplified Technical English (STE)**: short
sentences, active voice, one instruction per sentence, approved and
consistent terminology, no unexplained jargon. If strict STE would create
confusion or ambiguity in a reply, drop the constraint and write whatever
is briefest and clearest — STE serves clarity, not the other way around.
Applies to chat output only — code, commit messages, and documentation
keep their normal style.

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

### Responsive layout / UI regression prevention

Lessons from the Quantum Aikido Books & Resources page right-hand TOC rail
overflow (2026-09) — apply to this static site as well:

1. **Never rely on `overflow-x: hidden` to hide layout bugs.** A global
   `body { overflow-x: hidden; }` silences clipped content by suppressing
   horizontal scrollbars. Only use it for intentional animation overflow,
   and verify with visual review or automated checks that no content is
   rendered outside the viewport.
2. **Keep JS and CSS breakpoints in sync.** When a CSS `@media` breakpoint
   changes, grep for the matching `matchMedia` query in JS and update it.
3. **Audit fixed/absolute elements after layout changes.** Fixed-position
   elements do not expand `scrollWidth`, so `documentElement.scrollWidth`
   checks miss them. During review, use `getBoundingClientRect()` to verify
   their right/left edges stay inside `window.innerWidth`.
4. **Test scaled/zoomed desktop resolutions.** A 27" 2560×1440 monitor at
   125%–150% scaling has an effective viewport of ~1700–2048 px. Preview
   pages at multiple effective widths (including zoomed views) before
   deploy.
5. **Run deploy preview before every deploy.** Use `./sync.sh dryrun` and
   visually inspect the staged site on a wide monitor / zoomed viewport
   after any layout change that touches breakpoints, fixed/absolute
   positioning, or container max-widths.

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

## Project wiki

Project knowledge (architecture, coaching-auth coordination) lives in
`.devin/wiki/` — read `INDEX.md`, load only the page you need.
