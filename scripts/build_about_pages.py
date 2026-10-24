#!/usr/bin/env python3
"""Build the Kenneth / Richard Moon / coaching pages from data/about-pages.json.

The site header and footer are copied from process.html so the new pages
follow the existing chrome. Output goes to the repo root.

Usage: scripts/build_about_pages.py [--dry-run]
"""
import argparse
import html
import json
import logging
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "about-pages.json"
SHELL = ROOT / "process.html"
SITE = "https://aikifield.com"

# New links added to the footer "Explore" list of the generated pages.
FOOTER_LINKS = [
    ("coaching.html", "Coaching"),
    ("about-kenneth.html", "About Kenneth"),
    ("about-richard-moon.html", "About Richard Moon"),
]

log = logging.getLogger("build_about_pages")


def split_shell(text):
    head, rest = text.split('<main id="main">', 1)
    _, foot = rest.split("</main>", 1)
    return head, foot


def clean_chrome(chunk):
    """Drop process.html's active-nav marks and its i18n hooks."""
    chunk = chunk.replace(" af-nav__link--active", "").replace(" af-nav__sublink--active", "")
    chunk = chunk.replace(' aria-current="page"', "")
    return chunk


def render_head(head, page):
    title = page["title"] if page["title"].startswith("AikiField") else f"AikiField — {page['title']}"
    url = f"{SITE}/{page['file']}"
    desc = html.escape(page["description"], quote=True)
    head = re.sub(r"<title>.*?</title>", f"<title>{html.escape(title)}</title>", head)
    head = re.sub(r'(<link rel="canonical" href=")[^"]*(")', rf"\g<1>{url}\2", head)
    head = re.sub(r'(<meta name="description" content=")[^"]*(")', rf"\g<1>{desc}\2", head)
    head = re.sub(r'(<meta property="og:title" content=")[^"]*(")', rf"\g<1>{html.escape(page['title'], quote=True)}\2", head)
    head = re.sub(r'(<meta property="og:description" content=")[^"]*(")', rf"\g<1>{desc}\2", head)
    head = re.sub(r'(<meta property="og:url" content=")[^"]*(")', rf"\g<1>{url}\2", head)
    head = re.sub(r'(<meta name="twitter:title" content=")[^"]*(")', rf"\g<1>{html.escape(page['title'], quote=True)}\2", head)
    head = re.sub(r'(<meta name="twitter:description" content=")[^"]*(")', rf"\g<1>{desc}\2", head)
    return head


def render_footer(foot):
    items = "".join(f'        <li><a href="{h}">{html.escape(t)}</a></li>\n' for h, t in FOOTER_LINKS)
    marker = '      <ul class="af-footer__nav">\n'
    return foot.replace(marker, marker + items, 1)


def render_body(page):
    out = [
        '\n  <section class="af-page-header af-page-header--tight af-page-header--green">',
        '    <div class="af-container">',
        f'      <p class="af-eyebrow">{html.escape(page["eyebrow"])}</p>',
        f'      <h1 class="af-h1">{html.escape(page["h1"])}</h1>',
        f'      <p class="af-lead af-lead--wide af-page-header__lead">{html.escape(page["description"])}</p>',
        "    </div>",
        "  </section>",
    ]
    for i, sec in enumerate(page["sections"]):
        tone = "af-section af-section--white" if i % 2 == 0 else "af-section"
        out.append(f'\n  <section class="{tone}">')
        out.append('    <div class="af-container" style="max-width:46rem;">')
        if sec.get("h"):
            out.append(f'      <h2 class="af-h2">{html.escape(sec["h"])}</h2>')
        for p in sec.get("p", []):
            out.append(f"      <p>{p}</p>")
        if sec.get("ul"):
            out.append("      <ul>")
            out.extend(f"        <li>{li}</li>" for li in sec["ul"])
            out.append("      </ul>")
        out.append("    </div>")
        out.append("  </section>")
    cta = page.get("cta")
    if cta:
        out += [
            '\n  <section class="af-section af-section--dark">',
            '    <div class="af-container" style="max-width:46rem;">',
            f'      <a href="{cta["href"]}" class="af-btn af-btn--primary">{html.escape(cta["text"])}</a>',
            "    </div>",
            "  </section>",
        ]
    return "\n".join(out) + "\n\n"


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    pages = json.loads(DATA.read_text(encoding="utf-8"))["pages"]
    head, foot = split_shell(SHELL.read_text(encoding="utf-8"))
    head, foot = clean_chrome(head), clean_chrome(foot)
    foot = render_footer(foot)
    for page in pages:
        text = render_head(head, page) + '<main id="main">' + render_body(page) + "</main>" + foot
        target = ROOT / page["file"]
        log.info("%s %s (%d bytes)", "would write" if args.dry_run else "write", target.name, len(text))
        if not args.dry_run:
            target.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
