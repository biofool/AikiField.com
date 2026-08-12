#!/usr/bin/env python3
"""
generate_locale_files.py — Generate all 11 locale translation files.

Reads en.json and creates translated JSON files for ar, de, es, fa, fr, he, hi,
ja, ko, pt, zh with professional B2B cybersecurity translations.

Proper nouns kept in English: AikiField, CISO, SOC 2, ISO 27001, DevSecOps, SaaS,
Aikido.dev, CI/CD, AI, CVE, vCISO.

Usage:
    python3 scripts/generate_locale_files.py
"""

import json
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parent.parent
STRINGS_DIR = SITE_ROOT / "data" / "i18n-strings"

with open(STRINGS_DIR / "en.json", "r", encoding="utf-8") as f:
    en = json.load(f)

en_items = [(k, v) for k, v in en.items() if k != "_meta"]

# Translation dictionaries will be loaded from separate files
LOCALE_CODES = ["ar", "de", "es", "fa", "fr", "he", "hi", "ja", "ko", "pt", "zh"]

for locale_code in LOCALE_CODES:
    locale_file = STRINGS_DIR / f"{locale_code}.json"
    trans_file = STRINGS_DIR.parent / "translations" / f"{locale_code}.json"
    
    # Load translation dictionary if it exists
    trans_dict = {}
    if trans_file.exists():
        with open(trans_file, "r", encoding="utf-8") as f:
            trans_dict = json.load(f)
    
    # Build the locale JSON
    locale_data = {
        "_meta": {
            "locale": locale_code,
            "is_source": False,
            "version": 1,
        }
    }
    
    for key, en_value in en_items:
        translated = trans_dict.get(en_value, en_value)
        locale_data[key] = translated
    
    # Sort keys (except _meta which stays first)
    meta = locale_data.pop("_meta")
    sorted_data = {"_meta": meta}
    sorted_data.update(dict(sorted(locale_data.items())))
    
    with open(locale_file, "w", encoding="utf-8") as f:
        json.dump(sorted_data, f, indent=4, ensure_ascii=False)
        f.write("\n")
    
    trans_count = sum(1 for k, v in locale_data.items() if v != en[k])
    print(f"  {locale_code}.json: {trans_count}/{len(en_items)} keys translated")

print("\nAll locale files generated!")
