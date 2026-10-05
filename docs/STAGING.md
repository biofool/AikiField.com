# Staging: staging.peec.biz + aikifield.peec.biz

AikiField staging is the `staging` branch deployed to a dedicated docroot on
the same GreenGeeks/cPanel account (`peec.biz`) as production, with the
coaching-auth backend and the contact form both made safe by default.

## Staging URL map (issue #80)

| URL | Serves | Mechanism |
|-----|--------|-----------|
| `https://staging.peec.biz/` | AikiField staging | cPanel vhost → `public_html/aikifield-staging/` |
| `https://staging.peec.biz/aikifield/*` | AikiField staging | `.htaccess` prefix-strip → same docroot |
| `https://aikifield.peec.biz/` | AikiField staging | `.htaccess` Host-rewrite → `staging-mirror/` symlink → `public_html/aikifield-staging/` |
| `https://quantumaikido.peec.biz/` | Quantum Aikido staging | cPanel vhost → `public_html/quantumaikido.peec.biz/` |
| `https://staging.peec.biz/quantumaikido/*` | Quantum Aikido staging | `.htaccess` 301 → `quantumaikido.peec.biz/*` |

Notes:

- `aikifield.peec.biz` shares its Apache vhost with `aikifield.com` (cPanel
  `serveralias`), so its docroot `public_html/aikifield.peec.biz/` is also
  the production origin. Splitting the vhost needs cPanel/root access, so
  the split is done by `.htaccess` Host conditions instead: requests for
  `aikifield.peec.biz` are internally rewritten into the `staging-mirror`
  symlink, while `aikifield.com` requests fall through to the normal rules.
- `staging-mirror` is a **server-side symlink** created once by hand inside
  `public_html/aikifield.peec.biz/`. `sync.sh` excludes it, so deploys do
  not upload over it and `--delete` does not remove it. Direct requests to
  `/staging-mirror/*` are denied (`403`) so the staging tree never leaks
  under the production domain.
- `staging.peec.biz/quantumaikido` is a redirect, not a mirror: the QA
  staging site lives in a different docroot and its root-relative links
  (`/css/…`, `/members.php`) could not resolve under this vhost's docroot.
- `staginging.peec.biz` does not exist — `staging.peec.biz` is the host.

## What's automated

- **`./sync.sh staging deploy`** — deploys the `staging` branch to
  `public_html/aikifield-staging/` on `peec.biz` (same host, same SSH key,
  same rsync excludes as prod). `./sync.sh deploy` deploys to prod at
  `public_html/aikifield.peec.biz/` (the `aikifield.com` origin).
  `staging`/`prod` can be selected as a bare word anywhere in the arguments,
  or with `--staging`/`--prod`. Run `./sync.sh help` for the full list.

- **Coaching-auth proxy is safe by default on staging.** The committed,
  non-secret `coach-config.staging.php` is deployed to the staging remote
  only — `sync.sh` excludes it from prod — and
  `includes/coach-config.load.php`'s file-existence precedence chain picks
  it up automatically:

  ```
  1. COACH_CONFIG_FILE env var   (dev/test harness only)
  2. coach-config.local.php      (developer overrides, gitignored)
  3. coach-config.staging.php    (staging remote only)
  4. coach-config.php            (production defaults)
  ```

  `coach-config.staging.php` points `COACH_BACKEND_URL` at
  `https://stub-backend.aikifield-staging.invalid` (`.invalid` TLD, RFC
  2606) so coach-api calls fail loudly instead of reaching production. A
  `coach-config.local.php` may exist in the staging docroot to point auth
  at the real staging backend — it takes precedence over
  `coach-config.staging.php`. Never put the production Cloud Run URL in
  either file on the staging remote.

- **Contact form is safe by default on staging.** `contact-handler.php`
  detects staging by hostname or a `STAGING=1` environment variable and
  no-ops instead of calling `mail()` — it validates input and redirects
  exactly like a real submission but writes a
  `STAGING contact-handler: no-op` log line instead of emailing
  `kenneth@aikifield.com`.

## Session-cookie note

`aikifield.peec.biz` and `staging.peec.biz` are different hosts, so the
PHP session cookie does not carry between them — signing in on one staging
surface does not sign you in on the other. Both surfaces use the same
docroot and the same backend config, so behaviour is otherwise identical.
The session cookie on `aikifield.peec.biz` is also isolated from
`aikifield.com` (host-only cookie), which is what we want: staging auth
never touches production sessions.

## Verify after a staging deploy

- `https://staging.peec.biz/` and `https://aikifield.peec.biz/` serve the
  staging site (check a staging-only change is visible on both).
- `https://aikifield.com/` is unchanged (production unaffected).
- `https://aikifield.com/staging-mirror/` → `403` (no staging leak).
- `https://staging.peec.biz/aikifield/` serves staging;
  `https://staging.peec.biz/quantumaikido/` → `301` →
  `https://quantumaikido.peec.biz/`.
- `http://aikifield.peec.biz/` → `https://aikifield.peec.biz/` (not
  `aikifield.com`); `http://staging.peec.biz/` → `https://staging.peec.biz/`.
- `/login.php` on a staging surface behaves per the effective config
  (`coach-config.local.php` if present, else the `.invalid` placeholder →
  502 "Coach backend unavailable").
