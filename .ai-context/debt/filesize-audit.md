# File-size audit — `dev` branch

**Audit date:** 2026-10-14 (branch `dev`)
**Rule source:** `.ai-context/conventions/index.md` → "File size & responsibility"
**Threshold:** >400 lines = review trigger (soft, not a law)

Source files over 400 lines: **44**
Exclusions applied: `.ai-context/`, `vendor/`, `node_modules/`, generated
assets (images/fonts/pdf/zip), and `manifest.yaml`-style data files.

## Vendored / pinned — flagged separately (do NOT refactor)

| File | Lines | Note |
|------|------:|------|
| `scripts/cloud_management_client/__init__.py` | 2012 | Vendored `cloud_management_client` package. Oversized, but it mirrors the upstream package — refactor upstream in CloudManagement, not here. |
| `for-review/qa-styles.css` | 6325 | PINNED SNAPSHOT of quantumaikido.com styles.css @58a8004 (issue #346). Header says "do not edit — update by re-copying." Size is intentional. |

## Audit table (remaining 42 files)

Priority: **high** = multiple responsibilities + frequent AI edits + high
breakage risk. **med** = oversized but mostly one responsibility, or
edit-risk contained. **low** = content/monolithic by nature; splitting
buys little.

| File | Lines | Responsibilities | AI-edit risk | Priority | Suggested split |
|------|------:|------------------|--------------|----------|-----------------|
| `blog/styles.css` | 6339 | Base layout + per-page sections for every page | High — one file all pages share; a bad selector edit restyles the whole site | **high** | Split per page group: `blog/css/base.css`, `article.css`, `index.css`, etc. Keep section-delimited single file only if deploy constraints forbid extra requests. |
| `for-review/games/verbal-aikido/game.js` | 2210 | Scene render, choices, meter, outcomes, persistence | High — game engine with 5+ concerns in one IIFE | **high** | `engine.js` (scene render), `choices.js`, `meter.js`, `persistence.js`, `content-loader.js`. |
| `coach-chat.js` | 2100 | Chat UI, session handling, fetch/timeout resilience, handoff rooms, clear-conversation | High — replicated from QA copy; edits must stay in sync with `quantumaikido.com/coach-chat.js` (see header) | **high** | Sync with QA first. Then `chat-ui.js`, `chat-api.js` (fetchWithTimeout/httpErrorMessage), `session.js`. Alternatively keep single file and treat QA as source of truth — flag in header. |
| `css/coach-chat.css` | 2025 | Chat layout + message styles + responsive + themes | Med | med | Split `chat-layout.css` / `chat-messages.css` / `chat-responsive.css`. |
| `coach-auth.css` | 1873 | Login form, coach chrome, shared auth styles | Med | med | Split `login.css` vs `auth-chrome.css`. |
| `css/redesign.css` | 1707 | Site-wide redesign overrides | Med — override layer, unclear scope | med | Audit which rules are still needed; split per page or fold into base styles. |
| `games/lucky-wave/RideTheLuckyWaveV1-legacy.php` | 1312 | Legacy game page (markup + logic) | Med — "legacy" suffix; low change frequency | low | Leave; delete when V2 fully replaces it. |
| `coach-login.js` | 1297 | Login, registration, email confirm, password reset, Google OAuth, forgot-password | High — 6 auth flows in one file; must stay in sync with QA | **high** | `login.js`, `register.js`, `reset.js`, `oauth.js`; share a small `auth-common.js`. |
| `games/lucky-wave/RideTheLuckyWaveV2.php` | 1136 | Game page markup + JS + gate | Med | med | Extract inline JS to `game.js`, styles to `game.css`; keep PHP as thin gate/entry. |
| `blog/endorsers-business.html` | 1040 | Single article page | Low — content | low | None — content pages are monolithic by nature. |
| `blog/osensei_mindmap.html` | 963 | Mindmap page (markup + embedded data/viz) | Med — embedded data likely large | low | Extract mindmap data to `blog/data/osensei-mindmap.json`. |
| `scripts/cloudflare_migrate.py` | 934 | Zone converger: reads state, applies delta, verifies; many record types | Med — ops-critical, dry-run by default | med | Split per concern: `zone_records.py`, `page_rules.py`, `verify.py` behind a thin CLI `__main__`. |
| `sync.sh` | 873 | Deploy: rsync staging/prod, secrets load, CF calls, arg parsing | High — deploy path; a bad edit ships the site | med | Extract functions to `scripts/sync/lib-*.sh` sourced by thin `sync.sh`; or port to Python. |
| `for-review/games/verbal-aikido/game.css` | 857 | Game styles | Low | low | None needed now; split with game.js if refactored. |
| `for-review/games.html` | 843 | Games review index page | Low | low | None. |
| `includes/ask-lib.php` | 836 | AEO corpus load, validate, render; two corpora share one pipeline | Med — shared library, ported from QA | med | `ask-load.php`, `ask-validate.php`, `ask-render.php`. |
| `beta/js/assessment.js` | 767 | Drives all four /beta/ assessment pages; fetch, scoring, radar viz, localStorage | High — session-gated engine, 4+ concerns | **high** | `assessment-data.js` (fetch via data.php), `scoring.js`, `radar.js`, `storage.js`. |
| `blog/index.html` | 750 | Blog index page | Low | low | None. |
| `scripts/allocate_cloudflare_token.py` | 733 | CF token provisioning | Med — credential-touching script | med | Split permission-map data to JSON; keep logic thin. |
| `login.php` | 637 | Login page: markup + session post + redirect logic | Med | med | Extract markup partial; keep PHP controller thin. |
| `blog/music-events.html` | 633 | Article | Low | low | None. |
| `projects.php` | 602 | Public marketing page (was auth host; now invitation card only) | Med | med | Extract reusable card markup to `includes/`. |
| `beta/css/assessment.css` | 565 | Assessment styles | Low | low | None. |
| `js/locale-utils.js` | 559 | i18n locale detection/strings/selector | Med | med | Split `locale-detect.js`, `locale-strings.js`, `locale-selector.js`. Also duplicated at `blog/js/locale-utils.js` (530) — deduplicate. |
| `blog/js/locale-utils.js` | 530 | Duplicate of above | Med | med | Single-source `js/locale-utils.js`; serve one copy. |
| `css/books.css` | 497 | Books page styles | Low | low | None. |
| `scripts/extract_i18n_strings.py` | 465 | i18n string extractor | Low | low | None. |
| `blog/*.html` (18 article pages, 410–633 lines) | 410–633 | One article each | Low — content | low | None — monolithic content pages are fine. |
| `board-security-clarity.html` | 413 | Marketing page | Low | low | None. |
| `books.html` | 440 | Books page | Low | low | None. |

## Top 5 refactor priorities

1. **`coach-chat.js` (2100)** — sync-bound replica of QA copy + 5 concerns. Highest AI-edit risk: silent drift vs `quantumaikido.com/coach-chat.js`.
2. **`coach-login.js` (1297)** — six auth flows in one file; auth changes are highest-blast-radius edits in this repo.
3. **`beta/js/assessment.js` (767)** — four pages share one engine; fetch/scoring/viz/storage tangled.
4. **`blog/styles.css` (6339)** — single stylesheet all blog pages share; widest restyle blast radius per edit.
5. **`for-review/games/verbal-aikido/game.js` (2210)** — largest source file; engine + UI + persistence in one IIFE.

## Notes

- CSS and HTML content pages dominate the raw count but are mostly
  single-responsibility; they score low because splitting buys little.
- The QA-replica files (`coach-chat.js`, `coach-login.js`,
  `includes/ask-lib.php`, `dashboard.php` pattern) carry a sync cost —
  the cheapest "refactor" is deduplication policy, not line-count splits.
- `js/locale-utils.js` and `blog/js/locale-utils.js` are near-duplicates
  (559 vs 530 lines) — deduplicate before either grows further.
