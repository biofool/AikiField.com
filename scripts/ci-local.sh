#!/bin/bash
# ci-local.sh — run AikiField.com's checks locally, in a clean detached
# worktree. This repo has no GitHub workflows, so this is the CI: php lint
# (mirrors sync.sh's php_lint), the standalone unit tests, and the
# Playwright e2e suite. Runs in parallel with `./sync.sh staging deploy`
# (see sync.sh).
#
# Usage:
#   bash scripts/ci-local.sh                # all checks
#   bash scripts/ci-local.sh php-lint unit e2e
#   bash scripts/ci-local.sh all --post     # also publish a commit status
#
# Options:
#   --ref=<ref>                             test this ref (default: HEAD)
#   --post                                  publish a commit status via `gh api`
#
# Results land in ci-results/<ref>-<timestamp>/ under the repo root:
#   <step>.log       per-step output
#   summary.txt      known vs new failures
# Test failures are matched against tests/known-failures.txt (optional; one
# substring per line — `spec.js › test title` for Playwright). Exit code is
# non-zero only when a NEW failure (or a non-test step) fails.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMMANDS=()
REF="HEAD"
POST=false
for arg in "$@"; do
    case "$arg" in
        php-lint|unit|e2e|all) COMMANDS+=("$arg") ;;
        --ref=*) REF="${arg#--ref=}" ;;
        --post) POST=true ;;
        -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
        *) echo "ERROR: unknown argument '$arg'" >&2; exit 2 ;;
    esac
done
if [[ ${#COMMANDS[@]} -eq 0 ]]; then COMMANDS=(all); fi
if printf '%s\n' "${COMMANDS[@]}" | grep -qx all; then
    COMMANDS=(php-lint unit e2e)
fi

SHA="$(git rev-parse "$REF")"
SHORT_SHA="${SHA:0:10}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUTDIR="$ROOT/ci-results/${SHORT_SHA}-${STAMP}"
KNOWN_FILE="tests/known-failures.txt"
mkdir -p "$OUTDIR"

# --- Clean detached worktree ------------------------------------------------
WT="$(mktemp -d /tmp/af-ci-XXXXXXXX)"
rmdir "$WT"   # git worktree add wants to create the dir itself
git worktree add --detach "$WT" "$SHA" >/dev/null 2>&1 || {
    echo "ERROR: could not create worktree for $SHA" >&2; exit 1;
}
cleanup() { git worktree remove --force "$WT" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# --- Failure classification -------------------------------------------------
# $1 = log file. Extracts Playwright `✘` lines (normalised to
# `spec.js › title`) and unittest `FAIL:` lines, then splits into known
# vs new by substring match against $KNOWN_FILE.
classify_log() {
    local log="$1"
    {
        grep -oE '✘[^›]*› [^›]+ › .*' "$log" 2>/dev/null \
            | sed -E 's/.*› ([^:]+\.spec\.js):[0-9]+:[0-9]+ › /\1 › /'
        grep -oE '^(FAIL|FAILED):? [^ (]+' "$log" 2>/dev/null
    } | sort -u | while IFS= read -r key; do
        [[ -z "$key" ]] && continue
        if [[ -f "$WT/$KNOWN_FILE" ]] && grep -qF "$key" "$WT/$KNOWN_FILE"; then
            echo "KNOWN $key"
        else
            echo "NEW $key"
        fi
    done
}

STEP_STATUS=()   # "label:PASS|FAIL|KNOWN"
run_step() {
    # $1 label, rest = command (runs inside $WT)
    local label="$1"; shift
    local log="$OUTDIR/${label//[:\/]/-}.log"
    echo "==> $label"
    ( cd "$WT" && "$@" ) >"$log" 2>&1
    local rc=$?
    if [[ $rc -eq 0 ]]; then
        echo "    PASS ($log)"
        STEP_STATUS+=("$label:PASS")
        return 0
    fi
    local kinds; kinds=$(classify_log "$log")
    local new; new=$(printf '%s\n' "$kinds" | grep -c '^NEW ' || true)
    local known; known=$(printf '%s\n' "$kinds" | grep -c '^KNOWN ' || true)
    if [[ "$new" -eq 0 && "$known" -gt 0 ]]; then
        echo "    KNOWN-FAILURES-ONLY ($log)"
        printf '%s\n' "$kinds" | sed 's/^/      /'
        STEP_STATUS+=("$label:KNOWN")
        return 0
    fi
    echo "    FAIL ($log)"
    printf '%s\n' "$kinds" | grep '^NEW ' | sed 's/^/      /'
    STEP_STATUS+=("$label:FAIL")
    return 0
}

# --- Unique ports -------------------------------------------------------------
APP_PORT=$(( 21000 + RANDOM % 800 ))
STUB_PORT=$(( APP_PORT + 1000 + RANDOM % 500 ))
export AF_E2E_APP_PORT=$APP_PORT AF_E2E_STUB_PORT=$STUB_PORT CI=1

# --- Commands ---------------------------------------------------------------
for cmd in "${COMMANDS[@]}"; do
    case "$cmd" in
        php-lint)
            # Same file set as sync.sh's php_lint(): every tracked *.php
            # outside vendor/ and tests/ (stub files lint separately).
            run_step "php-lint" bash -c '
                failed=0
                while IFS= read -r -d "" f; do
                    php -l "$f" >/dev/null 2>&1 || { php -l "$f" >&2; failed=1; }
                done < <(find . -name "*.php" -not -path "./vendor/*" -not -path "./tests/*" -not -path "./.git/*" -print0)
                exit $failed
            '
            ;;
        unit)
            run_step "unit:cloudflare-ip-trust" php tests/unit/test-cloudflare-ip-trust.php
            run_step "unit:cf-token" python3 tests/unit/test_allocate_cloudflare_token.py
            run_step "unit:locale-path" node tests/test_locale_path.js
            ;;
        e2e)
            if [[ ! -d "$WT/tests/e2e/node_modules/@playwright/test" ]]; then
                ( cd "$WT/tests/e2e" && npm ci ) >"$OUTDIR/npm-ci.log" 2>&1
            fi
            run_step "e2e:chromium" env AF_E2E_APP_PORT=$APP_PORT AF_E2E_STUB_PORT=$STUB_PORT CI=1 bash tests/e2e/run.sh
            ;;
    esac
done

# --- Summary ----------------------------------------------------------------
{
    echo "ci-local run — $SHA ($SHORT_SHA) at $STAMP"
    echo "worktree: $WT (removed after run)"
    echo ""
    for s in "${STEP_STATUS[@]}"; do
        label="${s%%:*}"; state="${s##*:}"
        case "$state" in
            PASS) echo "  PASS   $label" ;;
            KNOWN) echo "  KNOWN  $label (known failures only)" ;;
            FAIL)  echo "  FAIL   $label" ;;
        esac
    done
} | tee "$OUTDIR/summary.txt"

FAILED=false
for s in "${STEP_STATUS[@]}"; do [[ "$s" == *:FAIL ]] && FAILED=true; done

if $POST && command -v gh >/dev/null 2>&1; then
    STATE=$($FAILED && echo failure || echo success)
    gh api "repos/{owner}/{repo}/statuses/$SHA" -X POST \
        -f "state=$STATE" -f "context=ci-local" \
        -f "description=$($FAILED && echo 'new failures — see ci-results' || echo 'local CI clean')" \
        >/dev/null 2>&1 && echo "Posted commit status: $STATE" || echo "NOTE: gh status post failed" >&2
fi

$FAILED && exit 1 || exit 0
