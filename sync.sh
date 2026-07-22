#!/bin/bash

# ============================================
#  AikiField.com — Sync to peec.biz
#  Based on quantumaikido.com/web/sync.sh
#  Pushes the site to public_html/aikifield.com/ on peec.biz
# ============================================

LOCAL_PATH="$(cd "$(dirname "$0")" && pwd)/"
REMOTE_HOST="peec.biz"
REMOTE_USER="peecbiz"
REMOTE_PATH="public_html/aikifield.com/"
SSH_KEY="$HOME/.ssh/quantumaikido_ed25519"

# Known remote servers: "host|user|path|description"
KNOWN_REMOTES=(
    "peec.biz|peecbiz|public_html/aikifield.com/|Production server (peec.biz)"
)

SCP_KEY_ARGS=(-i "$SSH_KEY" -o LogLevel=ERROR)

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
    --exclude='.devin/'
    --exclude='input/'
    --exclude='logs/'
    --exclude='.env'
    --exclude='.DS_Store'
    --exclude='Thumbs.db'
    --exclude='*.tmp'
    --exclude='sync.sh'
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
        upload|download|dryrun|deploy|sftp|ftp|help)
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
unset -f _apply_known_remote

[[ -n "$REMOTE_PATH_FLAG" ]] && REMOTE_PATH="$REMOTE_PATH_FLAG"
RSYNC_REMOTE="${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"

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

    *)
        echo "Unknown command: ${CMD:-(none)}"
        echo "Run '$0 help' for usage."
        exit 1
        ;;
esac
