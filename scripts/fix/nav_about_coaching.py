#!/usr/bin/env python3
"""Add "About" (dropdown) and "Coaching" to the primary nav on every page.

- Inserts, just before the "Demonstration Technologies" link:
    About  (dropdown: About Kenneth / About Richard Moon / Richard Moon: Aikido and Music)
    Coaching  (-> coaching.html)
  so the order is Home, Services, About, Coaching, Demonstration Technologies, ...
- Marks the active item for the about/coaching pages themselves.
- Adds Coaching + About Kenneth to the footer "Explore" list.
- Adds the new nav.* keys to data/i18n-strings/en.json.
- Idempotent: a page that already has the About group is left alone.

Usage: scripts/fix/nav_about_coaching.py [--dry-run] [--limit N] [--offset N]
Writes an audit record to data/audit/.
"""

import argparse
import json
import logging
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
log = logging.getLogger("nav_about_coaching")

ABOUT_ITEMS = [
    ("about-kenneth.html", "nav.about_kenneth", "About Kenneth"),
    ("about-richard-moon.html", "nav.about_richard_moon", "About Richard Moon"),
    ("richard-moon-music.html", "nav.richard_moon_music", "Richard Moon: Aikido and Music"),
]
# career-highlight.html is deliberately not in the menu; it lives under the About pages.
ABOUT_PAGES = {href for href, _, _ in ABOUT_ITEMS} | {"career-highlight.html"}
NEW_KEYS = {
    "nav.about": "About",
    "nav.about_kenneth": "About Kenneth",
    "nav.about_richard_moon": "About Richard Moon",
    "nav.about_submenu": "About pages",
    "nav.coaching": "Coaching",
    "nav.richard_moon_music": "Richard Moon: Aikido and Music",
}

PROJECTS_LINK = re.compile(
    r'^(?P<indent>[ \t]*)<a href="(?P<prefix>[^"]*?)projects\.php" class="af-nav__link[^"]*"[^>]*>.*?</a>[ \t]*\n',
    re.M,
)
FOOTER_EXPLORE = re.compile(
    r'(?P<head><nav aria-label="Explore">.*?<ul class="af-footer__nav">\s*\n)(?P<items>.*?)(?P<tail>[ \t]*</ul>)',
    re.S,
)
FOOTER_SERVICES_LI = re.compile(r'^(?P<indent>[ \t]*)<li><a href="(?P<prefix>[^"]*?)services\.html"[^>]*>.*?</li>[ \t]*\n', re.M)


def build_block(indent, prefix, page, i18n):
    def attr(key):
        return f' data-i18n="{key}"' if i18n else ""

    about_active = page in ABOUT_PAGES
    coach_active = page == "coaching.html"
    i = indent
    lines = [
        f'{i}<div class="af-nav__group">',
        f'{i}  <button type="button" class="af-nav__link af-nav__menu-btn{" af-nav__link--active" if about_active else ""}" aria-expanded="false" aria-controls="af-nav-sub-about"{attr("nav.about")}>About</button>',
        f'{i}  <ul class="af-nav__submenu" id="af-nav-sub-about">',
    ]
    for href, key, label in ABOUT_ITEMS:
        cur = page == href
        lines.append(
            f'{i}    <li><a href="{prefix}{href}" class="af-nav__sublink{" af-nav__sublink--active" if cur else ""}"'
            f'{" aria-current=\"page\"" if cur else ""}{attr(key)}>{label}</a></li>'
        )
    lines += [
        f"{i}  </ul>",
        f"{i}</div>",
        f'{i}<a href="{prefix}coaching.html" class="af-nav__link{" af-nav__link--active" if coach_active else ""}"'
        f'{" aria-current=\"page\"" if coach_active else ""}{attr("nav.coaching")}>Coaching</a>',
    ]
    return "\n".join(lines) + "\n"


def footer_li(indent, href, label, i18n_key):
    return f'{indent}<li><a href="{href}">{label}</a></li>\n'


def process(path):
    rel = path.relative_to(ROOT).as_posix()
    text = path.read_text(encoding="utf-8")
    res = {"file": rel, "status": "ok", "notes": []}
    if "af-nav-sub-about" in text:
        return {**res, "status": "unchanged", "notes": ["already has About group"]}
    m = PROJECTS_LINK.search(text)
    if not m:
        return {**res, "status": "skipped", "notes": ["no Demonstration Technologies/Projects nav link"]}
    prefix = m.group("prefix")
    i18n = 'data-i18n="nav.home"' in text
    block = build_block(m.group("indent"), prefix, path.name, i18n)
    text = text[: m.start()] + block + text[m.start():]

    fm = FOOTER_EXPLORE.search(text)
    if not fm:
        res["notes"].append("no footer Explore list")
    elif "coaching.html" not in fm.group("items"):
        sm = FOOTER_SERVICES_LI.search(fm.group("items"))
        if sm:
            ind, pre = sm.group("indent"), sm.group("prefix")
            add = (
                f'{ind}<li><a href="{pre}coaching.html">Coaching</a></li>\n'
                f'{ind}<li><a href="{pre}about-kenneth.html">About Kenneth</a></li>\n'
            )
            items = fm.group("items")
            items = items[: sm.end()] + add + items[sm.end():]
            text = text[: fm.start("items")] + items + text[fm.end("items"):]
        else:
            res["notes"].append("no Services item in footer Explore list")
    return {**res, "text": text}


def update_en_json(dry_run):
    p = ROOT / "data" / "i18n-strings" / "en.json"
    text = p.read_text(encoding="utf-8")
    missing = {k: v for k, v in NEW_KEYS.items() if f'"{k}"' not in text}
    if not missing:
        return []
    anchor = re.search(r'^(?P<indent>[ \t]*)"nav\.home": "[^"]*",\n', text, re.M)
    if not anchor:
        log.warning("en.json: nav.home anchor not found; i18n keys not added")
        return []
    ind = anchor.group("indent")
    add = "".join(f'{ind}{json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},\n' for k, v in sorted(missing.items()))
    new = text[: anchor.end()] + add + text[anchor.end():]
    json.loads(new)  # must stay valid
    if not dry_run:
        p.write_text(new, encoding="utf-8")
    return sorted(missing)


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--offset", type=int, default=0)
    args = ap.parse_args()

    skip_dirs = {".git", "input", "test-results", "ci-results", "node_modules", "includes"}
    files = sorted(
        p for p in ROOT.rglob("*")
        if p.suffix in (".html", ".php")
        and not skip_dirs & set(p.relative_to(ROOT).parts)
        and 'aria-label="Primary"' in p.read_text(encoding="utf-8", errors="ignore")
    )
    files = files[args.offset:]
    if args.limit:
        files = files[: args.limit]

    audit = {"script": "nav_about_coaching", "ts": int(time.time()), "dry_run": args.dry_run, "files": []}
    for path in files:
        r = process(path)
        if r["status"] == "ok" and not args.dry_run:
            path.write_text(r["text"], encoding="utf-8")
        r.pop("text", None)
        audit["files"].append(r)
    audit["i18n_keys_added"] = update_en_json(args.dry_run)
    counts = {}
    for f in audit["files"]:
        counts[f["status"]] = counts.get(f["status"], 0) + 1
    audit["summary"] = counts

    out_dir = ROOT / "data" / "audit"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"nav-about-coaching-{time.strftime('%Y%m%dT%H%M%S')}.json"
    out.write_text(json.dumps(audit, indent=2))
    print(json.dumps(counts))
    for f in audit["files"]:
        print(f"{f['status'].upper():9} {f['file']}  {'; '.join(f['notes'])}")
    print(f"i18n keys added: {audit['i18n_keys_added']}")
    print(f"audit: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
