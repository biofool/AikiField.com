#!/usr/bin/env python3
"""
translate-strings.py — Translate i18n strings via Google Cloud Translation API.

Reads data/i18n-strings/en.json, finds keys with empty placeholder values
in each non-English locale file, translates them via Google Cloud Translation
NMT, and writes the translations back to the locale files.

Each locale batch is wrapped with CloudManagement intent/actual reporting
(see CloudManagement issue #52): before translating a locale the script
declares an intent with the expected character count and cost; if the hub
denies the intent (budget exceeded) the locale is skipped rather than run.
After the batch completes (or fails) an actual report is sent. Use
``--no-report`` to skip CloudManagement entirely (local/offline runs).

Usage:
  python3 scripts/translate-strings.py --dry-run          # Show plan, no API calls
  python3 scripts/translate-strings.py --locale es          # Translate one locale
  python3 scripts/translate-strings.py --locale es fr ja   # Translate specific locales
  python3 scripts/translate-strings.py                     # Translate all 11 locales
  python3 scripts/translate-strings.py --no-report         # Skip CloudManagement reporting
  python3 scripts/translate-strings.py --validate          # Validate translations only

Requires:
  - Google Cloud Translation API enabled
  - gcloud auth application-default login OR GOOGLE_APPLICATION_CREDENTIALS
  - google-cloud-translate Python package (pip install google-cloud-translate)
  - CloudManagement hub reachable (or --no-report) for intent/actual reporting

Cost: $20/M chars after 500K/month free tier. Total ~1M chars = ~$10.
"""

import argparse
import json
import logging
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STRINGS_DIR = os.path.join(ROOT, 'data', 'i18n-strings')
LOCALES = ['es', 'fr', 'de', 'pt', 'ja', 'zh', 'ko', 'ar', 'he', 'fa', 'hi']
BATCH_SIZE = 100  # Google Translate API max 100 texts per request

# CloudManagement reporting config (issue #52). The vendored client is
# stdlib-only and lives at scripts/cloud_management_client/. Reporting is
# best-effort: if the hub is unreachable or the package is missing, the
# script still runs — it just logs a WARNING and proceeds without intent
# gating. Set --no-report to skip entirely (local/offline runs).
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

log = logging.getLogger('translate-strings')

# Google Cloud Translation NMT pricing (verify before relying on this):
#   https://cloud.google.com/translate/pricing
# $20 per 1M characters, after a 500K/month free tier. We use this to
# estimate expected_cost_usd on the intent; the hub does its own budget
# math against the project's budget_amount_usd.
TRANSLATE_USD_PER_MILLION_CHARS = 20.0
TRANSLATE_FREE_TIER_CHARS_PER_MONTH = 500_000


def _estimated_cost_usd(chars, prior_chars=0):
    """Marginal cost estimate for ``chars`` of translation, accounting for
    the 500K/month free tier shared across all usage. ``prior_chars`` is the
    cumulative character count already translated in this run (or month) so
    the free tier isn't double-counted per locale. The hub applies its own
    budget math; this is just the expected-cost figure attached to the intent."""
    free_remaining = max(0, TRANSLATE_FREE_TIER_CHARS_PER_MONTH - prior_chars)
    billable = max(0, chars - free_remaining)
    return round(billable * TRANSLATE_USD_PER_MILLION_CHARS / 1_000_000, 4)


def _build_cm_client(args):
    """Build a CloudManagementClient from env/config, or return None if
    reporting is disabled (--no-report) or the vendored package is missing."""
    if args.no_report:
        return None
    try:
        from cloud_management_client import CloudManagementClient
    except ImportError:
        log.warning('cloud_management_client not vendored at scripts/cloud_management_client/ — reporting disabled (use --no-report to silence)')
        return None
    project_id = args.cm_project or os.environ.get('CLOUDMANAGEMENT_PROJECT_ID', '')
    if not project_id:
        log.warning('CLOUDMANAGEMENT_PROJECT_ID not set — reporting disabled (use --no-report to silence)')
        return None
    return CloudManagementClient(
        project_id=project_id,
        base_url=args.cm_url or os.environ.get('CLOUDMANAGEMENT_URL', 'http://127.0.0.1:8080'),
        source_repo='AikiField.com',
        application='translate-strings.py',
    )


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4, sort_keys=True)
        f.write('\n')


def translate_batch(texts, target_locale, client):
    """Translate a batch of texts via Google Cloud Translation API."""
    from google.cloud import translate_v2 as translate
    results = []
    for text in texts:
        if not text or not text.strip():
            results.append('')
            continue
        try:
            resp = client.translate(text, target_language=target_locale, source_language='en', format_='text')
            results.append(resp.get('translatedText', ''))
        except Exception as e:
            print(f'  ERROR translating "{text[:50]}...": {e}', file=sys.stderr)
            results.append('')  # Fall back to empty — t() will use English
    return results


def translate_locale(locale, en_strings, dry_run, cm_client=None, prior_chars=0):
    """Translate all empty-placeholder keys for one locale.

    When ``cm_client`` is provided, declares an intent before translating
    and reports actuals after. If the hub denies the intent (budget
    exceeded), the locale is skipped without making any API calls.
    ``prior_chars`` is the cumulative character count already translated in
    this run, used to account for the shared 500K/month free tier in the
    cost estimate.
    """
    locale_path = os.path.join(STRINGS_DIR, f'{locale}.json')
    locale_strings = load_json(locale_path)

    # Find keys that need translation (empty value, has English source)
    keys_to_translate = [k for k in en_strings if locale_strings.get(k, '') == '' and en_strings[k].strip()]

    if not keys_to_translate:
        print(f'  {locale}: 0 keys to translate (all done)')
        return 0, 0

    total_chars = sum(len(en_strings[k]) for k in keys_to_translate)
    print(f'  {locale}: {len(keys_to_translate)} keys, {total_chars:,} chars')

    if dry_run:
        # Show sample
        for k in keys_to_translate[:3]:
            print(f'    {k}: "{en_strings[k][:60]}..."')
        if len(keys_to_translate) > 3:
            print(f'    ... and {len(keys_to_translate) - 3} more')
        return len(keys_to_translate), total_chars

    # CloudManagement intent gating — declare before cost-incurring calls.
    # If the hub denies (budget exceeded), skip the locale rather than spend.
    intent = None
    job_id = ''
    if cm_client is not None:
        job_id = f'aikifield-i18n-{locale}-{int(time.time())}'
        expected_cost = _estimated_cost_usd(total_chars, prior_chars=prior_chars)
        try:
            intent = cm_client.declare_intent(
                job_id=job_id,
                job_name=f'i18n-translation-{locale}',
                provider='google',
                api='translate-v2',
                expected_calls=len(keys_to_translate),
                expected_cost_usd=expected_cost,
                rate_limit_rpm=120,  # BATCH_SIZE=100 + 0.5s sleep ≈ 120/min
                source_repo='AikiField.com',
                application='translate-strings.py',
                metadata={'locale': locale, 'chars': total_chars},
            )
        except Exception as exc:
            log.warning('cloud_management declare_intent failed for %s: %s — proceeding without gating', locale, exc)
            intent = None
        if intent is not None and not intent.approved:
            print(f'    SKIPPED: CloudManagement denied intent (budget exceeded). reason={intent.reason}')
            log.warning('cloud_management denied intent locale=%s job=%s reason=%s', locale, job_id, intent.reason)
            return 0, total_chars
        if intent is not None and intent.intent_id:
            print(f'    Intent declared: {intent.intent_id} (cost≈${expected_cost})')

    # Initialize Google Translate client
    try:
        from google.cloud import translate_v2 as translate
        client = translate.Client()
    except ImportError:
        print('ERROR: google-cloud-translate not installed. Run: pip install google-cloud-translate', file=sys.stderr)
        sys.exit(1)

    # Translate in batches
    translated_count = 0
    failed = False
    try:
        for i in range(0, len(keys_to_translate), BATCH_SIZE):
            batch_keys = keys_to_translate[i:i + BATCH_SIZE]
            batch_texts = [en_strings[k] for k in batch_keys]

            print(f'    Batch {i // BATCH_SIZE + 1}/{(len(keys_to_translate) + BATCH_SIZE - 1) // BATCH_SIZE} ({len(batch_keys)} keys)...', end=' ', flush=True)

            translations = translate_batch(batch_texts, locale, client)

            for j, key in enumerate(batch_keys):
                if translations[j]:
                    locale_strings[key] = translations[j]
                    translated_count += 1

            print('done')

            # Rate limiting (be gentle on the API)
            time.sleep(0.5)

        # Save
        save_json(locale_path, locale_strings)
        print(f'    Saved {locale_path}: {translated_count} translations')
    except Exception as exc:
        failed = True
        print(f'    FAILED: {exc}', file=sys.stderr)
        log.error('translation failed locale=%s error=%s', locale, exc)
        raise
    finally:
        # Report actuals to CloudManagement (best-effort, never raises).
        if cm_client is not None and intent is not None and intent.intent_id:
            actual_cost = _estimated_cost_usd(total_chars, prior_chars=prior_chars)
            status = 'failed' if failed else 'completed'
            try:
                cm_client.report_actual(
                    intent_id=intent.intent_id,
                    job_id=job_id,
                    provider='google',
                    api='translate-v2',
                    actual_calls=translated_count,
                    actual_cost_usd=actual_cost,
                    status=status,
                    sync=True,
                )
            except Exception as exc:
                log.warning('cloud_management report_actual failed for %s: %s', locale, exc)
            try:
                cm_client.flush()
            except Exception as exc:
                log.warning('cloud_management flush failed for %s: %s', locale, exc)

    return translated_count, total_chars


def validate_locale(locale, en_strings):
    """Validate that all keys have non-empty translations."""
    locale_path = os.path.join(STRINGS_DIR, f'{locale}.json')
    locale_strings = load_json(locale_path)
    
    empty = [k for k in en_strings if locale_strings.get(k, '') == '' and en_strings[k].strip()]
    total = len(en_strings)
    translated = total - len(empty)
    
    status = 'OK' if not empty else f'{len(empty)} EMPTY'
    print(f'  {locale}: {translated}/{total} translated ({status})')
    
    if empty and len(empty) <= 5:
        for k in empty:
            print(f'    EMPTY: {k}')
    
    return len(empty) == 0


def main():
    ap = argparse.ArgumentParser(description='Translate i18n strings via Google Cloud Translation API')
    ap.add_argument('--dry-run', action='store_true', help='Show plan without making API calls')
    ap.add_argument('--locale', nargs='*', default=None, help='Specific locales to translate (default: all 11)')
    ap.add_argument('--validate', action='store_true', help='Validate translations only (no API calls)')
    ap.add_argument('--no-report', action='store_true', help='Skip CloudManagement intent/actual reporting (local/offline runs)')
    ap.add_argument('--cm-url', default=None, help='CloudManagement hub base URL (default: $CLOUDMANAGEMENT_URL or http://127.0.0.1:8080)')
    ap.add_argument('--cm-project', default=None, help='CloudManagement project_id (default: $CLOUDMANAGEMENT_PROJECT_ID)')
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(name)s: %(message)s')

    en_path = os.path.join(STRINGS_DIR, 'en.json')
    en_strings = load_json(en_path)
    print(f'Loaded en.json: {len(en_strings)} keys\n')

    locales = args.locale if args.locale else LOCALES

    # Validate unknown locales
    for loc in locales:
        if loc not in LOCALES:
            print(f'ERROR: Unknown locale "{loc}". Supported: {LOCALES}', file=sys.stderr)
            sys.exit(1)

    if args.validate:
        print('=== Validation ===')
        all_ok = True
        for loc in locales:
            if not validate_locale(loc, en_strings):
                all_ok = False
        print(f'\n{"ALL OK" if all_ok else "SOME EMPTY"}')
        sys.exit(0 if all_ok else 1)

    if args.dry_run:
        print('=== Dry Run (no API calls) ===')
    else:
        print('=== Translating via Google Cloud Translation API ===')
        try:
            from google.cloud import translate_v2 as translate
            translate.Client()
        except ImportError:
            print('Installing google-cloud-translate...', file=sys.stderr)
            import subprocess
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'google-cloud-translate'])
            print('Installed.\n')

    # Build CloudManagement client (None if --no-report or unconfigured)
    cm_client = _build_cm_client(args)
    if cm_client is None:
        if args.no_report:
            print('CloudManagement reporting: DISABLED (--no-report)\n')
        else:
            print('CloudManagement reporting: disabled (not configured — set CLOUDMANAGEMENT_PROJECT_ID or use --no-report)\n')
    else:
        print(f'CloudManagement reporting: ENABLED (project={cm_client.project_id})\n')

    print()
    total_keys = 0
    total_chars = 0
    prior_chars = 0  # cumulative chars translated this run, for free-tier accounting

    for loc in locales:
        keys, chars = translate_locale(loc, en_strings, args.dry_run, cm_client=cm_client, prior_chars=prior_chars)
        total_keys += keys
        total_chars += chars
        prior_chars += chars

    print(f'\n=== Summary ===')
    print(f'Locales: {len(locales)}')
    print(f'Keys translated: {total_keys}')
    print(f'Characters: {total_chars:,}')
    if not args.dry_run:
        print(f'Estimated cost: ${max(0, total_chars - 500000) * 20 / 1_000_000:.2f} (after 500K free tier)')

    if not args.dry_run:
        print(f'\n=== Validation ===')
        all_ok = True
        for loc in locales:
            if not validate_locale(loc, en_strings):
                all_ok = False
        print(f'\n{"ALL OK" if all_ok else "SOME EMPTY — check output above"}')

    # Flush any pending async CloudManagement reports before exiting.
    if cm_client is not None:
        try:
            cm_client.flush()
        except Exception as exc:
            log.warning('cloud_management final flush failed: %s', exc)


if __name__ == '__main__':
    main()
