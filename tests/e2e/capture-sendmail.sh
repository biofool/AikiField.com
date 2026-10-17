#!/bin/bash
# Stand-in for sendmail in the e2e suite (php -d sendmail_path=...).
# PHP's mail() pipes the whole message (headers and body) to this script on
# stdin; the specs read it back from .mail-capture/. Nothing is ever sent.
dir="${AF_E2E_MAIL_DIR:-$(dirname "$0")/.mail-capture}"
mkdir -p "$dir"
cat > "$dir/$(date +%s%N)-$$.eml"
