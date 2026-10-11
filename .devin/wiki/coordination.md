# Coordination

### Coaching auth (shared flow — triple-PRD rule)

The coaching login authenticates against the Quantum Aikido coaching
backend (`AIRichardMoon`, FastAPI on Cloud Run) via `coach-proxy.php`. The
auth surface is a **blind `/login.php`** page that gates
the pre-release `/beta/` assessment pages and the `/for-review/` games area. It is NOT linked from the public
nav. `projects.php` no longer hosts any login or chat — it shows an
invitation card pointing visitors to `contact.html` to request a live demo.
The inline AI Chat was removed from `projects.php`. Since 2026-10-02 the
QA members chat is replicated at `/members` (`members.php` + `coach-chat.js`
+ `css/coach-chat.css`), gated by `beta-gate.load.php` and linked from the
public nav's **Digital Experience** menu as "Enter the Unified Field Chat";
`quantumaikido.com/members` stays live too. Keep `coach-chat.js` in sync with
the QA copy (AikiField-only edits are listed in its header). Since 2026-10-04
(issue #71) all `/games/` experiences are gated by `beta-gate.load.php` too —
the nav's Digital Experience menu links to public preview pages under
`/digital-experience/` instead of the gated game URLs.

AikiField.com remains a **third frontend surface** for the shared coaching
auth flow (same backend user store, same session contract), alongside
`quantumaikido.com` and `AIRichardMoon/frontend` — but the surface is
now beta gating plus the gated `/members` chat replica.

Files: `login.php` (blind login + PHP session POST handlers + `?next=`
redirect), `coach-proxy.php`, `coach-login.js` (loaded by `login.php`),
`coach-auth.css`, `includes/coach-config.load.php`,
`coach-config.php` (non-secret template), `coach-config.local.php`
(gitignored — holds `COACH_PROXY_SECRET` / `TURNSTILE_SITE_KEY`), `.htaccess`
(`/coach-api/*` → proxy; `projects.html` → `projects.php` 301;
`/beta/*.html` → `/beta/*.php` 301s), `includes/beta-gate.load.php`
(redirects unauthed `/beta/` requests to `/login.php?next=…`; also usable in
`AF_GATE_NO_REDIRECT` mode for status endpoints),
`games/exercises/auth-state.php` (`{"authed":bool}` — unlocks all practices
for signed-in members in the public exercises app). Full design:
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
