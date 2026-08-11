#!/bin/bash
# End-to-end suite for AikiField.com (modeled on the quantumaikido.com suite).
#
# Usage:
#   bash tests/e2e/run.sh                 # whole suite (local stub backend)
#   bash tests/e2e/run.sh login           # one spec file
#   bash tests/e2e/run.sh --headed        # watch it in a browser
#
# Playwright starts and stops the two PHP servers itself (ports 8200/8201);
# nothing here talks to Cloud Run.
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v php >/dev/null 2>&1; then
    echo "ERROR: php is not on PATH — the suite runs the site on the PHP built-in server." >&2
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node is not on PATH — Playwright requires Node.js." >&2
    exit 1
fi

if [[ ! -d node_modules/@playwright/test ]]; then
    echo "Installing Playwright into tests/e2e/node_modules ..."
    npm install
fi

PW="node_modules/.bin/playwright"
if [[ ! -x "$PW" ]]; then
    echo "ERROR: $PW is missing. Run 'npm install' in tests/e2e." >&2
    exit 1
fi

if ! "$PW" install --dry-run chromium >/dev/null 2>&1; then
    echo "NOTE: could not verify the chromium download; run '$PW install chromium' if the run fails." >&2
fi

exec "$PW" test "$@"
