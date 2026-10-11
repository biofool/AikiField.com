# Conventions

## Conventions

- **SITE_CONTENT.md is canonical for copy.** When editing page text, update
  both the HTML and `SITE_CONTENT.md` so they stay in sync.
- **Accessibility is a first-class concern.** The redesign was explicitly an
  accessibility overhaul -- preserve semantic HTML, ARIA, color-contrast, and
  keyboard-navigation improvements.
- **DVC for large files.** Never commit large binaries directly to git; use
  DVC (`.dvc` file + `dvc push`).
- **`input/` is gitignored** -- it holds working/source materials only.
- **`sync.sh` is production-sensitive.** Always run `dryrun` before `deploy`.
- **Coaching auth = shared flow (triple-PRD rule).** The blind `login.php`
  authenticates against the AIRichardMoon backend (same as
  quantumaikido.com) and gates the `/beta/` + `/for-review/` pages. `projects.php` is public
  and shows an invitation card. Changes to login/registration/auth/session/
  invitation flow MUST update all three PRDs (`docs/coach-auth-prd.md` here,
  `docs/coach-dashboard-prd.md` in QA, `backend/PRD.md` in AIRichardMoon) and
  deploy all affected repos together. Never commit `coach-config.local.php`.
- **Contact page: direct booking is post-submit only.** The Outlook booking
  URL must NOT appear as a standalone CTA on the contact page. It is only
  exposed inside the success/error banners after the form is submitted. The
  form is the sole primary conversion path; direct booking is a follow-up
  option, not a competing CTA.

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
