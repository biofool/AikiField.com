#!/usr/bin/env python3
"""
extract_i18n_strings.py — Extract translatable strings from AikiField.com HTML pages.

Scans all .html files in the site root, extracts translatable text from
headings (h1-h4), nav links, buttons, form labels, placeholders, and footer
text, then writes them to data/i18n-strings/en.json with page-prefixed keys.

Usage:
    python3 scripts/extract_i18n_strings.py           # Dry-run: print summary
    python3 scripts/extract_i18n_strings.py --apply    # Write to en.json

Skips: proper nouns (AikiField, company names), URLs, emails, very long
paragraphs (>300 chars), and content inside <script>/<style> tags.
"""

import argparse
import json
import os
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
STRINGS_DIR = SITE_ROOT / "data" / "i18n-strings"
EN_JSON = STRINGS_DIR / "en.json"

# Proper nouns / brand names to skip (case-insensitive exact match)
PROPER_NOUNS = {
    "aikifield",
    "ciso",
    "soc 2",
    "soc 2 type ii",
    "iso 27001",
    "devsecops",
    "saas",
    "owasp",
    "cwe",
    "nist",
    "aikido.dev",
    "snyk",
    "semgrep",
    "github advanced security",
    "verizon",
    "ibm",
    "digital realty",
    "ntt",
}

# Max text length to extract (skip very long paragraphs)
MAX_TEXT_LENGTH = 300

# Nav link text → shared key mapping (same on every page)
NAV_LINK_KEYS = {
    "Home": "nav.home",
    "Process": "nav.process",
    "Approach": "nav.approach",
    "Services": "nav.services",
    "Case Studies": "nav.case_studies",
    "Demonstration Technologies": "nav.demonstration_technologies",
    "Sponsored Projects": "nav.sponsored_projects",
    "Assessment": "nav.assessment",
    "Get Started": "nav.get_started",
}

# Footer link text → shared key mapping
FOOTER_LINK_KEYS = {
    "Engagement Process": "footer.engagement_process",
    "Our Approach": "footer.our_approach",
    "Services": "footer.services",
    "Case Studies": "footer.case_studies",
    "Fractional CISO for SaaS": "footer.fractional_ciso_for_saas",
    "AI DevSecOps Remediation": "footer.ai_devsecops_remediation",
    "Demonstration Technologies": "footer.demonstration_technologies",
    "Self-Assessment": "footer.self_assessment",
    "Contact": "footer.contact",
    "Inquiry": "footer.inquiry",
}

# Shared/common strings that appear on multiple pages
COMMON_KEYS = {
    "Book a Discovery Call": "common.book_a_discovery_call",
    "Skip to main content": "common.skip_to_main_content",
    "Menu": "common.menu",
    "Security leadership for product companies. Fractional CISO, AI-assisted security engineering, and presence-based executive coaching.": "footer.tagline",
    "Explore": "footer.explore",
    "Connect": "footer.connect",
    "All rights reserved.": "footer.all_rights_reserved",
    "What to Expect": "common.what_to_expect",
    "Send Message": "common.send_message",
    "Name": "common.name",
    "Email": "common.email",
    "Organization": "common.organization",
    "Area of Interest": "common.area_of_interest",
    "Message": "common.message",
    "Select an area of interest…": "common.select_area_of_interest",
    "Fractional CISO": "common.fractional_ciso",
    "DevSecOps & Vulnerability Remediation": "common.devsecops_vulnerability_remediation",
    "Threat Modeling": "common.threat_modeling",
    "Security Leadership Coaching": "common.security_leadership_coaching",
    "Security Maturity Assessment": "common.security_maturity_assessment",
    "Other": "common.other",
    "What's on your mind?": "common.whats_on_your_mind",
    "Website (leave empty)": "common.website_leave_empty",
    "Website": "common.website",
}


def clean_text(text):
    """Normalize whitespace and decode HTML entities."""
    if not text:
        return ""
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def should_skip(text):
    """Return True if this text should be skipped (not extracted)."""
    text = clean_text(text)
    if not text:
        return True
    # Skip if too long (likely a paragraph)
    if len(text) > MAX_TEXT_LENGTH:
        return True
    # Skip URLs
    if text.startswith("http://") or text.startswith("https://"):
        return True
    # Skip emails
    if re.match(r"^[\w.+-]+@[\w-]+\.[\w.-]+$", text):
        return True
    # Skip if it's only a proper noun
    if text.lower() in PROPER_NOUNS:
        return True
    # Skip if it's only digits/punctuation
    if re.match(r"^[\d\s\W]+$", text):
        return True
    # Skip single characters
    if len(text) <= 1:
        return True
    return False


def slugify(text, max_words=5):
    """Convert text to a slug suitable for a key name."""
    text = clean_text(text).lower()
    # Remove non-alphanumeric chars
    text = re.sub(r"[^a-z0-9\s]", "", text)
    # Collapse whitespace and split
    words = text.split()
    if not words:
        return "untitled"
    # Take first N words
    words = words[:max_words]
    slug = "_".join(words)
    # Truncate to reasonable length
    if len(slug) > 60:
        slug = slug[:60]
    return slug


def get_page_prefix(filename):
    """Get the page prefix from filename (e.g., 'index' from 'index.html')."""
    name = filename.replace(".html", "")
    if name == "index":
        return "index"
    return name


def extract_strings_from_page(filepath, page_prefix, strings, used_keys):
    """Extract translatable strings from a single HTML page."""

    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    soup = BeautifulSoup(html, "html.parser")

    # Remove script and style tags
    for tag in soup.find_all(["script", "style"]):
        tag.decompose()

    # ── Nav links (primary nav) ──────────────────────────────────────
    nav = soup.find("nav", attrs={"aria-label": "Primary"})
    if nav:
        for a in nav.find_all("a", class_=re.compile(r"af-nav__link|af-nav__cta")):
            text = clean_text(a.get_text())
            if should_skip(text):
                continue
            key = NAV_LINK_KEYS.get(text)
            if not key:
                # Generate a key from the text
                key = f"nav.{slugify(text)}"
            if key not in strings and key not in used_keys:
                strings[key] = text
                used_keys.add(key)

    # ── Nav toggle label ─────────────────────────────────────────────
    nav_toggle = soup.find("label", class_=re.compile(r"af-nav__toggle"))
    if nav_toggle:
        aria_label = nav_toggle.get("aria-label")
        if aria_label and not should_skip(aria_label):
            key = "nav.toggle_menu"
            if key not in strings:
                strings[key] = clean_text(aria_label)
                used_keys.add(key)

    # ── Skip link ────────────────────────────────────────────────────
    skip_link = soup.find("a", class_=re.compile(r"af-skip-link"))
    if skip_link:
        text = clean_text(skip_link.get_text())
        if text and not should_skip(text):
            key = COMMON_KEYS.get(text, "common.skip_to_main_content")
            if key not in strings:
                strings[key] = text
                used_keys.add(key)

    # ── Headings (h1-h4) ─────────────────────────────────────────────
    for tag_name in ["h1", "h2", "h3", "h4"]:
        for tag in soup.find_all(tag_name):
            # Skip headings inside footer nav (handled separately)
            if tag.find_parent("footer"):
                continue
            # Skip headings inside nav
            if tag.find_parent("nav", attrs={"aria-label": "Primary"}):
                continue
            text = clean_text(tag.get_text())
            if should_skip(text):
                continue
            # Check if it's a common string first
            key = COMMON_KEYS.get(text)
            if not key:
                key = f"{page_prefix}.{slugify(text)}"
            if key not in strings and key not in used_keys:
                strings[key] = text
                used_keys.add(key)

    # ── Eyebrow text (p.af-eyebrow) ──────────────────────────────────
    for tag in soup.find_all("p", class_=re.compile(r"af-eyebrow")):
        if tag.find_parent("footer"):
            continue
        text = clean_text(tag.get_text())
        if should_skip(text):
            continue
        key = COMMON_KEYS.get(text)
        if not key:
            key = f"{page_prefix}.eyebrow_{slugify(text)}"
        if key not in strings and key not in used_keys:
            strings[key] = text
            used_keys.add(key)

    # ── Buttons and CTAs (a.af-btn, button.af-btn) ───────────────────
    for tag in soup.find_all(["a", "button"], class_=re.compile(r"af-btn")):
        text = clean_text(tag.get_text())
        if should_skip(text):
            continue
        key = COMMON_KEYS.get(text)
        if not key:
            key = f"{page_prefix}.btn_{slugify(text)}"
        if key not in strings and key not in used_keys:
            strings[key] = text
            used_keys.add(key)

    # ── Form labels ──────────────────────────────────────────────────
    for label in soup.find_all("label"):
        text = clean_text(label.get_text())
        if should_skip(text):
            continue
        key = COMMON_KEYS.get(text)
        if not key:
            key = f"{page_prefix}.label_{slugify(text)}"
        if key not in strings and key not in used_keys:
            strings[key] = text
            used_keys.add(key)

    # ── Placeholder text ─────────────────────────────────────────────
    for inp in soup.find_all(["input", "textarea"]):
        ph = inp.get("placeholder")
        if ph and not should_skip(ph):
            ph = clean_text(ph)
            key = COMMON_KEYS.get(ph)
            if not key:
                key = f"{page_prefix}.placeholder_{slugify(ph)}"
            if key not in strings and key not in used_keys:
                strings[key] = ph
                used_keys.add(key)

    # ── Select option text ───────────────────────────────────────────
    for opt in soup.find_all("option"):
        text = clean_text(opt.get_text())
        if should_skip(text):
            continue
        key = COMMON_KEYS.get(text)
        if not key:
            key = f"{page_prefix}.option_{slugify(text)}"
        if key not in strings and key not in used_keys:
            strings[key] = text
            used_keys.add(key)

    # ── FAQ summaries (details > summary) ────────────────────────────
    for summary in soup.find_all("summary"):
        text = clean_text(summary.get_text())
        if should_skip(text):
            continue
        key = f"{page_prefix}.faq_{slugify(text)}"
        if key not in strings and key not in used_keys:
            strings[key] = text
            used_keys.add(key)

    # ── Footer text ──────────────────────────────────────────────────
    footer = soup.find("footer")
    if footer:
        # Footer column titles
        for h3 in footer.find_all("h3", class_=re.compile(r"af-footer__col-title")):
            text = clean_text(h3.get_text())
            if should_skip(text):
                continue
            key = COMMON_KEYS.get(text, f"footer.{slugify(text)}")
            if key not in strings and key not in used_keys:
                strings[key] = text
                used_keys.add(key)

        # Footer nav links
        for a in footer.find_all("a"):
            text = clean_text(a.get_text())
            if should_skip(text):
                continue
            key = FOOTER_LINK_KEYS.get(text)
            if not key:
                key = COMMON_KEYS.get(text)
            if not key:
                key = f"footer.{slugify(text)}"
            if key not in strings and key not in used_keys:
                strings[key] = text
                used_keys.add(key)

        # Footer tagline
        tagline = footer.find("p", class_=re.compile(r"af-footer__tagline"))
        if tagline:
            text = clean_text(tagline.get_text())
            if not should_skip(text):
                key = "footer.tagline"
                if key not in strings:
                    strings[key] = text
                    used_keys.add(key)

        # Footer legal
        legal = footer.find("div", class_=re.compile(r"af-footer__legal"))
        if legal:
            text = clean_text(legal.get_text())
            if not should_skip(text):
                key = "footer.legal"
                if key not in strings:
                    strings[key] = text
                    used_keys.add(key)

    # ── Brand tagline ────────────────────────────────────────────────
    brand_tagline = soup.find("span", class_=re.compile(r"af-brand__tagline"))
    if brand_tagline:
        text = clean_text(brand_tagline.get_text())
        if not should_skip(text):
            key = "common.brand_tagline"
            if key not in strings:
                strings[key] = text
                used_keys.add(key)

    # ── Section aria-labels (translatable) ───────────────────────────
    for section in soup.find_all("section"):
        aria_label = section.get("aria-label")
        if aria_label and not should_skip(aria_label):
            aria_label = clean_text(aria_label)
            key = COMMON_KEYS.get(aria_label)
            if not key:
                key = f"{page_prefix}.section_{slugify(aria_label)}"
            if key not in strings and key not in used_keys:
                strings[key] = aria_label
                used_keys.add(key)


def main():
    parser = argparse.ArgumentParser(
        description="Extract translatable strings from AikiField.com HTML pages."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write extracted strings to en.json (default: dry-run, print summary only).",
    )
    args = parser.parse_args()

    strings = {}
    used_keys = set()

    # Preserve _meta if en.json already exists
    if EN_JSON.exists():
        with open(EN_JSON, "r", encoding="utf-8") as f:
            existing = json.load(f)
        if "_meta" in existing:
            strings["_meta"] = existing["_meta"]

    # Extract from each page
    for filename in HTML_FILES:
        filepath = SITE_ROOT / filename
        if not filepath.exists():
            print(f"WARNING: {filename} not found, skipping.", file=sys.stderr)
            continue
        page_prefix = get_page_prefix(filename)
        extract_strings_from_page(filepath, page_prefix, strings, used_keys)

    # Sort keys (except _meta which stays first)
    meta = strings.pop("_meta", None)
    sorted_strings = dict(sorted(strings.items()))
    if meta:
        sorted_strings = {"_meta": meta, **sorted_strings}

    # Print summary
    key_count = len(sorted_strings) - (1 if "_meta" in sorted_strings else 0)
    print(f"Extracted {key_count} translatable strings from {len(HTML_FILES)} HTML pages.")

    # Group by prefix for summary
    prefixes = {}
    for key in sorted_strings:
        if key == "_meta":
            continue
        prefix = key.split(".")[0]
        prefixes.setdefault(prefix, []).append(key)

    for prefix in sorted(prefixes.keys()):
        print(f"  {prefix}: {len(prefixes[prefix])} keys")

    if args.apply:
        STRINGS_DIR.mkdir(parents=True, exist_ok=True)
        with open(EN_JSON, "w", encoding="utf-8") as f:
            json.dump(sorted_strings, f, indent=4, ensure_ascii=False)
            f.write("\n")
        print(f"\nWrote {key_count} keys to {EN_JSON}")
    else:
        print(f"\nDry-run mode. Use --apply to write to {EN_JSON}")
        # Print first 20 keys as preview
        print("\nPreview (first 20 keys):")
        for i, (key, val) in enumerate(sorted_strings.items()):
            if key == "_meta":
                continue
            if i >= 21:
                break
            print(f"  {key} = {val[:80]}")


if __name__ == "__main__":
    main()
