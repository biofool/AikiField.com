#!/usr/bin/env bash
# audit-deps.sh — dependency vulnerability audit across committed lockfiles.
#
# Shared auditor for the SCA deploy-gating pattern (see AGENTS.md,
# "Dependency vulnerability gating"). Used by:
#   - .github/workflows/dependency-audit.yml  (scheduled layer 2 audit)
#   - deploy preflight in sync.sh / deploy.sh (layer 3):
#         ./scripts/audit-deps.sh || exit 1
#   - optionally as a pull_request check where dependency-review-action is
#     unavailable (private repos without GitHub Advanced Security)
#
# Behavior:
#   - Detects committed lockfiles/manifests per ecosystem and runs the
#     ecosystem auditor. Exits non-zero if ANY auditor reports findings.
#   - FAILS CLOSED: if a lockfile exists but its auditor is not installed,
#     prints a loud warning and exits non-zero — an unaudited deploy is an
#     ungated deploy. Deploy-script escape hatches (--skip-audit) belong in
#     the deploy script and must warn loudly + log.
#   - npm gates at severity >= high natively (--audit-level=high). Most other
#     ecosystem auditors report all severities — stricter than required.
#   - Skips node_modules/, vendor/, .venv/, and data/audit/ (fix-script audit
#     artifacts — never source manifests).
#
# Exceptions live in `vulnerability-allowlist.json` at the repo root — a dated
# allowlist with an issue link per entry:
#   {"entries": [
#     {"id": "GHSA-…", "package": "braces", "ecosystem": "npm",
#      "reason": "no patched release; build-time dep only",
#      "issue": "owner/repo#123", "expires": "YYYY-MM-DD"}]}
# Honored by the npm auditor (leaf advisories filtered via `npm audit --json`)
# and pip-audit (native --ignore-vuln). Other ecosystems do not yet support
# exceptions — an unfixable finding there blocks until the auditor gains an
# ignore mechanism. Expired entries are ignored with a loud warning.
# Never suppress findings by editing this script.
set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || cd "$(dirname "$0")/.."

status=0   # 1 = findings or unaudited manifest
found=0    # 1 = at least one manifest/lockfile detected

shopt -s globstar nullglob

have() { command -v "$1" >/dev/null 2>&1; }

missing() { # missing <tool> <manifest> <install-hint>
  echo "!! AUDIT GAP: '$2' present but '$1' is not installed — cannot audit."
  echo "   Failing closed. Install: $3"
  status=1
  found=1
}

section() { echo; echo "=== $1 ==="; }

# ---------- allowlist ----------
# Loads active (unexpired) exception ids into ALLOWLIST_IDS (space-separated).
ALLOWLIST_IDS=""
if [ -f vulnerability-allowlist.json ]; then
  if have python3; then
    _al_eval=$(python3 - <<'PY'
import json, datetime
try:
    entries = json.load(open("vulnerability-allowlist.json")).get("entries", [])
except Exception as e:
    print('echo "!! vulnerability-allowlist.json is invalid JSON: %s"' % e)
    raise SystemExit
today = datetime.date.today().isoformat()
active, expired = [], []
for e in entries:
    (expired if e.get("expires") and e["expires"] < today else active).append(e.get("id", ""))
print('ALLOWLIST_IDS="%s"' % " ".join(i for i in active if i))
for i in expired:
    print('echo "!! allowlist entry %s is EXPIRED — ignored (renew the issue or fix the dep)"' % i)
PY
)
    eval "$_al_eval"
  else
    echo "!! vulnerability-allowlist.json present but python3 unavailable — allowlist ignored."
  fi
fi

# npm_json_audit <dir>: runs `npm audit --json` and fails only on leaf
# advisories (severity >= high, matching --audit-level=high) NOT in the
# allowlist. Parent packages flagged purely through an allowlisted leaf carry
# no advisory object of their own, so leaf-only filtering is sound.
# Requires node (implied by npm).
npm_json_audit() {
  local dir="$1" tmp rc
  tmp=$(mktemp)
  (cd "$dir" && npm audit --audit-level=high --json >"$tmp" 2>/dev/null || true)
  ALLOWLIST="$ALLOWLIST_IDS" node - "$tmp" <<'JS'
const fs = require("fs");
const al = new Set((process.env.ALLOWLIST || "").split(" ").filter(Boolean));
let d; try { d = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); }
catch { console.log("npm audit produced no JSON — cannot verify findings"); process.exit(1); }
const bad = new Set();
const gated = new Set(["high", "critical"]);
for (const [name, v] of Object.entries(d.vulnerabilities || {}))
  for (const via of v.via || [])
    if (typeof via === "object" && via.url && gated.has(via.severity)) {
      const id = via.url.split("/").pop();
      if (!al.has(id)) bad.add(`${id} [${via.severity}] ${via.title || name}`);
    }
if (bad.size) { console.log("Non-allowlisted advisories:"); [...bad].forEach(b => console.log("  " + b)); process.exit(1); }
console.log("npm audit: findings, if any, are covered by vulnerability-allowlist.json");
JS
  rc=$?
  rm -f "$tmp"
  return "$rc"
}

# ---------- npm / pnpm / yarn ----------
for lock in **/package-lock.json; do
  case "$lock" in */node_modules/*|data/audit/*|*/data/audit/*) continue ;; esac
  section "npm audit: $lock"
  found=1
  if have npm; then
    if [ -n "$ALLOWLIST_IDS" ]; then
      npm_json_audit "$(dirname "$lock")" || status=1
    else
      (cd "$(dirname "$lock")" && npm audit --audit-level=high) || status=1
    fi
  else
    missing npm "$lock" "install Node.js/npm"
  fi
done

for lock in **/pnpm-lock.yaml; do
  case "$lock" in */node_modules/*|data/audit/*|*/data/audit/*) continue ;; esac
  section "pnpm audit: $lock"
  found=1
  if have pnpm; then
    (cd "$(dirname "$lock")" && pnpm audit) || status=1   # no severity flag — fails on any finding
  else
    missing pnpm "$lock" "npm i -g pnpm"
  fi
done

for lock in **/yarn.lock; do
  case "$lock" in */node_modules/*|data/audit/*|*/data/audit/*) continue ;; esac
  section "yarn audit: $lock"
  found=1
  if have yarn; then
    (cd "$(dirname "$lock")" && {
      if [ "$(yarn --version | cut -d. -f1)" -ge 2 ] 2>/dev/null; then
        yarn npm audit --severity high
      else
        yarn audit --level high
      fi
    }) || status=1
  else
    missing yarn "$lock" "npm i -g yarn / corepack enable"
  fi
done

# ---------- Python ----------
for req in **/requirements*.txt; do
  case "$req" in */node_modules/*|*/.venv/*|*/venv/*|data/audit/*|*/data/audit/*) continue ;; esac
  section "pip-audit: $req"
  found=1
  _ign=()
  for _id in $ALLOWLIST_IDS; do _ign+=(--ignore-vuln "$_id"); done
  if have pip-audit; then
    pip-audit -r "$req" "${_ign[@]}" || status=1
  elif have pipx; then
    pipx run pip-audit -r "$req" "${_ign[@]}" || status=1
  else
    missing pip-audit "$req" "pipx install pip-audit  (or: pip install pip-audit)"
  fi
done

for lock in **/uv.lock; do
  case "$lock" in */.venv/*|data/audit/*|*/data/audit/*) continue ;; esac
  section "pip-audit via uv export: $lock"
  found=1
  if have uv && have pip-audit; then
    tmp=$(mktemp)
    (cd "$(dirname "$lock")" && uv export --format requirements-txt --locked --no-dev -o "$tmp") \
      && pip-audit -r "$tmp" || status=1
    rm -f "$tmp"
  else
    missing "uv+pip-audit" "$lock" "pipx install uv pip-audit"
  fi
done

for lock in **/poetry.lock; do
  # requirements*.txt already cover the env — only warn when poetry.lock is
  # the sole Python manifest in its directory.
  dir=$(dirname "$lock")
  compgen -G "$dir/requirements*.txt" >/dev/null && continue
  [ -f "$dir/uv.lock" ] && continue
  section "poetry.lock: $lock"
  found=1
  if have poetry && have pip-audit; then
    tmp=$(mktemp)
    (cd "$dir" && poetry export -f requirements.txt --without-hashes -o "$tmp") \
      && pip-audit -r "$tmp" || status=1
    rm -f "$tmp"
  elif have osv-scanner; then
    osv-scanner scan --lockfile="$lock" || status=1
  else
    missing "poetry|osv-scanner" "$lock" \
      "pipx install poetry pip-audit, or install osv-scanner"
  fi
done

# ---------- PHP ----------
for lock in **/composer.lock; do
  case "$lock" in */vendor/*|data/audit/*|*/data/audit/*) continue ;; esac
  section "composer audit: $lock"
  found=1
  if have composer; then
    (cd "$(dirname "$lock")" && composer audit) || status=1
  else
    missing composer "$lock" "install Composer 2.4+"
  fi
done

# composer.json without a committed lockfile cannot be audited — flag it.
for manifest in **/composer.json; do
  case "$manifest" in */vendor/*|data/audit/*|*/data/audit/*) continue ;; esac
  dir=$(dirname "$manifest")
  [ -f "$dir/composer.lock" ] && continue
  echo "!! AUDIT GAP: $manifest has no committed composer.lock — cannot audit."
  echo "   Commit composer.lock (never gitignore it) or exclude dev-only tooling."
  status=1
  found=1
done

# ---------- Rust ----------
for lock in **/Cargo.lock; do
  section "cargo audit: $lock"
  found=1
  if have cargo-audit || have cargo; then
    (cd "$(dirname "$lock")" && cargo audit) || status=1
  else
    missing cargo-audit "$lock" "cargo install cargo-audit"
  fi
done

# ---------- Go ----------
for mod in **/go.mod; do
  case "$mod" in */vendor/*|data/audit/*|*/data/audit/*) continue ;; esac
  section "govulncheck: $mod"
  found=1
  if have govulncheck; then
    (cd "$(dirname "$mod")" && govulncheck ./...) || status=1
  else
    missing govulncheck "$mod" "go install golang.org/x/vuln/cmd/govulncheck@latest"
  fi
done

# ---------- Ruby ----------
for lock in **/Gemfile.lock; do
  section "bundler-audit: $lock"
  found=1
  if have bundle-audit; then
    (cd "$(dirname "$lock")" && bundle-audit check --update) || status=1
  else
    missing bundle-audit "$lock" "gem install bundler-audit"
  fi
done

# ---------- Flutter/Dart ----------
for lock in **/pubspec.lock; do
  section "dart pub audit: $lock"
  found=1
  if have dart; then
    (cd "$(dirname "$lock")" && dart pub audit) || status=1   # dart >=3.x
  else
    missing dart "$lock" "install Dart/Flutter SDK"
  fi
done

# ---------- Other ecosystems ----------
# Gradle: no lightweight local auditor — use GitHub dependency review
# (gradle dependency submission) or OWASP dependency-check. Flag presence.
for build in **/build.gradle **/build.gradle.kts; do
  case "$build" in */node_modules/*|*/.gradle/*|data/audit/*|*/data/audit/*) continue ;; esac
  echo "!! NOTE: $build — Gradle deps are not covered by this script."
  echo "   Configure gradle dependency submission + dependency-review-action,"
  echo "   or run OWASP dependency-check in CI."
  found=1
done

echo
if [ "$found" -eq 0 ]; then
  echo "No dependency manifests/lockfiles found — nothing to audit."
elif [ "$status" -ne 0 ]; then
  echo "DEPENDENCY AUDIT FAILED — findings reported or unaudited manifests above."
else
  echo "Dependency audit passed — no findings."
fi
exit "$status"
