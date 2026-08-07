# UI/UX Layout Skill — AikiField.com

Use this skill when designing, restructuring, or reviewing the layout of any
AikiField.com page. It captures the site's design system, component library,
accessibility conventions, and responsive behavior so proposed layouts stay
visually consistent and on-brand.

## When to invoke

- Restructuring an existing page's section order or layout
- Adding a new section, card, or interactive panel to a page
- Proposing a layout that places two distinct content areas side-by-side
  (e.g. marketing content + an interactive widget like the AI chat login)
- Reviewing a page for visual hierarchy, accessibility, or mobile behavior

## Design tokens (from css/redesign.css `:root`)

| Token | Value | Use |
|---|---|---|
| `--af-bg` | `#F6F2EA` | warm paper — page background |
| `--af-white` | `#ffffff` | white section background |
| `--af-ink` | `#16201C` | darkest text (headings) |
| `--af-text` | `#2C3833` | body text |
| `--af-text-2` | `#3A4742` | secondary body |
| `--af-muted` | `#5A655F` | muted text |
| `--af-primary` | `#0E4E44` | deep green — primary brand |
| `--af-primary-dk` | `#0A3A33` | darker green — hover/active |
| `--af-mint` | `#5FD3B2` | mint accent — on green backgrounds only |
| `--af-mint-dk` | `#8FE6C9` | lighter mint — hover on green |
| `--af-gold` | `#9A6B14` | gold — eyebrow/kicker labels |
| `--af-border` | `#E0D9CB` | card/section borders |
| `--af-hover-bg` | `#EBE4D6` | hover background |
| `--af-dark-bg` | `#12211D` | dark section background |
| `--af-dark-card` | `#1A2E28` | dark card background |
| `--af-inf-bg` | `#123c33` | infinite-game panel bg |

**Fonts:** `--af-serif` = Source Serif 4 (headings), `--af-sans` = Public Sans (body).
**Container:** `--af-container` = 1180px max-width, 40px side padding (24px on mobile).

### Contrast rules (from coach-auth.css comments)

- `--af-mint` is for text/accents ON TOP of a solid green background. It fails
  contrast (~1.6:1) against the paper background — never use it as text on
  `--af-bg` or `--af-white`.
- `--af-primary` green is the readable-as-text accent on light backgrounds
  (~8.6:1 on `--af-bg`).
- Status colors: success = `#E8F5E9` bg / `#4CAF50` border / `#1B5E20` text;
  error = `#FFF3E0` bg / `#FF9800` border / `#E65100` text. (Same palette as
  the contact form `.af-form-status`.)

## Layout primitives

### Sections (vertical rhythm)
- `.af-section` — 80px vertical padding (default, paper bg)
- `.af-section--white` — white bg + top/bottom border (alternates with paper)
- `.af-section--tight` — 56px padding
- `.af-section--lg` — 88px padding
- `.af-section--dark` — dark bg (`--af-dark-bg`), light text
- **Alternating pattern:** paper → white → paper → white creates visual
  separation between sections. Keep this rhythm when adding sections.

### Container
- `.af-container` — max-width 1180px, centered, 40px side padding.
  Every section's content goes inside a `.af-container`.

### Grids
- `.af-grid` — base grid (24px gap)
- `.af-grid--fit` — `repeat(auto-fit, minmax(280px, 1fr))` — responsive cards
- `.af-grid--fit260` / `.af-grid--fit300` — narrower card min-widths
- `.af-grid--28` / `.af-grid--32` — larger gaps
- Two-column splits: `.af-services-split` (1.05fr 0.95fr, collapses at 980px),
  `.af-insights` (same), `.af-hero-home__grid` (1.15fr 0.85fr)

### Page header (interior pages)
- `.af-page-header` — 72px top / 40px bottom padding
- `.af-page-header--green` — green bg (`--af-primary`), white h1, mint eyebrow,
  dark-card-text lead. Matches the carousel/hero green.
- `.af-page-header--tight` — reduced bottom padding (48px)
- Contains: `.af-eyebrow` (label), `.af-h1` (title), `.af-lead` (subtitle)

## Component library

### Cards
| Class | Use | Style |
|---|---|---|
| `.af-card` | generic content card | paper bg, border, 16px radius, 32px pad |
| `.af-svc` | service/project card | white bg, border, 20px radius, 40px pad |
| `.af-svc--flagship` | featured project | 2px primary-green border |
| `.af-practice` | approach practice card | paper bg, border, 16px radius |
| `.af-assess-card` | assessment card | white bg, border, 16px radius |
| `.af-contact-card` | contact card | paper bg, border, 16px radius |
| `.af-stat` | stat card (dark) | dark-card bg, mint figure |
| `.af-feature` | featured insight (dark) | dark-card bg, 20px radius |

### Service/project card structure (`.af-svc`)
```
<article class="af-svc">
  <div class="af-svc__tag-row"><span class="af-svc__tag">Label</span></div>
  <h2 class="af-svc__title">Title</h2>
  <p class="af-svc__lead">Lead paragraph</p>
  <p class="af-svc__bestfor">Italic "best for" line</p>
  <h3 class="af-svc__bullets-label">What it does</h3>
  <ul class="af-svc__bullets">
    <li class="af-svc__bullet"><svg>...</svg><span><strong>...</strong> text</span></li>
  </ul>
  <h3 class="af-svc__bullets-label">Tech stack</h3>
  <p class="af-body">Python · FastAPI · ...</p>
</article>
```
- `.af-svc__bullets` is a 2-column auto-fit grid (minmax 300px) — collapses to
  1 column at 720px.
- Bullets use inline SVG checkmarks (stroke `#0E4E44`).

### Principle strip
`.af-principle` — top-border (3px primary) cards with gold tag, serif title,
body text. Used in grids of 3 (`.af-grid--fit`).

### CTA callout
`.af-callout` — green bg, centered, white title, 24px radius. `.af-callout--sm`
for smaller. Button: `.af-btn--light` (paper bg on green).

### Buttons
- `.af-btn--primary` — green bg, white text
- `.af-btn--ghost` — transparent, green border + text
- `.af-btn--light` — paper bg, green text (on green backgrounds)
- `.af-btn--ondark` — paper bg, green text (on dark backgrounds)
- `.af-btn--sm` — smaller padding/font
- Coach buttons use `.btn` / `.btn-primary` / `.btn-secondary` (defined in
  coach-auth.css, bridged to the same tokens)

### Diagrams
`.af-diagram` — full-width figure with bordered image, sans caption, and a
"Download PNG" link. Images are SVG (with PNG download fallback).

### FAQ
`.af-faq` — `<details>`/`<summary>` accordion with `+`/`−` indicator.

## Coach auth/chat components (coach-auth.css)

- `.coach-shell` — max-width 700px, centered. Wraps the login/chat.
- `.coach-intro-panel` — paper card with feature checklist
- `.coach-card` — paper card (login form, register form, chat, privacy notice)
- `.coach-messages` — green bg (`--af-primary`), 400px max-height scroll area
- User bubble: `.coach-msg-user` (mint bg, dark-green text)
- AI bubble: `.coach-msg-ai` (near-white bg, dark text)
- Mobile (≤768px): intro panel hidden, shell becomes flex column filling
  viewport below sticky nav, messages area grows to fill remaining space.

**Key constraint:** `.coach-shell` is max-width 700px — it's a narrow column,
not full-width. This is intentional for form readability.

## Accessibility conventions (first-class — do not regress)

1. **Skip link:** `.af-skip-link` → `#main` on every page.
2. **Semantic HTML:** `<header>`, `<main id="main">`, `<nav aria-label>`,
   `<article>`, `<section>`, `<footer>`.
3. **Focus visibility:** 3px solid `--af-primary` outline, 3px offset on
   `:focus-visible` for links, buttons, nav CTA, skip link.
4. **ARIA:** `aria-current="page"` on active nav link, `aria-label` on nav,
   `aria-hidden="true"` on decorative SVGs.
5. **Color contrast:** all text meets WCAG AA (4.5:1). Mint is NEVER used as
   text on light backgrounds. Status colors use the accessible palette.
6. **Tap targets:** min 44px (buttons, nav CTA, chat controls on mobile).
7. **Keyboard nav:** nav is a CSS-only toggle (checkbox hack) at ≤720px — no
   JS required. Chat controls are keyboard-accessible.
8. **Image alt text:** diagrams have detailed alt text describing the flow.
9. **`text-wrap: balance`** on headings for better line breaks.

## Responsive breakpoints

| Breakpoint | What changes |
|---|---|
| ≤980px | Two-column splits (hero, services, insights) → 1 column |
| ≤860px | Footer grid → 1 column |
| ≤768px | Coach chat: intro hidden, shell fills viewport, messages grow |
| ≤720px | Nav → hamburger toggle, container padding → 24px, section padding → 56px, card padding → 24px, svc bullets → 1 column |
| ≤760px | Comparison table font shrinks |
| ≤640px | Cluster cards → 1 column, diagram border-radius → 10px |

## Layout principles for this site

1. **Alternating section backgrounds** (paper / white) create rhythm. Don't
   put two same-bg sections adjacent without a border or visual break.
2. **Green is for heroes and CTAs** — the page header, hero, carousel, and
   callout use `--af-primary` bg. Don't overuse green for body sections.
3. **Narrow interactive columns** — forms and chat use max-width 700px
   (`.coach-shell`) or 640px (`.af-form`) for readability. Don't stretch
   forms full-width.
4. **Cards float on section backgrounds** — white cards on paper sections,
   paper cards on white sections. The `.af-svc` project cards are white on
   the default (paper) section.
5. **Diagrams are full-width** within the container — they're the widest
   elements on the page, showing complex flows.
6. **One primary action per section** — don't compete for attention. The
   CTA callout is always a single, centered call to action.
7. **Mobile-first collapse** — every multi-column layout has a documented
   single-column fallback at a specific breakpoint.

## How to propose a layout

When asked to suggest or redesign a page layout:

1. **List the content blocks** that must appear on the page (in priority order).
2. **Assign each block a section** (bg variant) and a component (card type).
3. **Determine column layout** per section: full-width, two-column split, or
   auto-fit grid. Reference the responsive collapse behavior.
4. **Check the alternating-bg rhythm** — no two adjacent same-bg sections.
5. **Verify accessibility** — skip link target, semantic landmarks, focus
   order, contrast, tap targets.
6. **Describe the mobile collapse** — what stacks, what hides, what fills.
7. **Note any new CSS** needed (new component, new breakpoint, new token).
8. **Present as a section-by-section outline** with the component classes,
   not as a full HTML mockup (unless asked to implement).

## Source files

- `css/redesign.css` — design tokens, layout primitives, all components
- `coach-auth.css` — coach login/chat styles (bridged to `--af-*` tokens)
- `projects.php` — the page that hosts both sponsored projects + coach login
- `index.html` — home page (hero, cards, services split, insights, CTA)
- `services.html` — service cards + assessment cards + comparison table
