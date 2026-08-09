#!/bin/bash

# ============================================
#  AikiField.com — Sync to peec.biz
#  Based on quantumaikido.com/web/sync.sh
#  Pushes the site to public_html/aikifield.com/ on peec.biz
# ============================================

LOCAL_PATH="$(cd "$(dirname "$0")" && pwd)/"
REMOTE_HOST="peec.biz"
REMOTE_USER="peecbiz"
REMOTE_PATH="public_html/aikifield/"
SSH_KEY="$HOME/.ssh/quantumaikido_ed25519"

# Known remote servers: "host|user|path|description"
KNOWN_REMOTES=(
    "peec.biz|peecbiz|public_html/aikifield/|Production server (peec.biz)"
)

SCP_KEY_ARGS=(-i "$SSH_KEY" -o LogLevel=ERROR)
LOGS_DIR="${LOCAL_PATH}/logs/"
ACCESS_LOG_PATH="access-logs/aikifield.com.peec.biz-ssl_log"
ARCHIVE_LOG_PATH="logs/aikifield.com.peec.biz-ssl_log"

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
    --exclude='.env'
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
            [ -n "$CMD" ] && [ -z "$SCOPE" ] && SCOPE="$arg"
            ;;
    esac
done
unset _next_p _next_remote

# Resolve remote host
_apply_known_remote() {
    local host="$1"
    for entry in "${KNOWN_REMOTES[@]}"; do
        IFS='|' read -r rh ru rp rd <<< "$entry"
        if [[ "$rh" == "$host" ]]; then
            REMOTE_HOST="$rh"; REMOTE_USER="$ru"; REMOTE_PATH="$rp"
            return 0
        fi
    done
    REMOTE_HOST="$host"
}

if [[ -n "$REMOTE_HOST_ARG" ]]; then
    _apply_known_remote "$REMOTE_HOST_ARG"
elif [[ "$CMD" == "help" ]]; then
    REMOTE_HOST="peec.biz"
else
    if (( ${#KNOWN_REMOTES[@]} == 1 )); then
        # Only one known remote — auto-select it, no prompt
        IFS='|' read -r REMOTE_HOST REMOTE_USER REMOTE_PATH _rd <<< "${KNOWN_REMOTES[0]}"
    else
        echo ""
        echo "No remote server specified. Select one:"
        echo ""
        for i in "${!KNOWN_REMOTES[@]}"; do
            IFS='|' read -r rh ru rp rd <<< "${KNOWN_REMOTES[$i]}"
            printf "  %d) %-38s [%s@%s:%s]\n" "$((i+1))" "$rd" "$ru" "$rh" "$rp"
        done
        echo ""
        read -p "Choice [1-${#KNOWN_REMOTES[@]}] or --remote hostname: " _REMOTE_CHOICE
        if [[ "$_REMOTE_CHOICE" =~ ^[0-9]+$ ]] && (( _REMOTE_CHOICE >= 1 && _REMOTE_CHOICE <= ${#KNOWN_REMOTES[@]} )); then
            IFS='|' read -r REMOTE_HOST REMOTE_USER REMOTE_PATH _rd <<< "${KNOWN_REMOTES[$((_REMOTE_CHOICE-1))]}"
        elif [[ -n "$_REMOTE_CHOICE" ]]; then
            _apply_known_remote "$_REMOTE_CHOICE"
        else
            echo "No remote specified. Exiting."
            exit 1
        fi
        unset _REMOTE_CHOICE
    fi
fi
unset -f _apply_known_remote

[[ -n "$REMOTE_PATH_FLAG" ]] && REMOTE_PATH="$REMOTE_PATH_FLAG"
RSYNC_REMOTE="${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"

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
        scp "${SCP_KEY_ARGS[@]}" "${LOG_USER}@${LOG_HOST}:~/logs/aikifield.com.peec.biz-ssl_log-${MONTH}.gz" "${LOGS_DIR}archive-ssl-${MONTH}.gz" 2>/dev/null
        if [ -f "${LOGS_DIR}archive-ssl-${MONTH}.gz" ]; then
            gunzip -f "${LOGS_DIR}archive-ssl-${MONTH}.gz" 2>/dev/null
        fi
    done

    # Combine logs using Python for cross-platform compatibility
    python_cmd << 'EOF'
import os
import glob

log_dir = os.path.expanduser("$LOGS_DIR")
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
            do_rsync -avz --dry-run --delete "${EXCLUDES[@]}" -e "$RSYNC_SSH_CMD" "$RSYNC_LOCAL" "$RSYNC_REMOTE"
        fi
        ;;

    deploy)
        echo "========================================"
        echo "  DEPLOY — git pull + push + rsync to peec.biz"
        echo "========================================"
        echo ""
        echo "Pulling from remote..."
        git -C "$(dirname "$0")" pull --no-rebase || { echo "ERROR: git pull failed — resolve conflicts before deploying."; exit 1; }
        echo ""
        echo "Pushing to git remote..."
        git -C "$(dirname "$0")" push
        echo ""
        echo "Uploading to peec.biz..."
        do_rsync -avz --delete --chmod=F644,D755 "${EXCLUDES[@]}" -e "$RSYNC_SSH_CMD" "$RSYNC_LOCAL" "$RSYNC_REMOTE"
        echo ""
        echo "Deploy complete."
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
        echo "Usage: $0 [command] [options]"
        echo ""
        echo "Commands:"
        echo "  deploy       - git pull + git push + rsync to peec.biz (no prompt)"
        echo "  upload       - Upload to server (dry-run preview, then confirm)"
        echo "  download     - Download from server (dry-run preview, then confirm)"
        echo "  dryrun       - Show what upload would do (no prompt)"
        echo "  dryrun download - Show what download would do (no prompt)"
        echo "  sftp         - Open an interactive SFTP session"
        echo "  logs         - Fetch latest server access logs only"
        echo "  report       - Fetch logs and generate statistics report"
        echo "  help         - Show this help message"
        echo ""
        echo "Options:"
        echo "  --remote HOST  - Specify remote server (skips interactive prompt)"
        echo "  -p PATH        - Override remote path"
        echo "  -y / --yes     - Skip confirmation prompts"
        echo ""
        echo "Remote: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"
        echo ""
        echo "Excluded from sync: .git/, input/, .devin/, *.md, *.py, *.sh, sync.sh, SITE_CONTENT.md"
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
