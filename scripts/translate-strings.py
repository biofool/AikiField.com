#!/usr/bin/env python3
"""
translate-strings.py — Translate i18n keys via Google Cloud Translation API.

Reads data/i18n-strings/en.json (the source English strings) and translates
all empty values into the 11 non-English locales: {es, fr, de, pt, ja, zh, ko,
ar, he, fa, hi}. Writes the translated values into each locale's JSON file.

Requires GOOGLE_TRANSLATE_API_KEY environment variable (from .env.secrets or
GCP Secret Manager).

Usage:
  python3 scripts/translate-strings.py --dry-run    # Show what would be translated
  python3 scripts/translate-strings.py --write      # Translate and write locale files
  python3 scripts/translate-strings.py --write --locale es  # One locale only

Cost: Google Cloud Translation NMT is $20/1M chars, with first 500K chars/month
free. Total volume: ~1M chars (844 keys × ~108 chars avg × 11 locales). After
the 500K free tier, cost is ~$10. The free tier resets monthly.

Never logs or prints the API key.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STRINGS_DIR = os.path.join(ROOT, 'data', 'i18n-strings')
LOCALES = ['es', 'fr', 'de', 'pt', 'ja', 'zh', 'ko', 'ar', 'he', 'fa', 'hi']

# Google Cloud Translation API language codes (map our locale codes to Google's)
GOOGLE_LANG = {
    'es': 'es', 'fr': 'fr', 'de': 'de', 'pt': 'pt',
    'ja': 'ja', 'zh': 'zh-CN', 'ko': 'ko',
    'ar': 'ar', 'he': 'he', 'fa': 'fa', 'hi': 'hi',
}

# Google Cloud Translation API endpoint (v2 — simplest, supports API key auth)
GOOGLE_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2'

# Max texts per request (Google v2 supports up to 128 text segments)
BATCH_SIZE = 100


def load_en_strings():
    """Load the English source strings."""
    with open(os.path.join(STRINGS_DIR, 'en.json'), 'r', encoding='utf-8') as f:
        return json.load(f)


def load_locale_strings(locale):
    """Load a locale's current strings (may have empty placeholder values)."""
    path = os.path.join(STRINGS_DIR, f'{locale}.json')
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def translate_batch(texts, target_lang, api_key):
    """Translate a batch of texts via Google Cloud Translation API.

    Google v2 supports up to 128 text segments per request.
    Returns a list of translated strings (same order as input).
    """
    if not api_key:
        raise ValueError("GOOGLE_TRANSLATE_API_KEY not set")

    url = f"{GOOGLE_ENDPOINT}?key={api_key}"
    body = json.dumps({
        'q': texts,
        'target': target_lang,
        'format': 'text',
    }).encode('utf-8')

    req = urllib.request.Request(url, data=body, method='POST')
    req.add_header('Content-Type', 'application/json; charset=UTF-8')

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            translations = data['data']['translations']
            return [t['translatedText'] for t in translations]
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f"Google Translation API error {e.code}: {body}") from e


def translate_locale(en_strings, locale_strings, locale, target_lang, api_key, dry_run=False):
    """Translate all missing keys for one locale.

    Only translates keys that have empty placeholder values — existing
    translations are preserved.
    """
    keys_to_translate = []
    texts_to_translate = []

    for key, en_text in en_strings.items():
        if not isinstance(en_text, str) or not en_text.strip():
            continue
        current = locale_strings.get(key, '')
        if not isinstance(current, str) or not current.strip():
            keys_to_translate.append(key)
            texts_to_translate.append(en_text)

    if not keys_to_translate:
        print(f"  {target_lang}: 0 keys to translate (all already translated)")
        return 0

    print(f"  {target_lang}: {len(keys_to_translate)} keys to translate")

    if dry_run:
        for key, text in zip(keys_to_translate[:5], texts_to_translate[:5]):
            print(f"    {key} = \"{text[:60]}...\"")
        if len(keys_to_translate) > 5:
            print(f"    ... and {len(keys_to_translate) - 5} more")
        return len(keys_to_translate)

    # Translate in batches
    translated_count = 0
    for i in range(0, len(texts_to_translate), BATCH_SIZE):
        batch = texts_to_translate[i:i + BATCH_SIZE]
        batch_keys = keys_to_translate[i:i + BATCH_SIZE]

        # Retry with backoff for transient errors
        for attempt in range(3):
            try:
                translations = translate_batch(batch, target_lang, api_key)
                break
            except Exception as e:
                if attempt == 2:
                    print(f"    ERROR: batch {i//BATCH_SIZE} failed after 3 retries: {e}", file=sys.stderr)
                    raise
                wait = 2 ** attempt
                print(f"    WARN: batch {i//BATCH_SIZE} failed (attempt {attempt+1}), retrying in {wait}s: {e}", file=sys.stderr)
                time.sleep(wait)

        for key, translation in zip(batch_keys, translations):
            locale_strings[key] = translation
            translated_count += 1

        # Rate limit: be gentle on the API
        if i + BATCH_SIZE < len(texts_to_translate):
            time.sleep(0.5)

    # Write the locale file (use original locale code, not the mapped API code)
    locale_path = os.path.join(STRINGS_DIR, f'{locale}.json')
    with open(locale_path, 'w', encoding='utf-8') as f:
        json.dump(locale_strings, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write('\n')

    print(f"    Wrote {translated_count} translations to {locale_path}")
    return translated_count


def main():
    parser = argparse.ArgumentParser(description='Translate i18n keys via Google Cloud Translation API')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be translated without making API calls')
    parser.add_argument('--write', action='store_true', help='Translate and write locale files')
    parser.add_argument('--locale', help='Translate only one locale (e.g. es, fr, ja)')
    args = parser.parse_args()

    if not args.dry_run and not args.write:
        parser.error('Must specify --dry-run or --write')

    api_key = os.environ.get('GOOGLE_TRANSLATE_API_KEY', '')
    if not args.dry_run and not api_key:
        print("ERROR: GOOGLE_TRANSLATE_API_KEY not set. Set it via:", file=sys.stderr)
        print("  export GOOGLE_TRANSLATE_API_KEY=...", file=sys.stderr)
        print("  or set -a; . ./.env.secrets; set +a", file=sys.stderr)
        return 1

    en_strings = load_en_strings()
    total_keys = sum(1 for v in en_strings.values() if isinstance(v, str) and v.strip())
    print(f"Source: {total_keys} non-empty English keys")

    locales = [args.locale] if args.locale else LOCALES
    if args.locale and args.locale not in LOCALES:
        print(f"ERROR: unknown locale '{args.locale}'. Valid: {LOCALES}", file=sys.stderr)
        return 1

    total_translated = 0
    for locale in locales:
        target_lang = GOOGLE_LANG.get(locale, locale)
        locale_strings = load_locale_strings(locale)
        count = translate_locale(en_strings, locale_strings, locale, target_lang, api_key, dry_run=args.dry_run)
        total_translated += count

    print(f"\nTotal: {total_translated} translations {'planned' if args.dry_run else 'written'}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
