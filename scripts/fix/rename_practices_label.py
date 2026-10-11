#!/usr/bin/env python3
"""Issue #89 — rename 'Moon — 20 Exclusive Practices' → 'Twenty Practices'.

Replaces the product label, its URL, its i18n key, and the "unavailable
anywhere else" overstatement across the site. The page file itself is
renamed via `git mv` before this script runs (done once by hand, not here).

Usage:
  python3 scripts/fix/rename_practices_label.py --dry-run
  python3 scripts/fix/rename_practices_label.py --apply
  python3 scripts/fix/rename_practices_label.py --apply --limit 5 --offset 0

Writes an audit record to data/audit/rename-practices-<ts>.json.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Directories that are historical records or generated artifacts — the old
# name may legitimately appear there (audit trails, change docs). URL-only
# files get URL swaps; label swaps are skipped in HISTORICAL_DIRS.
HISTORICAL_DIRS = ("docs/", "data/audit", "node_modules", ".git")
LABEL_SKIP_FILES = ("END_STATE_REPORT_AIKIFIELD.md",)

# Ordered (old, new) replacement pairs. Order matters: the longest, most
# specific strings first so partial overlaps can't mangle them.
REPLACEMENTS: list[tuple[str, str, str]] = [
    # --- page-specific: claims + credit (moon-practices.html → practices.html) ---
    (
        'Moon — 20 Exclusive Practices by Richard Moon. Partner work, grounding, and movement practices for physical performance and creativity — unavailable anywhere else. Members only — sign in to practice.',
        'Twenty practices from the work of <a href="https://quantumaikido.com">Richard Moon</a> — partner work, grounding, and movement practices for physical performance and creativity. Members only — sign in to practice.',
        "meta description — drops the 'unavailable anywhere else' claim, adds author credit + link",
    ),
    (
        'Twenty practices by Richard Moon you won’t find anywhere else — partner work, grounding, and movement for physical performance and creativity.',
        'Twenty practices from the work of <a href="https://quantumaikido.com">Richard Moon</a> — partner work, grounding, and movement for physical performance and creativity.',
        "page lead / card body — same claim fix + credit link",
    ),
    # --- games/exercises/index.php variants ---
    (
        '<title>MOON — 20 Exclusive Practices — AikiField Games</title>',
        '<title>Twenty Practices — AikiField Games</title>',
        "games page title",
    ),
    (
        'content="20 exclusive movement practices by Richard Moon 6th Dan, unavailable anywhere else. Free: DBSO, Wrist Grab Grounding, Ten to the Tenth."',
        'content="Twenty movement practices from the work of Richard Moon 6th Dan. Free: DBSO, Wrist Grab Grounding, Ten to the Tenth."',
        "games page meta description — same claim fix",
    ),
    (
        '<header><h1>MOON <span>Quantum Aikido — Book of Exercises &amp; Practices — 20 Exclusive Practices by Richard Moon 6th Dan · Unavailable Anywhere Else · Student of Robert Nadeau since &#x27;71</span></h1>',
        '<header><h1>TWENTY PRACTICES <span>Quantum Aikido — Book of Exercises &amp; Practices — from the work of Richard Moon 6th Dan · Student of Robert Nadeau since &#x27;71</span></h1>',
        "games page h1 (entity-escaped apostrophe variant)",
    ),
    (
        "<header><h1>MOON <span>Quantum Aikido — Book of Exercises &amp; Practices — 20 Exclusive Practices by Richard Moon 6th Dan · Unavailable Anywhere Else · Student of Robert Nadeau since '71</span></h1>",
        "<header><h1>TWENTY PRACTICES <span>Quantum Aikido — Book of Exercises &amp; Practices — from the work of Richard Moon 6th Dan · Student of Robert Nadeau since '71</span></h1>",
        "games page h1",
    ),
    (
        '20 exclusive practices unavailable anywhere else — By Richard Moon 6th Dan',
        'Twenty practices from the work of Richard Moon 6th Dan',
        "games page footer credit line",
    ),
    # --- i18n key rename (JSON files + data-i18n attributes) ---
    ("nav.dx_moon_practices", "nav.dx_practices", "i18n key"),
    # --- nav/card labels ---
    ("Moon — 20 Exclusive Practices", "Twenty Practices", "product label"),
    # --- URL ---
    ("moon-practices.html", "practices.html", "page URL"),
]

# File types the sweep covers.
SUFFIXES = {".html", ".php", ".js", ".json", ".xml", ".md", ".txt"}


def iter_files():
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or path.suffix not in SUFFIXES:
            continue
        rel = path.relative_to(ROOT).as_posix()
        if any(rel.startswith(d) or f"/{d.rstrip('/')}/" in rel for d in HISTORICAL_DIRS):
            continue
        yield path, rel


def scan_file(path: Path, rel: str, apply_label: bool) -> list[dict]:
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return []
    changes = []
    for old, new, why in REPLACEMENTS:
        is_label = why in ("product label", "i18n key") or "games page" in why or "lead" in why or "claim" in why
        if is_label and not apply_label:
            continue
        count = text.count(old)
        if count:
            changes.append({"old": old[:80], "new": new[:80], "count": count, "why": why})
    return changes


def apply_file(path: Path, apply_label: bool) -> int:
    text = path.read_text(encoding="utf-8")
    n = 0
    for old, new, why in REPLACEMENTS:
        is_label = why in ("product label", "i18n key") or "games page" in why or "lead" in why or "claim" in why
        if is_label and not apply_label:
            continue
        if old in text:
            n += text.count(old)
            text = text.replace(old, new)
    if n:
        path.write_text(text, encoding="utf-8")
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="list changes without writing")
    ap.add_argument("--apply", action="store_true", help="write changes")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--offset", type=int, default=0)
    args = ap.parse_args()
    if not args.dry_run and not args.apply:
        ap.error("pass --dry-run or --apply")

    records = []
    total = 0
    files = list(iter_files())
    for path, rel in files[args.offset : (args.offset + args.limit) or None]:
        apply_label = not any(rel == f or rel.startswith("docs/") for f in LABEL_SKIP_FILES)
        apply_label = apply_label and not rel.startswith("docs/")
        changes = scan_file(path, rel, apply_label)
        if not changes:
            continue
        if args.apply:
            n = apply_file(path, apply_label)
        else:
            n = sum(c["count"] for c in changes)
        total += n
        records.append({"file": rel, "replacements": n, "label_swaps": apply_label, "changes": changes})
        print(f"{'WRITE' if args.apply else 'scan '} {rel}: {n} replacement(s)")

    print(f"\n{len(records)} files, {total} replacements ({'applied' if args.apply else 'dry-run'})")
    if args.apply:
        out = ROOT / "data" / "audit" / f"rename-practices-{time.strftime('%Y%m%dT%H%M%S')}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"issue": 89, "records": records, "total": total}, indent=2))
        print(f"audit → {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
