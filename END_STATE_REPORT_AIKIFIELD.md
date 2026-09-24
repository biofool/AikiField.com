# END_STATE_REPORT_AIKIFIELD.md — /games/ deployment package

Ticket: https://github.com/biofool/AikiField.com/issues/58
Source package: `/home/kkron/aikifield_games_deploy_ready.zip` (unpacked to `/tmp/aikifield-games/`, corrected in-repo)
Verification date: local — Apache 2.4 (real `.htaccess` processing) + PHP 8 built-in server + Playwright Chromium.

## Defects found in the supplied package and fixed

| # | Defect | Fix |
|---|--------|-----|
| 1 | `?studio_id=` parsed but never rendered | `selectStudioBySlug()` maps slug → studio and renders the personalization banner |
| 2 | Locked exercises rendered full content | `renderPlayer()` guard + `.ex-chip` click → `showLockedModal()` with exact paywall copy |
| 3 | KeepDoingIt was an in-memory `Set` only | `localStorage` keys `moon_completed` + `moon_session_log`, restored on load |
| 4 | Chips lacked required `.ex-chip` class | added; count = 15 verified |
| 5 | Stale `apps.facebook.com` deploy box in sidebar | replaced with AikiField deep-link documentation |
| 6 | Primary `deep_link` in both post files still pointed at Facebook | all 180 rewritten to aikifield.com URLs (JSONL + CSV) |
| 7 | Silent `catch(e){}` in slug router | `console.error` logging (never-fail-silently convention) |
| 8 | Duplicate `'wrist-grab-grounding'` key in `slugMap` | deduplicated, id 6 preserved |
| 9 | No path routing for `/games/exercises/:slug` | `games/exercises/.htaccess` single-segment slug → `index.html` + `RewriteOptions Inherit` (keeps root HTTPS redirect in force) |
| 10 | No games-scoped 404 for future routes | `games/.htaccess` `ErrorDocument 404 /games/404.html` + washi placeholder page |
| 11 | Privacy page referenced Facebook Login collection | rewritten — no login, localStorage only |
| 12 | Wrist Grab body had compressed copy (`easily,resisting`, `At first you do 50/50`) | normalized to required lead-magnet wording |

## Deployment verification checklist

- [x] **PASS** `/games/` serves hub `index.html` with 200, lists exercises game (Apache: 200; card "MOON - 20 Exclusive Practices" links `/games/exercises/`)
- [x] **PASS** `/games/exercises/` serves full app, auto-loads 15 exercises, `.ex-chip` count = 15 (Playwright: 15 chips, 15 exercise objects)
- [x] **PASS** `/games/exercises/?exercise=wrist-grab-grounding` auto-opens Wrist Grab Grounding id 6; Real/Invisible toggle visible; **Invisible** default active (`currentId === 6` verified)
- [x] **PASS** Wrist Grab Grounding shows required copy — "Resisting the push lets them pull you easily, resisting the pull lets them push you", "50/50 - resist less, ground more", "50% → 60% ground", "DBSO KeepDoingIt", toggle label contains "we say invisible"
- [x] **PASS** Interlude after Part I renders "Feel / into the center / of your central core / even by drops / in ever finer adjustments" in `.poem` (computed style: `white-space:pre-wrap`, `text-align:center`, `font-style:italic`, `background:rgb(245,240,230)` = #F5F0E6)
- [x] **PASS** `/games/exercises/?studio_id=city-aikido` shows banner "Practicing for City Aikido students — Home dojo of Robert Nadeau Shihan, Richard Moon's teacher since 1971.…"
- [x] **PASS** Images load from `/games/exercises/images/` — all 3 webp 200, zero failed requests, no mixed-content (no `http://` refs in HTML)
- [x] **PASS** `/games/dojo-tycoon/` returns 404 with placeholder page; `/games/exercises/` unaffected; multi-segment exercise slugs also 404 cleanly (Apache verified: dojo-tycoon → 404 + 840b placeholder; bogus `/games/exercises/<slug>` serves app default which is acceptable single-segment behavior — it renders exercise id 6, no broken state)
- [x] **PASS** 180 posts CSV has updated aikifield.com deep links (180/180 `deep_link` start `https://aikifield.com/games/exercises/` with `studio_id`, `fb_page_id`, `exercise=wrist-grab-grounding`, `ref=fb_page_post`; JSONL identical; zero `apps.facebook.com` strings remain)
- [x] **PASS** Privacy at `/games/privacy/` and Terms at `/games/terms/` serve 200

## Additional checks

- [x] **PASS** All 15 exercise objects valid (id, title, meta, body, part)
- [x] **PASS** Free IDs [1,6,12] — DBSO, Wrist Grab Grounding, Ten to the Tenth — render fully, no modal
- [x] **PASS** Locked IDs (e.g. 3) show exact modal "20 exclusive practices unavailable anywhere else — By Richard Moon 6th Dan"
- [x] **PASS** KeepDoingIt writes `moon_completed` + `moon_session_log` to localStorage and survives reload (`[1,12]` persisted; progress "2/15", "Completed IDs: 1, 12")
- [x] **PASS** `?exercise=` and `?studio_id=` parsed via `URLSearchParams`; path routing `/games/exercises/wrist-grab-grounding` → 200 app (Apache `mod_rewrite` verified, not just JS)
- [x] **PASS** `games/exercises/data/*.json|.jsonl` all parse (20 + 15 records)
- [x] **PASS** Both `<script>` blocks parse (`new Function`), zero console errors, zero failed requests in browser session
- [x] **PASS** No secrets in package; `marketing/` excluded from `sync.sh` deploy; `*.md` already excluded
- [x] **PASS** `/games/` is public (not behind `/for-review/` or `/beta/` gate) — confirmed by design; dispatcher only intercepts `/for-review/*`

## Status: ALL CHECKS PASS — package is deploy-ready

"LAUNCHED" not declared — production upload is the operator's step (see upload instructions below).

## Package layout (`aikifield_games_deploy_ready.zip`)

```
games/index.html                      hub
games/.htaccess                       games-scoped 404 → /games/404.html
games/404.html                        washi placeholder for future routes
games/exercises/index.html            Moon 20 Exclusive Practices app
games/exercises/.htaccess             slug → index.html (+RewriteOptions Inherit)
games/exercises/data/*.json|.jsonl    source data (3 files)
games/exercises/images/*.webp         3 creatives
games/privacy/index.html
games/terms/index.html
aikifield_posts_wrist_grab_180.jsonl  180 posts, aikifield deep links
aikifield_posts_wrist_grab_180.csv    same, spreadsheet form
README_AIKIFIELD.txt
```

## Upload instructions

```bash
# rsync (recommended) — from repo root or the extracted zip dir:
rsync -avz games/ user@aikifield.com:public_html/games/

# or via the repo's own deploy script after merge:
./sync.sh            # games/ is not excluded; goes up with the site

# FTP equivalent: upload the entire games/ directory into public_html/games/
# Ensure .htaccess files are uploaded (many FTP clients hide dotfiles).
# Apache needs AllowOverride on for the slug rewrite + ErrorDocument.
# Requires mod_rewrite (standard on cPanel/shared Apache).
```

Post-upload smoke test:

```bash
curl -sI https://aikifield.com/games/ | head -1                      # 200
curl -sI https://aikifield.com/games/exercises/ | head -1            # 200
curl -sI https://aikifield.com/games/exercises/wrist-grab-grounding  # 200
curl -sI https://aikifield.com/games/dojo-tycoon/ | head -1          # 404
```
