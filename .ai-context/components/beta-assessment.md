# Component: Beta Assessment

## Responsibility

Pre-release self-assessment tool behind the coaching auth gate. Two
connected assessments (organisational security posture + leadership
presence) with radar visualizations and a cross-view. All scoring is
client-side (localStorage); nothing is transmitted to the server.

## Files

| File | Role |
|------|------|
| `beta/index.php` | Beta index/hub (session-gated) |
| `beta/assessment.php` | Hub: explains both assessments, completion state, cross-view unlock |
| `beta/assessment-organisation.php` | 5 categories × 4 questions |
| `beta/assessment-leadership.php` | 7 dimensions × 4 questions + 4 pressure scenarios |
| `beta/assessment-crossview.php` | Org × leadership cross-view (unlocks when both complete) |
| `beta/data.php` | Session-gated JSON delivery for assessment data |
| `beta/js/assessment.js` | Scoring, localStorage, SVG radar, cross-view, scenarios (~767 lines) |
| `beta/css/assessment.css` | Scoped dark theme (`bta-*` / `--bta-*` namespace) |
| `beta/data/questions.json` | 48 questions |
| `beta/data/crossview.json` | Axis definitions + 24 interpretations + fallback |
| `beta/data/scenarios.json` | 4 pressure scenarios + tendency readings |
| `beta/data/practices.json` | 30-day practices keyed by group id |
| `beta/data/.htaccess` | `Require all denied` — blocks direct JSON access |
| `beta/README.md` | Documentation |

## Interfaces

### Inbound (browser → beta pages)

- `GET /beta/index.php` — beta hub
- `GET /beta/assessment.php` — assessment hub
- `GET /beta/assessment-organisation.php` — org assessment flow
- `GET /beta/assessment-leadership.php` — leadership assessment flow
- `GET /beta/assessment-crossview.php` — cross-view (unlocks when both
  complete)

### Inbound (assessment.js → data.php)

- `GET /beta/data.php?f=<filename>` — session-gated JSON delivery
- Allow-list: `crossview.json`, `practices.json`, `questions.json`,
  `scenarios.json`

## Dependencies

- **Code:** `includes/beta-gate.load.php` (required by all beta PHP pages)
- **Config:** `COACH_BACKEND_URL`, `COACH_PROXY_SECRET` (via
  `beta-gate.load.php` → `coach-config.load.php`)
- **External:** AIRichardMoon backend (for session revalidation every 6h)
- **Runtime:** PHP 8.0+ (for gate); vanilla JS (for SPA); browser
  localStorage

## Consumers

- None — this is a leaf component (user-facing only)

## State/data

- **Server-side:** PHP session (same as coaching auth)
- **Client-side:** localStorage — assessment answers, completion state,
  scores
- **No transmission:** assessment data stays in browser; `data.php`
  serves static JSON, doesn't receive user data

## Boundaries

- Session gate: `beta-gate.load.php` redirects to `/login.php?next=…`
  if unauthenticated
- Data access: `beta/data/.htaccess` blocks direct JSON fetch;
  `beta/data.php` is the only path
- `noindex,nofollow` on all beta pages
- `robots.txt` disallows `/beta/`

## Security considerations

- Session revalidation fails open on backend unreachable (intentional
  design — avoids locking all beta users out on transient outage)
- 6h revalidation cadence (vs QA's per-request) — sufficient because
  beta pages don't have the `coach-auth.js` crash-on-null issue
- Data files are non-sensitive (assessment questions, not user answers)
- User answers never leave the browser

## Test coverage

- E2E: `tests/e2e/specs/redirects.spec.js` (beta-gate redirect tests)
- No unit tests for `assessment.js` scoring logic
- See `../testing/test-map.yaml`

## Known risks

See `../debt/register.yaml`.
