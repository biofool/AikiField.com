# /beta/ — connected assessment preview

Unreleased preview implementing GitHub issue **#13** (connect both assessments:
hand-off + cross-view) and the UI direction from issue **#11** (dark theme,
radar visualization, pressure scenarios, 30-day plan).

**This folder is blind.** Every page carries `noindex,nofollow`, `/beta/` is
disallowed for every user-agent group in `robots.txt`, and nothing here is
linked from the site nav, footer, or `sitemap.xml`. It is reachable only by
typing the URL.

## Files

| Path | What it is |
|---|---|
| `assessment.html` | Hub — explains both assessments, shows completion state, unlocks the cross-view, privacy notice, clear control |
| `assessment-organisation.html` | Organisational flow: 5 categories × 4 questions |
| `assessment-leadership.html` | Leadership flow: 7 dimensions × 4 questions + 4 pressure scenarios |
| `assessment-crossview.html` | The org × leadership cross-view |
| `css/assessment.css` | Scoped dark theme, `--bta-*` / `.bta-*` namespace |
| `js/assessment.js` | Scoring, localStorage, SVG radar, cross-view lookup |
| `data/questions.json` | All 48 questions (verbatim from `assessment.html`) |
| `data/crossview.json` | Axis definitions + 24 interpretations + fallback |
| `data/scenarios.json` | 4 pressure scenarios and the tendency readings |
| `data/practices.json` | 30-day practices, keyed by group id |

The site header and footer keep their normal light styling from
`css/redesign.css`. Only `<main class="bta-main">` becomes the dark field, so
the assessment reads as a distinct working space without a separate chrome.

## Running it

The pages fetch their data at runtime, so `file://` will not work. From the
repository root:

```
python3 -m http.server
```

then open `http://localhost:8000/beta/assessment.html`. If the data cannot be
fetched the pages show an explicit error explaining why — they do not fail
silently.

## Storage

One key: `aikifield.beta.assessment.v1` in `localStorage`.

```
{
  "version": 1,
  "organisation": { "answers": { "<qid>": 1..6 }, "scenarios": {}, "completedAt": "<iso>" },
  "leadership":   { "answers": { "<qid>": 1..6 }, "scenarios": { "<scenarioId>": "<optionId>" }, "completedAt": "<iso>" }
}
```

Nothing is transmitted. An assessment counts as complete when every question
has a numeric answer **and** `completedAt` is set. Scenarios are optional and
never gate completion.

## Bucket definitions

The three-row table in issue #13 is a seed, not a schema — its cells mix
organisational and leadership properties. The buckets below are the schema the
implementation actually uses, and every combination of them has an entry in
`data/crossview.json`.

### Organisational axis — 6 buckets

Two inputs, both derived from the five category means:

- **level** = mean of the five category means
- **spread** = highest category mean − lowest category mean

Spread is included deliberately. Two organisations with the same average sit in
completely different positions if one is uniformly mid and the other is
excellent in three categories and absent in two — and the second is the more
common shape in a growing product company.

| level | shape | bucket |
|---|---|---|
| < 3.0 | spread ≤ 1.5 | `org-emerging-even` |
| < 3.0 | spread > 1.5 | `org-emerging-uneven` |
| 3.0–4.5 | spread ≤ 1.5 | `org-developing-even` |
| 3.0–4.5 | spread > 1.5 | `org-developing-uneven` |
| ≥ 4.5 | spread ≤ 1.5 | `org-established-even` |
| ≥ 4.5 | spread > 1.5 | `org-established-uneven` |

### Leadership axis — 4 buckets

The seven presence dimensions group into three clusters:

| Cluster | Dimensions | What it describes |
|---|---|---|
| Steadiness | Balance, Flexibility, Vitality | how you hold yourself when the load arrives |
| Relational reach | Heart, Voice | how you move with the people the work depends on |
| Generative range | Vision, Inspiration | how you sense and shape what is coming next |

The bucket is the **leading cluster**, not the overall level:

- If (highest cluster mean − lowest cluster mean) ≤ **0.75** → `lead-even`
- Otherwise the highest cluster names it → `lead-steadiness`, `lead-relational`,
  `lead-generative`

Overall leadership level is deliberately **not** part of the bucket. Folding
level into the axis would have produced 12 leadership buckets and 72
combinations, most of which would have needed near-identical text. Level is
carried instead as a single qualifying sentence (`levelNotes.leadership` in
`crossview.json`), which keeps the matrix at 6 × 4 = **24 combinations** — all
of them written, plus a `fallback` entry that the renderer uses if a
combination ever fails to resolve.

### Where the seed rows landed

| Seed row | Bucket combination |
|---|---|
| Strong process, weak influence / high technical confidence → "Controls may exist but lack adoption." | `org-established-uneven` × `lead-steadiness` |
| Emerging posture, strong alignment / good stakeholder trust → "Leadership can accelerate foundational improvements." | `org-emerging-even` × `lead-relational` |
| Strong posture, low adaptability / mature but rigid → "The organisation may struggle with changing threats." | `org-established-even` × `lead-steadiness` |

Each interpretation carries four fields: `headline`, `interpretation` (how the
two interact), `watch` (where the friction shows up), and `lever` (the
highest-leverage move). None of them grade the reader.

## Pressure scenarios

Four scenarios, four options each, every option tagged with a tendency
(`stabilise`, `adapt`, `connect`, `envision`). **They are not scored into the
radar** — mixing a forced-choice instrument into a Likert one would make the
shape unreadable and the scoring opaque. They produce a separate qualitative
"under pressure" reading with a stated strength and a stated cost. A tie across
tendencies is reported as a tie rather than resolved arbitrarily.

## Accessibility

- Scale input is a native radio group per question — arrow keys move between
  values, so the radar needs no drag interaction. There is no drag-only path.
- The radar is `role="img"` with `<title>`/`<desc>`, and every chart is followed
  by a real `<table>` carrying the same figures.
- Contrast ratios are documented at the top of `css/assessment.css`. Every text
  pair is ≥ 5.4:1; radar axis lines are 3.3:1 (non-text). Teal and amber are
  never used as text on the warm panel — `#0E4E44` and `#7A4A00` are used there.
- `prefers-reduced-motion` disables all transitions.
- The step bar is bottom-pinned at ≤ 720px with `env(safe-area-inset-bottom)`.

## Known gaps

- Both flows render every question on one scrollable page rather than one
  question at a time. This keeps all dimensions visible, which is what #11 asks
  for, but it is not the progressive flow described in #12.
- The radar is display-only. Setting a value by clicking or dragging on the web
  itself (#11) is not implemented; the radio scale is the input.
- Bucket thresholds are unvalidated guesses. They need review against real
  responses before this leaves beta.
