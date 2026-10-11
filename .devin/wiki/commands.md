# Commands

- **Preview locally:** open `index.html` in a browser, or run a static server
  (e.g. `python3 -m http.server`).
- **Deploy:** `./sync.sh dryrun` then `./sync.sh deploy` (default prod). Use
  `--staging` or `--prod` to select the target explicitly.
- **DVC sync:** `dvc pull` / `dvc push`.
- **Git:** standard `git add` / `git commit` / `git push` on `main`.

No test suite, linter, or build pipeline -- this is a hand-authored static
site. Validate changes by visual review and accessibility checks.
