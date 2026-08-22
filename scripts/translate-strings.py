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
  python3 scripts/translate-strings.py --write --free-tier-only  # Stop at 500K chars

Cost: Google Cloud Translation NMT is $20/1M chars, with first 500K chars/month
free. Total volume: ~1M chars (844 keys × ~108 chars avg × 11 locales). After
the 500K free tier, cost is ~$10. The free tier resets monthly.

Free-tier logic:
  --free-tier-only stops translating when the cumulative character count for
  this run reaches the free-tier limit (default 500,000 chars). This prevents
  accidental paid usage. Without the flag, the script translates everything
  but reports the cost breakdown at the end.

Translation cache:
  API responses are cached in data/translation-cache.json keyed by
  (source_text, target_lang). On subsequent runs, cached translations are
  used instead of making new API calls. This avoids re-translating unchanged
  strings and keeps usage within the free tier. The cache file is committed
  to git so it persists across runs and machines.

Never logs or prints the API key.
"""

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STRINGS_DIR = os.path.join(ROOT, 'data', 'i18n-strings')
DATA_DIR = os.path.join(ROOT, 'data')
CACHE_PATH = os.path.join(DATA_DIR, 'translation-cache.json')
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

# Free tier: 500,000 chars/month free ($10 credit, resets monthly)
FREE_TIER_CHARS = 500_000
PAID_RATE_PER_MILLION = 20.00  # $20/1M chars


# ---------------------------------------------------------------------------
# Translation cache
# ---------------------------------------------------------------------------

_cache: dict[str, dict[str, str]] = {}  # target_lang -> {cache_key: translation}
_cache_loaded = False
_cache_dirty = False


def _cache_key(text: str) -> str:
    """Stable cache key from source text (sha256 hex digest)."""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def load_cache():
    """Load the translation cache from disk."""
    global _cache_loaded, _cache
    if _cache_loaded:
        return
    _cache_loaded = True
    if os.path.isfile(CACHE_PATH):
        try:
            with open(CACHE_PATH, 'r', encoding='utf-8') as f:
                _cache = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"WARN: translation cache corrupt, starting fresh: {e}", file=sys.stderr)
            _cache = {}


def save_cache():
    """Write the translation cache to disk if it changed."""
    global _cache_dirty
    if not _cache_dirty:
        return
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CACHE_PATH, 'w', encoding='utf-8') as f:
        json.dump(_cache, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write('\n')
    _cache_dirty = False


def cache_get(text: str, target_lang: str) -> str | None:
    """Return cached translation or None."""
    lang_cache = _cache.get(target_lang, {})
    return lang_cache.get(_cache_key(text))


def cache_put(text: str, target_lang: str, translation: str) -> None:
    """Store a translation in the cache."""
    global _cache_dirty
    if target_lang not in _cache:
        _cache[target_lang] = {}
    _cache[target_lang][_cache_key(text)] = translation
    _cache_dirty = True


# ---------------------------------------------------------------------------
# Character tracking
# ---------------------------------------------------------------------------

class CharTracker:
    """Tracks characters sent to the API and estimates cost."""

    def __init__(self, free_tier_only: bool = False):
        self.total_chars = 0
        self.cached_chars = 0  # chars served from cache (no API call)
        self.api_chars = 0     # chars actually sent to the API
        self.free_tier_only = free_tier_only
        self.stopped_at_limit = False

    def add_api(self, chars: int) -> bool:
        """Record chars sent to the API. Returns False if limit exceeded."""
        self.total_chars += chars
        self.api_chars += chars
        if self.free_tier_only and self.api_chars > FREE_TIER_CHARS:
            self.stopped_at_limit = True
            return False
        return True

    def add_cached(self, chars: int) -> None:
        """Record chars served from cache (no API cost)."""
        self.total_chars += chars
        self.cached_chars += chars

    def report(self) -> str:
        """Return a cost summary string."""
        free_chars = min(self.api_chars, FREE_TIER_CHARS)
        paid_chars = max(0, self.api_chars - FREE_TIER_CHARS)
        paid_cost = paid_chars / 1_000_000 * PAID_RATE_PER_MILLION
        lines = [
            f"  Total chars processed: {self.total_chars:,}",
            f"  Served from cache:     {self.cached_chars:,} (free)",
            f"  Sent to API:           {self.api_chars:,}",
            f"  Free tier used:        {free_chars:,} / {FREE_TIER_CHARS:,}",
            f"  Paid chars:            {paid_chars:,}",
            f"  Estimated paid cost:   ${paid_cost:.2f}",
        ]
        if self.stopped_at_limit:
            lines.append("  STOPPED: free-tier limit reached (--free-tier-only)")
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Core translation functions
# ---------------------------------------------------------------------------

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


def translate_locale(en_strings, locale_strings, locale, target_lang, api_key,
                     dry_run=False, tracker=None):
    """Translate all missing keys for one locale.

    Only translates keys that have empty placeholder values — existing
    translations are preserved. Uses the translation cache to avoid
    re-translating unchanged strings.
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

    # Check cache — split into cached hits and uncached misses
    uncached_keys = []
    uncached_texts = []
    cached_count = 0

    if not dry_run:
        load_cache()

    for key, text in zip(keys_to_translate, texts_to_translate):
        if not dry_run:
            cached = cache_get(text, target_lang)
            if cached:
                locale_strings[key] = cached
                cached_count += 1
                if tracker:
                    tracker.add_cached(len(text))
                continue
        uncached_keys.append(key)
        uncached_texts.append(text)

    if cached_count > 0:
        print(f"  {target_lang}: {len(keys_to_translate)} keys to translate "
              f"({cached_count} cached, {len(uncached_keys)} new)")

    if not uncached_keys:
        # All served from cache — still write the locale file
        if not dry_run:
            locale_path = os.path.join(STRINGS_DIR, f'{locale}.json')
            with open(locale_path, 'w', encoding='utf-8') as f:
                json.dump(locale_strings, f, ensure_ascii=False, indent=2, sort_keys=True)
                f.write('\n')
            print(f"    Wrote {cached_count} cached translations to {locale_path}")
        return cached_count

    if dry_run:
        for key, text in zip(uncached_keys[:5], uncached_texts[:5]):
            print(f"    {key} = \"{text[:60]}...\"")
        if len(uncached_keys) > 5:
            print(f"    ... and {len(uncached_keys) - 5} more")
        return len(uncached_keys)

    # Translate uncached texts in batches
    translated_count = cached_count
    for i in range(0, len(uncached_texts), BATCH_SIZE):
        batch = uncached_texts[i:i + BATCH_SIZE]
        batch_keys = uncached_keys[i:i + BATCH_SIZE]

        # Check free-tier limit before making the API call
        batch_chars = sum(len(t) for t in batch)
        if tracker and not tracker.add_api(batch_chars):
            print(f"    STOPPED: free-tier limit reached at batch {i//BATCH_SIZE}", file=sys.stderr)
            break

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

        for key, text, translation in zip(batch_keys, batch, translations):
            locale_strings[key] = translation
            cache_put(text, target_lang, translation)
            translated_count += 1

        # Rate limit: be gentle on the API
        if i + BATCH_SIZE < len(uncached_texts):
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
    parser.add_argument('--free-tier-only', action='store_true',
                        help=f'Stop translating when free-tier limit ({FREE_TIER_CHARS:,} chars) is reached')
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

    tracker = CharTracker(free_tier_only=args.free_tier_only)

    total_translated = 0
    for locale in locales:
        if tracker.stopped_at_limit:
            print(f"\nSkipping {locale} (free-tier limit reached)")
            break
        target_lang = GOOGLE_LANG.get(locale, locale)
        locale_strings = load_locale_strings(locale)
        count = translate_locale(
            en_strings, locale_strings, locale, target_lang, api_key,
            dry_run=args.dry_run, tracker=tracker,
        )
        total_translated += count

    # Save cache after all locales are done
    if not args.dry_run:
        save_cache()

    print(f"\nTotal: {total_translated} translations {'planned' if args.dry_run else 'written'}")
    print(f"\nCost summary:")
    print(tracker.report())
    if not args.dry_run and tracker.cached_chars > 0:
        print(f"\n  Cache file: {CACHE_PATH}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
