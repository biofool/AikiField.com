#!/usr/bin/env python3
"""
apply_i18n_attrs.py — Add data-i18n attributes to HTML elements.

Reads en.json and builds a text-to-key lookup per page, then adds
data-i18n="key" attributes to matching h1-h4, nav links, buttons, labels,
and other translatable elements in each HTML file.

Uses BeautifulSoup for parsing/identification but inserts attributes via
regex on the original HTML text to preserve formatting.

Usage:
    python3 scripts/apply_i18n_attrs.py              # Dry-run: show what would change
    python3 scripts/apply_i18n_attrs.py --apply       # Apply changes to HTML files

Skips elements that already have a data-i18n attribute.
"""

import argparse
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

# ── Configuration ────────────────────────────────────────────────────
SITE_ROOT = Path(__file__).resolve().parent.parent
HTML_FILES = [
    "index.html",
    "process.html",
    "approach.html",
    "services.html",
    "case-studies.html",
    "assessment.html",
    "contact.html",
    "fractional-ciso.html",
    "fractional-ciso-for-saas.html",
    "ai-devsecops-vulnerability-remediation.html",
    "board-security-clarity.html",
]
EN_JSON = SITE_ROOT / "data" / "i18n-strings" / "en.json"

# Tags that get data-i18n attributes on their text content
I18N_TAGS = ["h1", "h2", "h3", "h4", "label", "summary", "option", "p"]
# Button-like classes
I18N_BTN_CLASSES = re.compile(r"af-btn")
# Nav link classes
I18N_NAV_CLASSES = re.compile(r"af-nav__link|af-nav__cta")
# Eyebrow paragraph classes
I18N_EYEBROW_CLASSES = re.compile(r"af-eyebrow")


def clean_text(text):
    """Normalize whitespace for comparison."""
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def get_page_prefix(filename):
    """Get the page prefix from filename."""
    name = filename.replace(".html", "")
    if name == "index":
        return "index"
    return name


def build_text_lookup(strings, page_prefix):
    """Build a text-to-key lookup for a given page prefix.

    Priority order for shared keys: nav > common > footer > a11y.
    This ensures nav links get nav.* keys, not footer.* keys.
    """
    lookup = {}
    # Process in priority order: page-specific first, then nav, common, footer, a11y
    priority_prefixes = [page_prefix, "nav", "common", "footer", "a11y"]

    for priority_prefix in priority_prefixes:
        for key, value in strings.items():
            if key == "_meta":
                continue
            prefix = key.split(".")[0]
            if prefix != priority_prefix:
                continue
            normalized = clean_text(value)
            if not normalized:
                continue
            if normalized not in lookup:
                lookup[normalized] = key

    return lookup


def insert_attr_in_tag(line, tag_name, sourcepos, attr_str):
    """Insert an attribute into an HTML opening tag on a given line.

    sourcepos is the 0-based position of the '<' in the line.
    Returns the modified line, or the original line if insertion failed.
    """
    # Find the opening tag starting at sourcepos
    # The tag starts with <tagname and ends with >
    tag_start = line[sourcepos:]
    # Match the opening tag: <tagname ...> or <tagname ... />
    # We need to find the closing > of this opening tag
    pattern = re.compile(
        r"^(<" + re.escape(tag_name) + r")(\s[^>]*?)?(/?>)",
        re.IGNORECASE,
    )
    m = pattern.match(tag_start)
    if not m:
        return line, False

    # Check if the attribute is already present
    existing_attrs = m.group(2) or ""
    if f'data-i18n' in existing_attrs:
        return line, False

    # Insert the attribute before the closing > or />
    before = line[:sourcepos]
    tag_open = m.group(1)  # <tagname
    attrs = existing_attrs
    closing = m.group(3)  # > or />

    # Build the new tag
    new_tag = f"{tag_open}{attrs} {attr_str}{closing}"
    new_line = before + new_tag + line[sourcepos + len(m.group(0)):]

    return new_line, True


def apply_attrs_to_page(filepath, page_prefix, lookup, apply_changes=False):
    """Add data-i18n attributes to matching elements in a single HTML page."""

    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    soup = BeautifulSoup(html, "html.parser")

    # Collect all modifications: (sourceline, sourcepos, tag_name, attr_str)
    modifications = []
    seen_positions = set()  # Avoid double-modifying the same tag

    def schedule_modification(tag, attr_name, attr_value):
        """Schedule an attribute insertion for a tag."""
        if tag.sourceline is None or tag.sourcepos is None:
            return False
        pos_key = (tag.sourceline, tag.sourcepos)
        if pos_key in seen_positions:
            return False
        seen_positions.add(pos_key)
        modifications.append((
            tag.sourceline,
            tag.sourcepos,
            tag.name,
            f'{attr_name}="{attr_value}"',
        ))
        return True

    def try_add_data_i18n(tag):
        """Try to add data-i18n to a tag based on its text content."""
        if tag.get("data-i18n"):
            return False
        if tag.find_parent(["script", "style"]):
            return False
        text = clean_text(tag.get_text())
        if not text:
            return False
        key = lookup.get(text)
        if not key:
            return False
        return schedule_modification(tag, "data-i18n", key)

    # ── Headings (h1-h4) ─────────────────────────────────────────────
    for tag_name in ["h1", "h2", "h3", "h4"]:
        for tag in soup.find_all(tag_name):
            if tag.find_parent("footer"):
                continue
            if tag.find_parent("nav", attrs={"aria-label": "Primary"}):
                continue
            try_add_data_i18n(tag)

    # ── Nav links ────────────────────────────────────────────────────
    nav = soup.find("nav", attrs={"aria-label": "Primary"})
    if nav:
        for a in nav.find_all("a"):
            try_add_data_i18n(a)

    # ── Nav toggle label (aria-label → data-i18n-attr) ───────────────
    for label in soup.find_all("label", class_=re.compile(r"af-nav__toggle")):
        if label.get("data-i18n-attr"):
            continue
        aria_label = label.get("aria-label")
        if aria_label:
            key = lookup.get(clean_text(aria_label))
            if key:
                schedule_modification(label, "data-i18n-attr", f"aria-label:{key}")

    # ── Skip link ────────────────────────────────────────────────────
    for a in soup.find_all("a", class_=re.compile(r"af-skip-link")):
        try_add_data_i18n(a)

    # ── Eyebrow text ─────────────────────────────────────────────────
    for tag in soup.find_all("p", class_=I18N_EYEBROW_CLASSES):
        if tag.find_parent("footer"):
            continue
        try_add_data_i18n(tag)

    # ── Buttons and CTAs ─────────────────────────────────────────────
    for tag in soup.find_all(["a", "button"], class_=I18N_BTN_CLASSES):
        try_add_data_i18n(tag)

    # ── Form labels ──────────────────────────────────────────────────
    for label in soup.find_all("label"):
        try_add_data_i18n(label)

    # ── Select options ───────────────────────────────────────────────
    for opt in soup.find_all("option"):
        try_add_data_i18n(opt)

    # ── FAQ summaries ────────────────────────────────────────────────
    for summary in soup.find_all("summary"):
        try_add_data_i18n(summary)

    # ── Footer ───────────────────────────────────────────────────────
    footer = soup.find("footer")
    if footer:
        for h3 in footer.find_all("h3"):
            try_add_data_i18n(h3)
        for a in footer.find_all("a"):
            try_add_data_i18n(a)
        tagline = footer.find("p", class_=re.compile(r"af-footer__tagline"))
        if tagline:
            try_add_data_i18n(tagline)
        legal = footer.find("div", class_=re.compile(r"af-footer__legal"))
        if legal:
            try_add_data_i18n(legal)

    # ── Brand tagline ────────────────────────────────────────────────
    for span in soup.find_all("span", class_=re.compile(r"af-brand__tagline")):
        try_add_data_i18n(span)

    # ── Placeholder text → data-i18n-placeholder ─────────────────────
    for inp in soup.find_all(["input", "textarea"]):
        if inp.get("data-i18n-placeholder"):
            continue
        ph = inp.get("placeholder")
        if ph:
            key = lookup.get(clean_text(ph))
            if key:
                schedule_modification(inp, "data-i18n-placeholder", key)

    # ── Section aria-labels → data-i18n-attr ─────────────────────────
    for section in soup.find_all("section"):
        if section.get("data-i18n-attr"):
            continue
        aria_label = section.get("aria-label")
        if aria_label:
            key = lookup.get(clean_text(aria_label))
            if key:
                schedule_modification(section, "data-i18n-attr", f"aria-label:{key}")

    if not modifications:
        return 0

    # Sort modifications by line number (descending) so we can modify
    # from bottom to top without affecting line numbers above
    modifications.sort(key=lambda m: (m[0], m[1]), reverse=True)

    # Apply modifications to the original HTML text
    lines = html.split("\n")
    # Note: BeautifulSoup uses 1-based line numbers, our list is 0-based
    changes = 0

    for sourceline, sourcepos, tag_name, attr_str in modifications:
        line_idx = sourceline - 1  # Convert to 0-based
        if line_idx < 0 or line_idx >= len(lines):
            continue
        old_line = lines[line_idx]
        new_line, success = insert_attr_in_tag(old_line, tag_name, sourcepos, attr_str)
        if success:
            lines[line_idx] = new_line
            changes += 1

    if changes > 0 and apply_changes:
        output = "\n".join(lines)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"  {filepath.name}: {changes} data-i18n attributes added")
    elif changes > 0:
        print(f"  {filepath.name}: {changes} data-i18n attributes would be added (dry-run)")
    else:
        print(f"  {filepath.name}: no changes needed")

    return changes


def main():
    parser = argparse.ArgumentParser(
        description="Add data-i18n attributes to HTML elements."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply changes to HTML files (default: dry-run).",
    )
    args = parser.parse_args()

    # Load en.json
    with open(EN_JSON, "r", encoding="utf-8") as f:
        strings = json.load(f)

    total_changes = 0

    print(f"Processing {len(HTML_FILES)} HTML pages...")
    for filename in HTML_FILES:
        filepath = SITE_ROOT / filename
        if not filepath.exists():
            print(f"WARNING: {filename} not found, skipping.", file=sys.stderr)
            continue
        page_prefix = get_page_prefix(filename)
        lookup = build_text_lookup(strings, page_prefix)
        changes = apply_attrs_to_page(filepath, page_prefix, lookup, args.apply)
        total_changes += changes

    mode = "applied" if args.apply else "would be applied (dry-run)"
    print(f"\nTotal: {total_changes} data-i18n attributes {mode} across {len(HTML_FILES)} pages.")


if __name__ == "__main__":
    main()
