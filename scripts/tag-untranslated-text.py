#!/usr/bin/env python3
"""
tag-untranslated-text.py — Add data-i18n attributes to untranslated body text.

Scans HTML pages for <p>, <li>, <span>, <div> elements with visible text
content but no data-i18n attribute. Generates translation keys (page.slug),
adds data-i18n="key" to the elements, and adds the English text to
data/i18n-strings/en.json. Other locale files get the key with an empty
string value (t() falls back to English).

Usage:
  python3 scripts/tag-untranslated-text.py --dry-run    # Show what would change
  python3 scripts/tag-untranslated-text.py --write      # Apply changes

Key generation:
  - Key format: <page_prefix>.<slug>
  - page_prefix: index.html → "index", approach.html → "approach", etc.
  - slug: first 5 words of text, lowercase, underscores, max 40 chars
  - Deduplicated per page with a numeric suffix if needed
"""

import argparse
import json
import os
import re
import sys
from html.parser import HTMLParser
from html import unescape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = [
    'index.html', 'approach.html', 'services.html', 'process.html',
    'contact.html', 'assessment.html', 'case-studies.html',
    'fractional-ciso.html', 'fractional-ciso-for-saas.html',
    'ai-devsecops-vulnerability-remediation.html', 'board-security-clarity.html',
]
TAGS_TO_TAG = {'p', 'li', 'span', 'div'}
MIN_TEXT_LENGTH = 3  # Skip elements with very short text
LOCALES = ['en', 'es', 'fr', 'de', 'pt', 'ja', 'zh', 'ko', 'ar', 'he', 'fa', 'hi']
STRINGS_DIR = os.path.join(ROOT, 'data', 'i18n-strings')

# Skip elements that contain only whitespace or are likely structural
SKIP_PATTERNS = [
    re.compile(r'^\s*$'),  # whitespace only
    re.compile(r'^\s*[©·•—–\-\|]\s*$'),  # single punctuation
]


def page_prefix(filename):
    """index.html → 'index', fractional-ciso.html → 'fractional_ciso'"""
    base = filename.replace('.html', '')
    return base.replace('-', '_')


def slugify(text, max_len=40):
    """Generate a slug from text: first 5 words, lowercase, underscores."""
    # Clean text
    text = unescape(text).strip()
    # Remove non-alphanumeric chars, split into words
    words = re.findall(r'[a-zA-Z0-9]+', text.lower())
    # Take first 5 words
    slug = '_'.join(words[:5])
    # Truncate
    if len(slug) > max_len:
        slug = slug[:max_len].rsplit('_', 1)[0]
    return slug or 'text'


def load_json(path):
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4, sort_keys=True)
        f.write('\n')


class TextExtractor(HTMLParser):
    """Extract text elements that need data-i18n attributes."""

    def __init__(self, target_tags):
        super().__init__(convert_charrefs=True)
        self.target_tags = target_tags
        self.results = []  # List of (tag, attrs_dict, text, byte_offset)
        self._current_tag = None
        self._current_attrs = None
        self._current_text = []
        self._depth = 0
        self._tag_stack = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in self.target_tags:
            attrs_dict = dict(attrs)
            # Only track if no data-i18n already
            if 'data-i18n' not in attrs_dict:
                self._tag_stack.append((tag, attrs_dict, self.getpos()))
                self._current_text = []
            else:
                self._tag_stack.append(None)  # Already has data-i18n, skip
        elif self._tag_stack:
            # Nested tag inside a target tag — still skip
            self._tag_stack.append(None)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self._tag_stack:
            entry = self._tag_stack.pop()
            if entry is not None:
                t, attrs, pos = entry
                if t == tag:
                    text = ''.join(self._current_text).strip()
                    if text and len(text) >= MIN_TEXT_LENGTH:
                        if not any(p.match(text) for p in SKIP_PATTERNS):
                            self.results.append((t, attrs, text, pos))

    def handle_data(self, data):
        if self._tag_stack and self._tag_stack[-1] is not None:
            self._current_text.append(data)


def add_data_i18n_to_html(html_content, replacements):
    """Add data-i18n attributes to elements at specific line positions.
    
    replacements: list of (line_num, tag, text, key)
    Returns modified HTML content.
    """
    lines = html_content.split('\n')
    
    # Group replacements by line number
    by_line = {}
    for line_num, tag, text, key in replacements:
        by_line.setdefault(line_num, []).append((tag, text, key))
    
    for line_num, items in by_line.items():
        idx = line_num - 1  # 0-based
        if idx >= len(lines):
            continue
        line = lines[idx]
        for tag, text, key in items:
            # Find the opening tag on this line and add data-i18n
            # Pattern: <tag ...> — add data-i18n before the closing >
            # Be careful not to match closing tags or self-closing tags
            pattern = rf'(<{tag}\b[^>]*?)(\s*>)'
            def add_attr(m):
                attrs = m.group(1)
                # Don't add if already has data-i18n
                if 'data-i18n=' in attrs:
                    return m.group(0)
                return f'{attrs} data-i18n="{key}"{m.group(2)}'
            new_line = re.sub(pattern, add_attr, line, count=1)
            lines[idx] = new_line
            line = new_line
    
    return '\n'.join(lines)


def process_page(page_file, en_strings, dry_run):
    """Process a single HTML page. Returns (key_count, keys_added)."""
    filepath = os.path.join(ROOT, page_file)
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    prefix = page_prefix(page_file)
    parser = TextExtractor(TAGS_TO_TAG)
    parser.feed(html)

    # Generate unique keys
    used_keys = set(en_strings.keys())
    page_keys = set()
    replacements = []  # (line_num, tag, text, key)

    for tag, attrs, text, pos in parser.results:
        slug = slugify(text)
        key = f"{prefix}.{slug}"
        # Deduplicate within page
        if key in page_keys:
            # Add suffix
            i = 2
            while f"{key}_{i}" in page_keys or f"{key}_{i}" in used_keys:
                i += 1
            key = f"{key}_{i}"
        # Check global uniqueness
        if key in used_keys:
            # Check if the existing English text matches
            if en_strings.get(key, '').strip() == text.strip():
                # Same text, reuse the key
                pass
            else:
                # Different text, add suffix
                i = 2
                while f"{key}_{i}" in used_keys:
                    i += 1
                key = f"{key}_{i}"

        page_keys.add(key)
        used_keys.add(key)
        replacements.append((pos[0], tag, text, key))
        
        # Add to en.json if not present
        if key not in en_strings:
            en_strings[key] = text

    if not replacements:
        return 0, []

    # Apply changes
    new_html = add_data_i18n_to_html(html, replacements)
    
    if not dry_run:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_html)

    return len(replacements), [(k, t) for _, _, t, k in replacements]


def main():
    ap = argparse.ArgumentParser(description='Add data-i18n attributes to untranslated text')
    ap.add_argument('--dry-run', action='store_true', help='Show what would change without writing')
    ap.add_argument('--write', action='store_true', help='Apply changes to HTML and JSON files')
    args = ap.parse_args()

    if not args.dry_run and not args.write:
        print('Error: specify --dry-run or --write', file=sys.stderr)
        sys.exit(1)

    # Load en.json
    en_path = os.path.join(STRINGS_DIR, 'en.json')
    en_strings = load_json(en_path)
    initial_en_count = len(en_strings)

    print(f'Loaded en.json: {initial_en_count} keys\n')

    total_tagged = 0
    all_new_keys = []

    for page in PAGES:
        count, keys_texts = process_page(page, en_strings, args.dry_run)
        total_tagged += count
        new_keys = [k for k, _ in keys_texts if k not in all_new_keys]
        all_new_keys.extend(new_keys)
        print(f'  {page}: {count} elements tagged')
        if args.dry_run and new_keys:
            for k, t in keys_texts[:3]:
                print(f'    {k} = "{t[:60]}..."')
            if len(keys_texts) > 3:
                print(f'    ... and {len(keys_texts) - 3} more')

    print(f'\nTotal: {total_tagged} elements tagged, {len(all_new_keys)} new keys')

    if args.write:
        # Save en.json
        save_json(en_path, en_strings)
        print(f'Updated en.json: {len(en_strings)} keys ({len(en_strings) - initial_en_count} new)')

        # Update other locale files with empty placeholders
        for locale in LOCALES:
            if locale == 'en':
                continue
            path = os.path.join(STRINGS_DIR, f'{locale}.json')
            strings = load_json(path)
            added = 0
            for key in all_new_keys:
                if key not in strings:
                    strings[key] = ""  # Empty — t() falls back to English
                    added += 1
            if added > 0:
                save_json(path, strings)
                print(f'  Updated {locale}.json: +{added} placeholder keys')
    else:
        print('\nDry-run: no files written. Use --write to apply.')


if __name__ == '__main__':
    main()
