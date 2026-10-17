#!/usr/bin/env bash
# Self-test for sync.sh's exclude list (AF #126). Builds a throwaway tree of
# files that must never reach the web root next to files that must, runs
# `rsync -n` with the real EXCLUDES array, and fails if any internal path would
# be uploaded or any public path would be dropped.
#   bash scripts/test-sync-excludes.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mapfile -t lines < <(awk '/^EXCLUDES=\(/{f=1;next} f&&/^\)/{exit} f' "$here/sync.sh" | sed -e 's/^[[:space:]]*//' | grep -E "^--(exclude|include)=")
((${#lines[@]} > 0)) || { echo "FAIL: could not read EXCLUDES from sync.sh" >&2; exit 1; }
EXC=()
for l in "${lines[@]}"; do eval "EXC+=($l)"; done   # lines are fixed literals from sync.sh

src="$(mktemp -d)"; dst="$(mktemp -d)"; trap 'rm -rf "$src" "$dst"' EXIT
mk() { mkdir -p "$src/$(dirname "$1")"; : > "$src/$1"; }
DENY=(.ai-context/debt/register.yaml .ai-context/index.md .github/workflows/x.yml .dvcignore LICENSE AikiField.pdf
      test-results/.last-run.json .deploy-audit-skip.log docs/coach-auth-prd.md docs/STAGING.md scripts/audit-deps.sh
      sync.sh tests/e2e/x.js .env.secrets .git/config coach-config.local.php data/ratelimit/a.json)
ALLOW=(index.html login.php coach-login.js games/exercises/index.php beta/index.php for-review/documents/ocr/a.md
       .htaccess css/redesign.css data/i18n-config.json)
for f in "${DENY[@]}" "${ALLOW[@]}"; do mk "$f"; done

out="$(rsync -rn --out-format='%n' "${EXC[@]}" "$src/" "$dst/")"
fail=0
for f in "${DENY[@]}"; do
  if grep -qxF "$f" <<<"$out"; then echo "FAIL: $f would be uploaded"; fail=1; fi
done
for f in "${ALLOW[@]}"; do
  if ! grep -qxF "$f" <<<"$out"; then echo "FAIL: $f would NOT be uploaded"; fail=1; fi
done
((fail == 0)) && echo "ok: ${#DENY[@]} internal paths excluded, ${#ALLOW[@]} public paths kept"
exit "$fail"
