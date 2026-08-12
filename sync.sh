#!/bin/bash

# ============================================
#  AikiField.com — Sync to peec.biz
#  Based on quantumaikido.com/web/sync.sh
#  Pushes the site to public_html/aikifield.com/ on peec.biz
#
#  Two deploy targets share this script:
#    ./sync.sh deploy          -> prod    (public_html/aikifield/)
#    ./sync.sh staging deploy  -> staging (public_html/aikifield.peec.biz/)
#  "staging"/"prod" are recognized anywhere in the argument list (see
#  KNOWN_REMOTES below) — no separate flag needed. Omitting a remote name
#  always defaults to prod, matching the script's historical behavior.
# ============================================

LOCAL_PATH="$(cd "$(dirname "$0")" && pwd)/"
REMOTE_HOST="peec.biz"
REMOTE_USER="peecbiz"
REMOTE_PATH="public_html/aikifield/"
REMOTE_NAME="prod"
SSH_KEY="$HOME/.ssh/quantumaikido_ed25519"

# Known remote servers: "name|host|user|path|description"
# "name" is what you type on the command line (e.g. `./sync.sh staging deploy`)
# and is also used to keep staging-only files out of the prod sync — see the
# coach-config.staging.php exclude below.
KNOWN_REMOTES=(
    "prod|peec.biz|peecbiz|public_html/aikifield/|Production server (peec.biz)"
    "staging|peec.biz|peecbiz|public_html/aikifield.peec.biz/|Staging server (aikifield.peec.biz)"
)
DEFAULT_REMOTE_NAME="prod"

SCP_KEY_ARGS=(-i "$SSH_KEY" -o LogLevel=ERROR)
LOGS_DIR="${LOCAL_PATH}/logs/"
# The cPanel log name is aikifield.peec.biz, NOT aikifield.com.peec.biz —
# the wrong name made every log download fail silently into "archived data only".
ACCESS_LOG_PATH="access-logs/aikifield.peec.biz-ssl_log"
ARCHIVE_LOG_PATH="logs/aikifield.peec.biz-ssl_log"

if [[ "$(uname -s)" == "Linux" ]]; then
    RSYNC_BIN="rsync"
    RSYNC_KEY="$SSH_KEY"
    RSYNC_LOCAL="$LOCAL_PATH"
    RSYNC_SSH_CMD="ssh -i $RSYNC_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o LogLevel=ERROR"
else
    # cwrsync paths (Cygwin-based)
    RSYNC_BIN="/c/ProgramData/chocolatey/lib/rsync/tools/bin/rsync.exe"
    RSYNC_SSH="/cygdrive/c/ProgramData/chocolatey/lib/rsync/tools/bin/ssh.exe"
    RSYNC_KEY="/cygdrive/c/Users/sensie-ok/.ssh/quantumaikido_ed25519"
    RSYNC_KNOWN="/cygdrive/c/Users/sensie-ok/.ssh/known_hosts"
    RSYNC_LOCAL="/cygdrive/c/Users/sensie-ok/websites/aikifield.com/"
    RSYNC_SSH_CMD="$RSYNC_SSH -i $RSYNC_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=$RSYNC_KNOWN"
fi
RSYNC_REMOTE="${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"

# Always-excluded files — non-web content stays local
EXCLUDES=(
    --exclude='.git/'
    --exclude='.dvc/'
    --exclude='.devin/'
    --exclude='.well-known/'
    --exclude='cgi-bin/'
    --exclude='input/'
    --exclude='logs/'
    # .env* not .env — a bare .env does not match .env.secrets, which holds
    # the live Cloudflare API token. Never let it reach the web root.
    --exclude='.env*'
    --exclude='.gitignore'
    --exclude='.gitattributes'
    --exclude='*.dvc'
    --exclude='scripts/'
    --exclude='data/audit/'
    --exclude='.DS_Store'
    --exclude='Thumbs.db'
    --exclude='*.tmp'
    --exclude='sync.sh'
    --exclude='_*preview*.html'
    --exclude='SITE_CONTENT.md'
    --exclude='*.md'
    --exclude='*.py'
    --exclude='*.sh'
    --exclude='*.bat'
    --exclude='*.ps1'
    --exclude='AGENTS.md'
    --exclude='.claude/'
    --exclude='.idea/'
    --exclude='__pycache__/'
    --exclude='.venv/'
    --exclude='node_modules/'
    --exclude='tests/'
)

do_rsync() {
    if [[ "$(uname -s)" == "Linux" ]]; then
        "$RSYNC_BIN" "$@"
    else
        MSYS_NO_PATHCONV=1 "$RSYNC_BIN" "$@"
    fi
}

python_cmd() {
    if [[ "$(uname -s)" == "Linux" ]]; then
        python3 "$@"
    else
        /c/Python312/python.exe "$@"
    fi
}

php_lint() {
    # Lint every .php file in the repo before deploying so a parse error
    # never reaches production. Excludes vendor/ (third-party) and tests/
    # (stub files added separately). Skip in emergencies with
    # SKIP_PHP_LINT=1 ./sync.sh deploy
    if [[ "${SKIP_PHP_LINT:-0}" == "1" ]]; then
        echo "PHP syntax check: SKIPPED (SKIP_PHP_LINT=1)"
        return 0
    fi
    local count=0
    local failed=0
    local f
    while IFS= read -r -d '' f; do
        count=$((count + 1))
        if ! php -l "$f" >/dev/null 2>&1; then
            echo "✗ PHP syntax error in $f:" >&2
            php -l "$f" >&2
            failed=1
        fi
    done < <(find "$LOCAL_PATH" -name '*.php' -not -path '*/vendor/*' -not -path '*/tests/*' -not -path '*/.git/*' -print0)
    if (( failed )); then
        echo "ERROR: PHP syntax check failed — deploy aborted." >&2
        exit 1
    fi
    echo "PHP syntax check: $count files OK"
}

# Names of all known remotes (e.g. "prod", "staging") — recognized as a bare
# positional argument anywhere on the command line, same as `--remote NAME`.
KNOWN_REMOTE_NAMES=()
for entry in "${KNOWN_REMOTES[@]}"; do
    IFS='|' read -r rn _ru _rp _rd <<< "$entry"
    KNOWN_REMOTE_NAMES+=("$rn")
done

# Pre-parse arguments
CMD=""
YES=0
REMOTE_PATH_FLAG=""
REMOTE_HOST_ARG=""
_next_p=0
_next_remote=0
for arg in "$@"; do
    if [[ $_next_p -eq 1 ]]; then REMOTE_PATH_FLAG="$arg"; _next_p=0; continue; fi
    if [[ $_next_remote -eq 1 ]]; then REMOTE_HOST_ARG="$arg"; _next_remote=0; continue; fi
    case "$arg" in
        -p) _next_p=1 ;;
        --remote) _next_remote=1 ;;
        -y|--yes) YES=1 ;;
        upload|download|dryrun|deploy|sftp|ftp|logs|report|help)
            [ -z "$CMD" ] && CMD="$arg"
            ;;
        *)
            _is_remote_name=0
            for rn in "${KNOWN_REMOTE_NAMES[@]}"; do
                if [[ "$arg" == "$rn" ]]; then
                    [ -z "$REMOTE_HOST_ARG" ] && REMOTE_HOST_ARG="$arg"
                    _is_remote_name=1
                    break
                fi
            done
            if [[ $_is_remote_name -eq 0 ]]; then
                [ -n "$CMD" ] && [ -z "$SCOPE" ] && SCOPE="$arg"
            fi
            ;;
    esac
done
unset _next_p _next_remote _is_remote_name rn

# Resolve remote host. Matches against either the remote's short "name"
# (e.g. "staging") or its raw hostname, so both `--remote staging` and
# `--remote peec.biz` work.
_apply_known_remote() {
    local key="$1"
    for entry in "${KNOWN_REMOTES[@]}"; do
        IFS='|' read -r rn rh ru rp rd <<< "$entry"
        if [[ "$rn" == "$key" || "$rh" == "$key" ]]; then
            REMOTE_NAME="$rn"; REMOTE_HOST="$rh"; REMOTE_USER="$ru"; REMOTE_PATH="$rp"
            return 0
        fi
    done
    REMOTE_HOST="$key"
    REMOTE_NAME=""
}

if [[ -n "$REMOTE_HOST_ARG" ]]; then
    _apply_known_remote "$REMOTE_HOST_ARG"
else
    # No remote given anywhere on the command line — always default to prod,
    # non-interactively, so `./sync.sh deploy` keeps working unattended.
    _apply_known_remote "$DEFAULT_REMOTE_NAME"
fi
unset -f _apply_known_remote

[[ -n "$REMOTE_PATH_FLAG" ]] && REMOTE_PATH="$REMOTE_PATH_FLAG"
RSYNC_REMOTE="${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"

# coach-config.staging.php points the coaching-auth proxy at a placeholder,
# never-resolving backend (see that file's header comment) — it must only
# ever land on the staging remote. If it ever reached prod it would silently
# override coach-config.php and break real coaching auth there, so exclude it
# from every remote except staging.
if [[ "$REMOTE_NAME" != "staging" ]]; then
    EXCLUDES+=(--exclude='coach-config.staging.php')
fi

fetch_logs() {
    echo "Fetching latest log files..."
    mkdir -p "$LOGS_DIR"

    # Logs always live on peec.biz regardless of which machine we're on
    local LOG_HOST="peec.biz"
    local LOG_USER="peecbiz"

    # Download current access log (overwrites - it's the live log)
    # Report scp failures instead of silencing them (never fail silently)
    if scp "${SCP_KEY_ARGS[@]}" "${LOG_USER}@${LOG_HOST}:~/${ACCESS_LOG_PATH}" "${LOGS_DIR}current-ssl.log" 2>/dev/null; then
        echo "  ✓ Current live log downloaded"
    else
        echo "  ⚠ WARNING: Failed to download current live log from ~/${ACCESS_LOG_PATH} — report will only show archived data" >&2
    fi

    # Download archived logs for current month + previous 5 months using Python for date math
    python_cmd -c "
import os
from datetime import datetime, timedelta

log_dir = '''$LOGS_DIR'''
os.makedirs(log_dir, exist_ok=True)

months = []
today = datetime.now()
for i in range(6):
    month_date = today - timedelta(days=30*i)
    month_str = month_date.strftime('%b-%Y')
    months.append(month_str)

print('\\n'.join(months))
" | while read MONTH; do
        scp "${SCP_KEY_ARGS[@]}" "${LOG_USER}@${LOG_HOST}:~/${ARCHIVE_LOG_PATH}-${MONTH}.gz" "${LOGS_DIR}archive-ssl-${MONTH}.gz" 2>/dev/null
        if [ -f "${LOGS_DIR}archive-ssl-${MONTH}.gz" ]; then
            gunzip -f "${LOGS_DIR}archive-ssl-${MONTH}.gz" 2>/dev/null
        fi
    done

    # Combine logs using Python for cross-platform compatibility.
    # LOGS_DIR is passed through the environment: the heredoc delimiter is
    # quoted so the shell does not expand $LOGS_DIR inside it.
    if ! LOGS_DIR="$LOGS_DIR" python_cmd << 'EOF'
import os
import glob

log_dir = os.path.expanduser(os.environ["LOGS_DIR"])
combined_path = os.path.join(log_dir, 'combined.log')

seen = set()
with open(combined_path, 'w', encoding='utf-8', errors='ignore') as out:
    # Read current log first
    current = os.path.join(log_dir, 'current-ssl.log')
    if os.path.exists(current):
        with open(current, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if line not in seen:
                    out.write(line)
                    seen.add(line)

    # Read archive logs
    for filepath in glob.glob(os.path.join(log_dir, 'archive-ssl-*')):
        if os.path.isfile(filepath):
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    if line not in seen:
                        out.write(line)
                        seen.add(line)

print(f"Combined {len(seen)} unique log lines")
EOF
    then
        echo "  ✗ ERROR: failed to combine log files into ${LOGS_DIR}combined.log" >&2
        return 1
    fi

    echo "Logs updated: ${LOGS_DIR}combined.log"
}

generate_report() {
    LOG_FILE="${LOGS_DIR}combined.log"

    if [ ! -f "$LOG_FILE" ]; then
        echo "No log file found. Run '$0 logs' first."
        exit 1
    fi

    python_cmd -c "
import re
import json
from collections import defaultdict, Counter
from datetime import datetime

with open('''$LOG_FILE''', 'r', errors='ignore') as f:
    lines = f.readlines()

# Parse logs (AikiField has no upload.php or review.php — no filtering needed)
total = len(lines)

# Extract unique IPs (first field)
ips = set()
pages = Counter()
status_codes = Counter()
referrers = Counter()
dates_dict = defaultdict(int)

bot_pattern = re.compile(r'(bot|spider|crawler|slurp|bing|google|yandex|baidu|semrush|ahrefs|mj12|dotbot|bytespider)', re.IGNORECASE)
media_ext = re.compile(r'\.(css|js|png|jpg|jpeg|gif|ico|woff|woff2|svg|webp)$')

for line in lines:
    parts = line.split()
    if len(parts) >= 9:
        # IP
        ips.add(parts[0])

        # Date (4th field, remove leading '[')
        date_str = parts[3].lstrip('[')
        dates_dict[date_str[:11]] += 1

        # Page (7th field)
        if len(parts) > 6:
            page = parts[6]
            if not media_ext.search(page):
                pages[page] += 1

        # Status code (9th field)
        status_codes[parts[8]] += 1

        # Referrer (in quotes, typically after status and size)
        if len(parts) > 10:
            referrer = ' '.join(parts[10:])
            if '\"' in referrer:
                try:
                    ref = referrer.split('\"')[1]
                    if ref != '-' and 'aikifield' not in ref.lower():
                        referrers[ref] += 1
                except:
                    pass

# Count bots
bot_count = sum(1 for line in lines if bot_pattern.search(line))
human_count = total - bot_count
unique_ips = len(ips)

# Output report
print()
print('========================================')
print('  AIKIFIELD.COM VISITOR STATISTICS')
print(f'  Generated: {datetime.now().strftime(\"%a %b %d %H:%M:%S %Z %Y\")}')
print('========================================')
print()
print('SUMMARY')
print(f'  Total Requests:  {total}')
print(f'  Unique Visitors: {unique_ips}')
print(f'  Bot Traffic:     {bot_count}')
print(f'  Human Traffic:   {human_count}')
print()
print('TOP 15 PAGES')
print('----------------------------------------')
for page, count in pages.most_common(15):
    print(f'{count:6d} {page}')
print()
print('REQUESTS BY DAY')
print('----------------------------------------')
for date, count in sorted(dates_dict.items()):
    print(f'{count:6d} {date}')
print()
print('TOP REFERRERS')
print('----------------------------------------')
for ref, count in referrers.most_common(10):
    print(f'{count:6d} {ref}')
print()
print('HTTP STATUS CODES')
print('----------------------------------------')
for code, count in sorted(status_codes.items(), key=lambda x: -x[1]):
    print(f'{count:6d} {code}')
print()
" 2>/dev/null || echo "  (error generating report)"
}

case "$CMD" in
    upload)
        echo ""
        echo "========================================"
        echo "  DRY RUN - Preview of upload changes"
        echo "========================================"
        echo ""
        do_rsync -avz --dry-run --delete --chmod=F644,D755 "${EXCLUDES[@]}" -e "$RSYNC_SSH_CMD" "$RSYNC_LOCAL" "$RSYNC_REMOTE"
        echo ""
        echo "========================================"
        if [[ $YES -eq 1 ]]; then CONFIRM=y; else read -p "Proceed with upload? (y/N): " CONFIRM; fi
        if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
            echo ""
            echo "Uploading..."
            do_rsync -avz --delete --chmod=F644,D755 "${EXCLUDES[@]}" -e "$RSYNC_SSH_CMD" "$RSYNC_LOCAL" "$RSYNC_REMOTE"
            echo ""
            echo "Upload complete."
        else
            echo "Upload cancelled."
        fi
        ;;

    download)
        echo ""
        echo "========================================"
        echo "  DRY RUN - Preview of download changes"
        echo "========================================"
        echo ""
        do_rsync -avz --dry-run --exclude='.git/' -e "$RSYNC_SSH_CMD" "$RSYNC_REMOTE" "$RSYNC_LOCAL"
        echo ""
        echo "========================================"
        if [[ $YES -eq 1 ]]; then CONFIRM=y; else read -p "Proceed with download? (y/N): " CONFIRM; fi
        if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
            echo ""
            echo "Downloading..."
            do_rsync -avz --exclude='.git/' -e "$RSYNC_SSH_CMD" "$RSYNC_REMOTE" "$RSYNC_LOCAL"
            echo ""
            echo "Download complete."
        else
            echo "Download cancelled."
        fi
        ;;

    dryrun)
        echo ""
        echo "========================================"
        echo "  DRY RUN - Preview only (no changes)"
        echo "========================================"
        echo ""
        if [ "$SCOPE" == "download" ]; then
            do_rsync -avz --dry-run --exclude='.git/' -e "$RSYNC_SSH_CMD" "$RSYNC_REMOTE" "$RSYNC_LOCAL"
        else
            RSYNC_OUT=$(do_rsync -avz --dry-run --delete "${EXCLUDES[@]}" -e "$RSYNC_SSH_CMD" "$RSYNC_LOCAL" "$RSYNC_REMOTE")
            echo "$RSYNC_OUT"
            echo ""
            printf '%s\n' "$RSYNC_OUT" \
                | sed -n '/^sending incremental file list$/,/^$/p' \
                | sed '1d;$d' \
                | sed 's/^deleting //' \
                | python_cmd "${LOCAL_PATH}scripts/cloudflare_migrate.py" --purge
        fi
        ;;

    deploy)
        echo "========================================"
        echo "  DEPLOY — git pull + push + rsync to peec.biz"
        echo "========================================"
        echo ""
        php_lint
        echo ""
        echo "Pulling from remote..."
        git -C "$(dirname "$0")" pull --no-rebase || { echo "ERROR: git pull failed — resolve conflicts before deploying."; exit 1; }
        echo ""
        echo "Pushing to git remote..."
        git -C "$(dirname "$0")" push
        echo ""
        echo "Uploading to peec.biz..."
        RSYNC_OUT=$(do_rsync -avz --delete --chmod=F644,D755 "${EXCLUDES[@]}" -e "$RSYNC_SSH_CMD" "$RSYNC_LOCAL" "$RSYNC_REMOTE")
        RSYNC_STATUS=$?
        echo "$RSYNC_OUT"
        if [ $RSYNC_STATUS -ne 0 ]; then
            echo "ERROR: rsync failed (exit $RSYNC_STATUS) — skipping cache purge." >&2
            exit $RSYNC_STATUS
        fi
        echo ""
        # Purge only what changed. rsync's file list is between the header line
        # and the trailing blank/summary lines.
        printf '%s\n' "$RSYNC_OUT" \
            | sed -n '/^sending incremental file list$/,/^$/p' \
            | sed '1d;$d' \
            | sed 's/^deleting //' \
            | python_cmd "${LOCAL_PATH}scripts/cloudflare_migrate.py" --purge --apply || DEPLOY_WARN=1
        echo ""
        if [ -n "$DEPLOY_WARN" ]; then
            echo "Deploy complete — but the edge cache was NOT purged (see above)."
        else
            echo "Deploy complete."
        fi
        ;;

    sftp|ftp)
        echo ""
        echo "========================================"
        echo "  Opening SFTP session"
        echo "  User: $REMOTE_USER"
        echo "  Host: $REMOTE_HOST"
        echo "  Key:  $SSH_KEY"
        echo "========================================"
        echo ""
        sftp -i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}"
        ;;

    logs)
        fetch_logs
        ;;

    report)
        fetch_logs
        generate_report
        ;;

    help)
        echo "Usage: $0 [remote] [command] [options]"
        echo ""
        echo "Commands:"
        echo "  deploy       - git pull + git push + rsync to the remote (no prompt)"
        echo "  upload       - Upload to server (dry-run preview, then confirm)"
        echo "  download     - Download from server (dry-run preview, then confirm)"
        echo "  dryrun       - Show what upload would do (no prompt)"
        echo "  dryrun download - Show what download would do (no prompt)"
        echo "  sftp         - Open an interactive SFTP session"
        echo "  logs         - Fetch latest server access logs only"
        echo "  report       - Fetch logs and generate statistics report"
        echo "  help         - Show this help message"
        echo ""
        echo "Remotes (bare word, anywhere in the arguments — default: prod):"
        for entry in "${KNOWN_REMOTES[@]}"; do
            IFS='|' read -r rn rh ru rp rd <<< "$entry"
            printf "  %-10s - %-38s [%s@%s:%s]\n" "$rn" "$rd" "$ru" "$rh" "$rp"
        done
        echo ""
        echo "  e.g. ./sync.sh staging deploy   ./sync.sh staging dryrun   ./sync.sh deploy"
        echo ""
        echo "Options:"
        echo "  --remote NAME|HOST - Specify remote by name or hostname (same as the bare word above)"
        echo "  -p PATH            - Override remote path"
        echo "  -y / --yes         - Skip confirmation prompts"
        echo ""
        echo "Environment:"
        echo "  SKIP_PHP_LINT=1 - Skip the pre-deploy PHP syntax check (emergencies only)"
        echo ""
        echo "Remote: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}${REMOTE_NAME:+ (name: $REMOTE_NAME)}"
        echo ""
        echo "Excluded from sync: .git/, input/, .devin/, *.md, *.py, *.sh, sync.sh, SITE_CONTENT.md"
        echo "Also excluded from every remote except staging: coach-config.staging.php"
        ;;

    "")
        # No command given — show help instead of an error
        exec "$0" help
        ;;
    *)
        echo "Unknown command: ${CMD:-(none)}"
        echo "Run '$0 help' for usage."
        exit 1
        ;;
esac
