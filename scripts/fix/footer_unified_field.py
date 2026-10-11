#!/usr/bin/env python3
"""Add a 'Studies the Unified Field' column to the site footer nav.

Inserts a Books | blog | Digital Experience | Social Media column before the
Connect nav in every page that carries the shared af-footer markup.

Usage: scripts/fix/footer_unified_field.py [--dry-run] [--limit N]
Writes an audit record to data/audit/.
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

CONNECT = re.compile(r'^(?P<indent>\s*)<nav aria-label="Connect">', re.M)
PREFIX = re.compile(r'<a href="(?P<prefix>[^"]*?)contact\.html"')
MARKER = '<nav aria-label="Studies">'


def i18n(use: bool, key: str) -> str:
    return f' data-i18n="{key}"' if use else ""


def build_column(indent: str, prefix: str, use_i18n: bool) -> str:
    i = indent
    return "\n".join([
        f'{i}<nav aria-label="Studies">',
        f'{i}  <h3 class="af-footer__col-title"{i18n(use_i18n, "nav.unified_field_studies")}>Studies the Unified Field</h3>',
        f'{i}  <ul class="af-footer__nav">',
        f'{i}    <li><a href="{prefix}books.html"{i18n(use_i18n, "nav.books")}>Books</a></li>',
        f'{i}    <li><a href="{prefix}blog/"{i18n(use_i18n, "nav.insights_blog")}>Author\'s Insights blog</a></li>',
        f'{i}    <li><a href="{prefix}digital-experience/"{i18n(use_i18n, "nav.digital_experience")}>Digital Experience</a></li>',
        f'{i}    <li><a href="{prefix}blog/index.html#social"{i18n(use_i18n, "nav.social_media")}>Social Media</a></li>',
        f"{i}  </ul>",
        f"{i}</nav>",
    ]) + "\n"


def process(path: Path) -> dict:
    rel = path.relative_to(ROOT).as_posix()
    text = path.read_text(encoding="utf-8")
    r = {"file": rel, "status": "ok", "notes": []}
    if MARKER in text:
        r["status"], r["notes"] = "skipped", ["column already present"]
        return r
    cm = CONNECT.search(text)
    pm = PREFIX.search(text)
    if not cm or not pm:
        r["status"], r["notes"] = "skipped", ["no Connect nav or contact link"]
        return r
    use_i18n = 'data-i18n="footer.' in text or 'data-i18n="nav.' in text
    col = build_column(cm.group("indent"), pm.group("prefix"), use_i18n)
    text = text[: cm.start()] + col + text[cm.start():]
    r["text"] = text
    return r


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
        and 'af-footer__nav' in p.read_text(encoding="utf-8", errors="ignore")
    )
    if args.limit:
        files = files[: args.limit]

    audit = {"script": "footer_unified_field", "ts": int(time.time()), "dry_run": args.dry_run, "files": []}
    changed = skipped = 0
    for path in files:
        r = process(path)
        if r["status"] == "ok" and not args.dry_run:
            path.write_text(r["text"], encoding="utf-8")
        r.pop("text", None)
        audit["files"].append(r)
        changed += r["status"] == "ok"
        skipped += r["status"] != "ok"

    audit["summary"] = {"files_seen": len(files), "changed": changed, "skipped": skipped}
    AUDIT = ROOT / "data" / "audit"
    AUDIT.mkdir(parents=True, exist_ok=True)
    out = AUDIT / f"footer-unified-field-{time.strftime('%Y%m%dT%H%M%S')}.json"
    out.write_text(json.dumps(audit, indent=2))
    print(json.dumps(audit["summary"]))
    for f in audit["files"]:
        print(("OK " if f["status"] == "ok" else "SKIP"), f["file"], "; ".join(f["notes"]))
    print(f"audit: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
