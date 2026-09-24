# Verbal Aikido — Story Mode Prototype

A single-page, vanilla-JS prototype for the Verbal Aikido mobile/web game.
This build covers **Level 1 (Rookie)**, **Chapter 1** and the full branching **Chapter 2** from the VA App 2023 design document (`/tmp/va_app_page7_plus.txt`, pages 7–11).

## Files

- `index.html` — playable page (mobile-first responsive). Links the web app manifest and includes PWA install / mode controls.
- `game.js` — game engine: loads content, renders scenes, handles choices, updates the angry-face meter, routes outcomes, persists progress in `localStorage`, registers the service worker, and manages the PWA install prompt.
- `game.css` — clean, accessible UI with a visible anger meter, keyboard focus states, and PWA control styles.
- `content.json` — Chapter 1 and Chapter 2 branching story content transcribed from the PDF, plus the `discovery` block (lesson text, media placeholders, quizzes).
- `i18n/en.json` — all UI strings (tabs, buttons, feedback, meter labels, PWA/offline messages) with `{placeholder}` interpolation. Additional languages drop in as `i18n/<code>.json`; translated story/lesson content drops in as `i18n/content.<code>.json` (same schema as `content.json`).
- `manifest.json` — web app manifest (icons, theme colors, display mode, start URL).
- `sw.js` — service worker that caches the app shell and `content.json` for offline play.
- `icons/` — PWA icons: 192×192 and 512×512 SVG + PNG, plus a maskable icon.
- `tests/` — pre-existing reference material (`chapter2-reference.json`, `validate-content.js`, `path-inventory.md`) used to validate the Chapter 2 graph. This directory is not required at runtime.
- `TESTING.md` — sample click-through paths, offline/PWA test steps, and known edge cases.

## How to run

From the repo root (`~/projects/github/AikiField.com/`) or this directory:

```bash
php -S 0.0.0.0:8080
```

Then open `http://localhost:8080/for-review/games/verbal-aikido/` (or `http://0.0.0.0:8080/for-review/games/verbal-aikido/` from another host).

If you want to run only the game folder:

```bash
cd /home/kkron/projects/github/AikiField.com/for-review/games/verbal-aikido
php -S 0.0.0.0:8081
```

Then open `http://localhost:8081/`.

No build step, no npm/composer dependencies.

## Content schema

```json
{
  "chapters": [
    {
      "id": "ch1",
      "title": "...",
      "intro": "...",
      "startNode": "...",
      "nodes": {
        "<nodeId>": {
          "type": "attack|feedback|retry|lesson|success|partial|chapter_select",
          "speaker": "...",
          "text": "...",
          "meter": 0,
          "message": "...",
          "choices": [
            {
              "id": "...",
              "text": "...",
              "type": "J|C|A|F|S|V|N",
              "meterDelta": 0,
              "nextNode": "...",
              "outcome": "success|partial|retry|lesson"
            }
          ]
        }
      }
    }
  ]
}
```

### Field meanings

- `type`:
  - `attack` — the opponent speaks and the player chooses a reply.
  - `feedback` — reserved for explicit post-choice reveal nodes (currently unused; the engine renders the reveal as an overlay instead).
  - `retry` — the player has hit the anger threshold and is offered a restart or lessons.
  - `lesson` — placeholder for Discovery/Extras/Recommended lessons.
  - `success` — full energy-shift ending (Y1).
  - `partial` — partial success ending (Y2).
  - `chapter_select` — special global node that lists unlocked chapters.
- `speaker` — who is speaking (`Partner`, `Narrator`, etc.).
- `meter` — the discrete anger level of the node (`0` calm → `3` furious).
- `choices.type` — response category:
  - `J` = Justify
  - `C` = Counter-attack
  - `A` = Aikido
  - `F` = Flight / avoidance
  - `S` = Submissive
  - `V` = Victim play
  - `N` = Negating emotion
- `meterDelta` — change applied to the meter after the choice (clamped to `0–3`). Missing/unknown deltas are stored as `null`.
- `nextNode` — node to load after the choice.
- `outcome` — designer-facing label used for routing/tracking.

## Discovery mode

Discovery mode implements the PDF's "Discovery functionality" (page 6): users access
lessons with videos, articles and introductory texts; each lesson ends in a quiz;
passing the quiz marks proficiency; new lessons unlock as Story-mode chapters are
completed.

- The chapter-select screen has a **Discovery mode** button; success/partial end
  nodes offer a **Check out Discovery mode** choice routing to the same list.
- The Discovery list shows one card per lesson. Locked cards are disabled and show
  their unlock requirement (e.g. "Complete Chapter 1: A different way to respond").
- A lesson view shows title, intro `body` paragraphs, a media placeholder note, and
  a **Take quiz** button.
- The quiz shows one question at a time with immediate correct/incorrect feedback
  and the `explanation`. Final score uses `discovery.passThreshold` (default `0.66`,
  i.e. at least 2 of 3 correct). Passing pushes the lesson id into
  `completedLessons` (persisted).

### Discovery content schema

```json
{
  "discovery": {
    "passThreshold": 0.66,
    "lessons": [
      {
        "id": "disc_...",
        "title": "...",
        "summary": "...",
        "unlockRequirement": "chapter:ch1",
        "status": "locked",
        "media": [{ "type": "video|article", "label": "...(placeholder)", "url": "" }],
        "body": ["paragraph 1", "paragraph 2"],
        "quiz": [
          { "question": "...", "choices": ["..."], "correctIndex": 0, "explanation": "..." }
        ]
      }
    ]
  }
}
```

- `unlockRequirement` currently supports `chapter:<chapterId>` — the lesson unlocks
  when that chapter reaches a `success` node (full success; `partial` does not
  count as chapter completion in this prototype).
- `status` in JSON is declarative (`"locked"` default); actual unlock state is
  computed from `state.unlockedLessons` at runtime.
- Two sample lessons ship in `content.json`: `disc_reactive_responses`
  (unlocks after Chapter 1) and `disc_verbal_mat` (unlocks after Chapter 2).

## PDF transcription notes and normalization

### Response-type key

The PDF uses single-letter codes. This prototype maps them as follows:

| Code | Meaning | Internal `type` |
|------|---------|-----------------|
| J | Justify | `J` |
| C | Counter-attack | `C` |
| A | Aikido | `A` |
| F | Flight / avoidance | `F` |
| S | Submissive | `S` |
| V | Victim play | `V` |
| N | Negating emotion | `N` |

### Variable-name normalization

The PDF uses inconsistent reply variables (`reply$`, `reply1$`, `reply2$`, `reply8$`, `reply3$`, `reply$7`, `reply4$`, `reply9$`, `reply5$`, `reply6$`). The JSON uses stable node IDs instead and a `choices.id` prefix. The mapping is:

| PDF variable | Node / choice ID in `content.json` | Notes |
|--------------|--------------------------------------|-------|
| `reply$` | `ch1_start` choices (`ch1_reply_j`, `ch1_reply_c`, `ch1_reply_a`, `ch1_reply_f`) | Chapter 1 first exchange |
| `reply1$` | `ch2_start` choices (`ch2_reply1_c`, `ch2_reply1_s`, `ch2_reply1_a`) | Chapter 2 opening |
| `reply2$` | `ch2_counter_attack` choices (`ch2_reply2_a`, `ch2_reply2_c`, `ch2_reply2_j`) | After `reply1$ = C` |
| `reply8$` | `ch2_submissive_attack` choices (`ch2_reply8_v`, `ch2_reply8_a`, `ch2_reply8_s`) | After `reply1$ = S` |
| `reply3$` | `ch2_victim_attack` choices (`ch2_reply3_j`, `ch2_reply3_v`, `ch2_reply3_a`) | After `reply2$ = V` |
| `reply$7` | `ch2_disgust_attack` choices (`ch2_reply7_s`, `ch2_reply7_a`, `ch2_reply7_n`) | After `reply2$ = S` |
| `reply4$` | `ch2_x1` choices (`ch2_reply4_a`, `ch2_reply4_j_lying`, `ch2_reply4_j_longtime`, `ch2_reply4_n`) | X1 node |
| `reply9$` | `ch2_lying_attack` choices (`ch2_reply9_v`, `ch2_reply9_j`, `ch2_reply9_a`) | First `reply4$ = J` continuation |
| `reply6$` | `ch2_longtime_attack` choices (`ch2_reply6_c`, `ch2_reply6_v`, `ch2_reply6_a`) | Second `reply4$ = J` continuation |
| `self-centered` | `ch2_self_centered_attack` | After `reply4$ = N` |
| `reply5$` | `ch2_x2` choices (`ch2_reply5_n`, `ch2_reply5_a`, `ch2_reply5_c`) | X2 node |

### Chapter 2 ambiguities and design decisions

The Chapter 2 graph in `content.json` follows the normalized reference in `tests/chapter2-reference.json` and `tests/path-inventory.md`. Key decisions:

1. **X1 A is partial (Y2), not full success (Y1).**
   - Page 9 says `reply4$ = A` → `GOTO Y1`.
   - Page 11 explicitly says `If reply4$ =A$ ... Y2` (“Hmm. OK… let's pick this up later.”).
   - The more specific page-11 outcome is used: X1 → A → **Y2 / partial**.

2. **X2 A is full success (Y1).**
   - Page 11 says `If reply5$ or if reply6$ = A then ... Y1`.
   - X2 → A and `longTimeAttack` → A both route to **Y1 / success**.

3. **`reply4$ = J` appears twice.**
   - Page 9 lists one continuation (`lyingAttack` / `reply9$`).
   - Page 10 lists another continuation (`longTimeAttack` / `reply6$`).
   - Both are preserved as two distinct `J` choices at `ch2_x1`.

4. **`reply6$` is reached from X1 → J, not from X2.**
   - `ch2_longtime_attack` is a continuation of the second `reply4$ = J` branch.

5. **X2 → N routes to retry, not to a continuation.**
   - The `reply5$` N choice at X2 ends in “Try again / recommend lessons”.

6. **Missing meter deltas are stored as `null`.**
   - `ch2_disgust_attack` N and `ch2_self_centered_attack` J/C/A have no printed delta.
   - They are recorded as `null`; the engine treats them as `0` and lets the destination node's `meter` value determine the displayed level.

### Chapter 1 retry loop

The PDF says: “If reply$ is other than A: reveal the type of response given (J, C or F), then restart varying the attack slightly.”

The engine shows a feedback overlay that names the response type and the meter effect, then advances to a retry node with a varied attacker line (`ch1_retry_1`, `ch1_retry_2`, `ch1_retry_3`). Wrong choices cycle through the variants until an Aikido reply creates an energy shift.

## Progress persistence

Progress is stored in `localStorage` under the key `va-game-progress`. It records:

- `currentChapterId`
- `currentNodeId`
- `meter`
- `history`
- `unlockedChapters`
- `completedChapters`
- `unlockedLessons` — Discovery lesson ids unlocked by chapter completion
- `completedLessons` — Discovery lesson ids whose quiz was passed
- `starRatings` — `{ activityId: 1–5 }` ratings on Centering recordings
- `favorites` — hearted Centering activity ids
- `stretchSessions` / `sparringSessions` — completed-session counters
- `reminders` — `{ tipId: bool }` Extras reminder toggles
- `avatar` — chosen avatar emoji; `language` — practice language

A “Reset all progress” button on the chapter-select screen clears this data.

The minor-safety age record is stored separately under `va-age-gate`
(`{ birthdate, locked, log }`) so that a progress reset does not clear it —
see *Community mode & minor safety* below.

## Practice mode

Implements the PDF's "Practice functionality" (pages 12–13) as three
client-side activities:

- **Centering Activities** — a content-driven list of guided recordings
  (`practice.centering.activities`) with style filter, 1–5 star ratings and
  favorites. Media `url` fields are placeholders until real audio/video exists.
- **Stretching Activities** — guided question sessions. Posture 1 (expression,
  bot-guided) and Posture 2 (listening, partner version) walk through the
  PDF's question lists; each answer is free text, and finishing a session
  increments `stretchSessions`.
- **Sparring Activities** — the bot picks a random attack from
  `practice.sparring.attacks` (meter starts at 2) and the player self-assesses
  which response type their reply would be. Aikido counts a `sparringSessions`
  point; anything else raises the meter and shows the teaching tip. Sparring
  is gated on passing the `disc_reactive_responses` quiz
  (`practice.sparring.gateLessonId`), matching the PDF's "validate basic
  knowledge" requirement. Real-time partner matching is out of scope.

## Extras

The Extras tab renders the PDF's "Extras functionality" (page 15):

- **Multimedia library** — articles/videos list (`extras.multimedia`, links
  are placeholders).
- **Practical tips & activities** — `extras.tips`; items with `reminder: true`
  get an on/off reminder toggle persisted in `state.reminders` (local flag
  only — no push notifications yet).
- **VA Store** — `extras.store` items sorted by price, marked as placeholders;
  no checkout/payment flow.

## Community mode & minor safety

The Community tab renders the PDF's "Community functionality" (page 14):

- **Forums** — `community.forum.threads` list (pinned "What happens when you
  fall" support thread first, then attack posts / advice requests / insights).
  Read-only in this prototype — posting needs member accounts.
- **Events** — `community.events` list with an online/in-person format filter;
  cards show location, price (Free or amount), belt level and theme. Purchase /
  inscription flows are placeholders.
- **Find a Practitioner** — `community.practitioners` list filtered by practice
  language; each card shows avatar, belt, languages, practice modes
  (centering/stretching/sparring) and availability. Session requests and
  Sensei/dojo search need the backend.

**Minor-safety gate**: Find a Practitioner is adults-only. Until a date of
birth is entered (Profile → Age check, or inline when opening the screen), the
list is hidden behind an age check. The date is self-declared — the UI says so
and never calls it "verified". Users under `community.safety.minorAge`
(default 18) get guided Practice activities and Events instead of one-on-one
matching.

- **Lock**: entering an under-age date sets `locked: true` in the `va-age-gate`
  record. The date form is then replaced by a notice on both Profile and Find
  a Practitioner, and `setBirthdate` refuses changes (logged as
  `age_change_refused`). Adults can still edit their date; changing it to an
  under-age date locks it.
- **Reset-proof**: the record lives under its own `va-age-gate` key, which
  “Reset all progress” does not touch. Saves from before this change (with
  `birthdate`/`safetyLog` in `va-game-progress`) are migrated on load, and an
  under-age date is locked.
- **Log**: `va-age-gate.log` (capped at 200 entries) records `age_declared`
  (`{age, isMinor, locked}`), `age_change_refused`, and every
  `practitioner_access` decision (`age_required` / `denied_minor` /
  `allowed`). It never stores the birthdate itself.

Limits: this is still device-local. Clearing site data in the browser, or
using another device or browser, starts over, and the log isn't a reliable
audit record. Real enforcement and a server-side audit trail need the
account/backend work in the megaplan, plus the COPPA/GDPR-K policy in the
privacy docs (#306).

## Profile & belts

The Profile tab implements the local part of the PDF's profile/belt system
(page 14): avatar picker (`profile.avatars`), optional practice language
(`profile.languages`), session stats, and belt rank. Belts are defined in
`profile.belts` with `requires` thresholds on chapters / lessons / sparring /
stretching counts; the highest satisfied belt is shown with progress toward
the next. All state is localStorage-only — cross-device sync needs the
backend/auth work tracked separately.

## Internationalisation

All user-facing chrome text lives in `i18n/en.json`; `game.js` reads it
through `t('dotted.key', { vars })` with `{placeholder}` interpolation and an
English fallback for missing keys. Story/lesson/practice content lives in
`content.json` (the English base).

To add a language:

1. Copy `i18n/en.json` → `i18n/<code>.json` and translate the values.
2. Optionally copy `content.json` → `i18n/content.<code>.json` and translate
   story text, lesson bodies, activity titles, etc. (IDs and node structure
   must stay identical).
3. Add `{ code, label }` to `profile.languages` in `content.json`.

The Profile tab's language picker stores the language code in
`state.language`; switching reloads the matching `i18n/<code>.json` and
`i18n/content.<code>.json`, falling back to English when a file is absent.
`i18n/en.json` is precached by the service worker; bump `CACHE_VERSION` when
adding files so installed PWAs pick them up.

## Progressive Web App / offline play

The Verbal Aikido game is now an installable PWA.

### Install

1. Open the game in a modern Chromium browser (Chrome, Edge, Brave) or Android.
2. Tap the **Browser / App** toggle and switch it to **App**.
3. If your browser supports it, an **Install app** button appears — tap it and confirm.
4. On iPhone/iPad (Safari), the install panel shows manual instructions: tap the share icon, then **Add to Home Screen**.

### How the service worker works

- `sw.js` is registered with scope `./` when the page loads.
- During install, it caches the app shell and essential assets in `va-game-shell-v1`: `index.html`, `game.css`, `game.js`, `content.json`, `manifest.json`, and the icons.
- Subsequent loads use a **cache-first** strategy for the app shell, so the game starts instantly even when offline.
- Images/audio/video use **network-fallback-to-cache** and are stored in a separate `va-game-media-v1` cache.
- To force an update after changing a cached file, bump `CACHE_VERSION` in `sw.js`. The new service worker activates and clears old caches via the `activate` event.

### Clear the cache

- Chrome/Edge: open DevTools → **Application** → **Service Workers** → click **Unregister**, then **Storage** → **Clear site data**.
- Firefox: DevTools → **Application** (or `about:serviceworkers`) → unregister the worker, then clear cookies/site data.
- Safari: **Settings → Privacy → Manage Website Data** → remove the site.

### Offline behavior

- Once the first load completes, the game works without a network connection.
- If `content.json` cannot be fetched and it is not cached, a friendly offline message appears with a **Retry** button.
- A small connection-status indicator in the header shows **Online** or **Offline**.

## Site integration

- The game lives at `aikifield.com/for-review/games/verbal-aikido/`, served by
  `includes/for-review-serve.php` (Apache rewrite in `.htaccess`) behind the
  same coaching session that gates `/beta/` — existing Quantum Aikido
  accounts sign in via `/login.php` (`?next=` returns to the game).
- The page carries `<meta name="robots" content="noindex, nofollow">` — it is
  a blind/review surface, not linked from public navigation or the sitemap.
- The review hub `for-review/games.html` has a "Verbal Aikido — Story Mode"
  card that opens `games/verbal-aikido/` in its iframe modal. Old
  `quantumaikido.com/for-review/games*` and `/va-game*` URLs redirect here.
- End-to-end coverage lives in `tests/e2e/va-game.spec.js` (requires an
  authed session — see the file header).

## Scope

- No backend, auth, accounts, forum posting, session requests, store
  checkout, or payment flows.
- Community surfaces exist as client-side skeletons (read-only forums,
  events list, sample practitioner profiles) behind a local, self-declared
  age gate; real matching and moderation need server-side infrastructure and
  policy decisions.
- The content CMS is intentionally not implemented — it needs the backend.
- Profile progress is localStorage-only; no cross-device sync.
- Discovery mode is implemented (lesson list, intro body, media placeholders, quiz, unlock gating).
- Only Chapters 1 and 2 are implemented.
