#!/usr/bin/env python3
"""Restructure the primary nav across all pages.

- Moves top-level "Case Studies" and "Assessment" links into the Services
  submenu.
- Renames the "Digital Experience" menu group to "Studies the Unified Field"
  and turns its flyout into a two-column megamenu: Books | Digital Experience
  (Social Media sits under Digital Experience).

Usage: scripts/fix/nav_unified_field.py [--dry-run] [--limit N]
Writes an audit record to data/audit/.
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

DX_BLOCK = re.compile(
    r'^(?P<indent>\s*)<div class="af-nav__group">\s*\n'
    r'\s*<button[^>]*aria-controls="af-nav-sub-dx"[^>]*>.*?</button>\s*\n'
    r'\s*<ul[^>]*id="af-nav-sub-dx"[^>]*>\s*\n'
    r'(?P<items>(?:\s*<li[^>]*>.*?</li>\s*\n)+)'
    r'\s*</ul>\s*\n'
    r'\s*</div>\s*\n',
    re.M,
)

CASE_LINK = re.compile(r'^\s*<a href="(?P<prefix>[^"]*?)case-studies\.html"(?P<attrs>[^>]*)>.*?</a>\s*\n', re.M)
ASSESS_LINK = re.compile(r'^\s*<a href="(?P<prefix>[^"]*?)assessment\.html"(?P<attrs>[^>]*)>.*?</a>\s*\n', re.M)
APPROACH_LI = re.compile(r'^(?P<indent>\s*<li[^>]*>)<a href="(?P<prefix>[^"]*?)approach\.html"(?P<attrs>[^>]*)>.*?</li>\s*\n', re.M)


def i18n_attrs(use_i18n: bool, key: str) -> str:
    return f' data-i18n="{key}"' if use_i18n else ""


def build_megamenu(indent: str, prefix: str, dx_items: str, active: bool, use_i18n: bool, is_books_page: bool) -> str:
    """New 'Studies the Unified Field' group: Books | Digital Experience."""
    i = indent
    btn_active = " af-nav__link--active" if active else ""
    btn_current = ' aria-current="page"' if active else ""
    books_active = " af-nav__sublink--active" if is_books_page else ""
    dx_items_nested = re.sub(r"^(\s*)<li>", r"\1<li>", dx_items)

    lines = [
        f'{i}<div class="af-nav__group">',
        f'{i}  <button type="button" class="af-nav__link af-nav__menu-btn{btn_active}" aria-expanded="false" aria-controls="af-nav-sub-uf"{btn_current}{i18n_attrs(use_i18n, "nav.unified_field_studies")}>Studies the Unified Field</button>',
        f'{i}  <ul class="af-nav__submenu af-nav__submenu--end af-nav__submenu--mega" id="af-nav-sub-uf">',
        f'{i}    <li class="af-nav__megacol">',
        f'{i}      <a href="{prefix}books.html" class="af-nav__colhead"{i18n_attrs(use_i18n, "nav.books")}>Books</a>',
        f'{i}      <ul class="af-nav__megalist">',
        f'{i}        <li><a href="{prefix}books.html" class="af-nav__sublink{books_active}">All Books</a></li>',
        f'{i}        <li><a href="{prefix}blog/" class="af-nav__sublink">Author\'s Insights blog</a></li>',
        f"{i}      </ul>",
        f"{i}    </li>",
        f'{i}    <li class="af-nav__megacol">',
        f'{i}      <a href="/digital-experience/" class="af-nav__colhead"{i18n_attrs(use_i18n, "nav.digital_experience")}>Digital Experience</a>',
        f'{i}      <ul class="af-nav__megalist">',
    ]
    for li in dx_items_nested.rstrip("\n").splitlines():
        lines.append(li)
    lines += [
        f'{i}        <li class="af-nav__subsep"><a href="{prefix}blog/index.html#social" class="af-nav__sublink"{i18n_attrs(use_i18n, "nav.social_media")}>Social Media</a></li>',
        f"{i}      </ul>",
        f"{i}    </li>",
        f"{i}  </ul>",
        f"{i}</div>",
    ]
    return "\n".join(lines) + "\n"


def process_file(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    rel = path.relative_to(ROOT).as_posix()
    result = {"file": rel, "status": "ok", "notes": []}

    case_m = CASE_LINK.search(text)
    if not case_m:
        result["status"] = "skipped"
        result["notes"].append("no top-level case-studies link found")
        return result
    prefix = case_m.group("prefix")
    use_i18n = 'data-i18n="nav.' in text

    dx_m = DX_BLOCK.search(text)
    if not dx_m:
        result["status"] = "skipped"
        result["notes"].append("no af-nav-sub-dx group found")
        return result

    # Capture active state before removing the standalone links.
    case_active = "--active" in case_m.group("attrs") or 'aria-current' in case_m.group("attrs")
    assess_m = ASSESS_LINK.search(text)
    assess_active = bool(assess_m and ("--active" in assess_m.group("attrs") or 'aria-current' in assess_m.group("attrs")))
    if not assess_m:
        result["notes"].append("no top-level assessment link (case-studies still moved)")

    dx_active = "--active" in dx_m.group(0) or 'aria-current' in dx_m.group(0)

    # 1) Services submenu gains Case Studies + Assessment (after Approach).
    approach_m = APPROACH_LI.search(text)
    if not approach_m:
        result["status"] = "skipped"
        result["notes"].append("no approach link in services submenu")
        return result
    indent_li = approach_m.group("indent")
    new_lis = (
        f'{indent_li}<a href="{prefix}case-studies.html" class="af-nav__sublink{" af-nav__sublink--active" if case_active else ""}"{" aria-current=\"page\"" if case_active else ""}{i18n_attrs(use_i18n, "nav.case_studies")}>Case Studies</a></li>\n'
        f'{indent_li}<a href="{prefix}assessment.html" class="af-nav__sublink{" af-nav__sublink--active" if assess_active else ""}"{" aria-current=\"page\"" if assess_active else ""}{i18n_attrs(use_i18n, "nav.assessment")}>Assessment</a></li>\n'
    )
    text = text[:approach_m.end()] + new_lis + text[approach_m.end():]

    # 2) Remove the two top-level links (re-search after insertion).
    text = CASE_LINK.sub("", text, count=1)
    if assess_m:
        text = ASSESS_LINK.sub("", text, count=1)

    # 3) Replace the Digital Experience group with the megamenu.
    dx_m = DX_BLOCK.search(text)
    mega = build_megamenu(
        indent=dx_m.group("indent"),
        prefix=prefix,
        dx_items=dx_m.group("items"),
        active=dx_active,
        use_i18n=use_i18n,
        is_books_page=path.name == "books.html",
    )
    text = text[:dx_m.start()] + mega + text[dx_m.end():]
    return {**result, "text": text}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    files = sorted(
        p for p in ROOT.rglob("*")
        if p.suffix in (".html", ".php")
        and ".git" not in p.parts
        and "input" not in p.parts
        and "test-results" not in p.parts
        and "ci-results" not in p.parts
        and 'af-nav-sub-dx' in p.read_text(encoding="utf-8", errors="ignore")
    )
    if args.limit:
        files = files[: args.limit]

    audit = {"script": "nav_unified_field", "ts": int(time.time()), "dry_run": args.dry_run, "files": []}
    changed = skipped = 0
    for path in files:
        r = process_file(path)
        if r["status"] == "ok" and not args.dry_run:
            path.write_text(r["text"], encoding="utf-8")
        r.pop("text", None)
        audit["files"].append(r)
        changed += r["status"] == "ok"
        skipped += r["status"] != "ok"

    audit["summary"] = {"files_seen": len(files), "changed": changed, "skipped": skipped}
    AUDIT = ROOT / "data" / "audit"
    AUDIT.mkdir(parents=True, exist_ok=True)
    out = AUDIT / f"nav-unified-field-{time.strftime('%Y%m%dT%H%M%S')}.json"
    out.write_text(json.dumps(audit, indent=2))
    print(json.dumps(audit["summary"]))
    for f in audit["files"]:
        mark = "OK " if f["status"] == "ok" else "SKIP"
        print(f"{mark} {f['file']}  {'; '.join(f['notes'])}")
    print(f"audit: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
