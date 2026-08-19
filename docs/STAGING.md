# Staging: aikifield.peec.biz

AikiField previously had no staging environment (`docs/coach-auth-prd.md`
explicitly noted "AikiField has no staging backend"). This adds one: a
second deploy target, `staging`, that pushes the same codebase to a separate
subdomain/docroot on the same GreenGeeks/cPanel account (`peec.biz`), with
the coaching-auth backend and the contact form both made safe by default.

## What's automated now

- **`./sync.sh staging deploy`** — deploys to
  `public_html/aikifield.peec.biz/` on `peec.biz` (same host, same SSH key,
  same rsync excludes as prod). `./sync.sh deploy` (no remote given) still
  deploys to prod at `public_html/aikifield/`, unchanged. `staging`/`prod`
  can be selected as a bare word anywhere in the arguments, or with explicit
  `--staging`/`--prod` flags — e.g. `./sync.sh staging dryrun`,
  `./sync.sh --staging deploy`, `./sync.sh --prod upload`,
  `./sync.sh --remote staging deploy` all work the same way. Run
  `./sync.sh help` to see both remotes listed.

- **Coaching-auth proxy is safe by default on staging.** A new committed,
  non-secret file, `coach-config.staging.php`, is deployed to the staging
  remote only — `sync.sh` explicitly excludes it from every other remote
  (including prod), and `includes/coach-config.load.php`'s existing
  file-existence precedence chain picks it up automatically with no
  environment variable or cPanel configuration needed:

  ```
  1. COACH_CONFIG_FILE env var   (dev/test harness only)
  2. coach-config.local.php      (developer overrides, gitignored)
  3. coach-config.staging.php    (staging remote only — new)
  4. coach-config.php            (production defaults)
  ```

  `coach-config.staging.php` points `COACH_BACKEND_URL` at
  `https://stub-backend.aikifield-staging.invalid` — a placeholder on the
  `.invalid` TLD (RFC 2606, guaranteed to never resolve). Any coach-api call
  made on staging (login, registration, chat) fails loudly with a 502
  "Coach backend unavailable" instead of silently reaching the real Cloud Run
  backend or production data. If you want to actually exercise the auth UI
  on staging, edit that file and point it at a real non-prod backend you
  control — for example run `tests/e2e/stub-backend.php` somewhere reachable
  (`php -S 0.0.0.0:8201 tests/e2e/stub-backend.php`) and use that URL. Never
  put the production Cloud Run URL there.

- **Contact form is safe by default on staging.** `contact-handler.php` now
  detects staging by hostname (`aikifield.peec.biz`) or by a `STAGING=1`
  environment variable, and on staging it no-ops instead of calling `mail()`
  — it still validates input and redirects exactly like a real submission
  (so the UI is fully testable), but writes a log line
  (`STAGING contact-handler: no-op, would have emailed ...`) instead of
  emailing `kenneth@aikifield.com`.

None of the above required manual GreenGeeks/cPanel changes to build — they
are pure application-side safety checks that activate once the subdomain
exists and is deployed to with `./sync.sh staging deploy`.

## What kkron needs to do manually (GreenGeeks/cPanel)

This session had no way to do the following — see "Why this is manual"
below.

1. **Create the subdomain.** In cPanel: Domains → Create A New Domain →
   enter `aikifield.peec.biz` as the domain, and set the document root to
   `public_html/aikifield.peec.biz` (cPanel will likely suggest this exact
   path automatically since it's the default convention for a subdomain
   named `aikifield` under the account's own `peec.biz` domain — just
   confirm it, don't let it invent a different path).
2. **DNS.** Since `peec.biz` is this cPanel account's own domain, cPanel
   normally creates the `aikifield` A/AAAA record in its own DNS zone
   automatically when you create the subdomain, and it should resolve
   within a few minutes. Confirm with `dig aikifield.peec.biz` or by
   visiting the URL. If the domain's DNS is managed externally (e.g. via
   Cloudflare, given the rest of this repo's Cloudflare integration), you
   may need to add that A/AAAA record there yourself, pointing at the same
   IP as `peec.biz` — check the Cloudflare dashboard for the zone.
3. **TLS.** Confirm cPanel/AutoSSL (or Cloudflare, if the zone is proxied
   through it) issues a certificate for `aikifield.peec.biz` — the
   production `.htaccess` deployed here forces HTTPS
   (`RewriteCond %{HTTPS} off` → redirect), so staging needs a working
   certificate too, or every request will redirect-loop or fail TLS
   verification.
4. **First deploy.** Once the subdomain exists and resolves, run
   `./sync.sh staging deploy` from a machine that actually has the
   `quantumaikido_ed25519` SSH key and network access to `peec.biz` (this
   session had neither — see below).
5. **Verify.** Visit `https://aikifield.peec.biz/`, confirm the site loads,
   then specifically test `/login.php` (should hit the placeholder backend
   and fail cleanly with a "backend unavailable" message, not silently
   succeed against prod) and `/contact.html` (submit the form, confirm no
   email arrives, and check the PHP error log for the
   `STAGING contact-handler: no-op` line to confirm the guard fired).

## Why this is manual — what this session actually checked

Before writing any code, this session verified what access it had (Step 0)
rather than assuming:

- **No `ssh` binary at all** in the sandbox (`ssh`/`sshpass` not installed).
- **No `~/.ssh/quantumaikido_ed25519`** (or any SSH key) present —
  `~/.ssh/` exists but is empty.
- **No cPanel/WHM API token** in the environment (`env | grep -i cpanel`
  and `env | grep -i whm` both empty).
- **No network egress to `peec.biz`** — the sandbox's outbound proxy
  explicitly rejects it: `curl https://peec.biz/` fails with "CONNECT
  tunnel failed, response 403", and the proxy's own status endpoint logs
  the rejection as a policy denial (`gateway answered 403 to CONNECT`) for
  `peec.biz:443`. Only `gitlab.com` has proxy-injected credentials in this
  environment.

So this session could read and write the GitLab repo (used to prepare this
branch and open the MR), but had **no way to create the cPanel subdomain,
no way to run `sync.sh staging deploy`, and no way to verify
`aikifield.peec.biz` resolves or serves anything**. Nothing in this MR
should be read as "staging is live" — it is committed and ready to deploy,
not deployed.
