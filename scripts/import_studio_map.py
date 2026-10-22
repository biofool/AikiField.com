#!/usr/bin/env python3
"""Import the worldwide studio map from quantumaikido.com into AikiField.com.

AikiField.com is the flagship site; the map moves here from the legacy
quantumaikido.com repo (biofool/AikiField.com#102). This repo is PUBLIC, so
the import strips studio contact fields: email ("em"), phone ("ph") and
street address ("addr") never enter this repo. Studios add contact details
later through the claim-listing flow.

What it does:
  1. Copies the built map page data/studios-map.html to
     somatic-studios/map/index.html, rebranded and with a <title>.
  2. Copies manifest.json, studios-geo-tree.json, continents.geo.json.
  3. Copies only the studios-data/*.json files that manifest.json references.
  4. Rewrites studios-detail/<continent>.json without "em", "ph", "addr",
     and without any value that holds an email or a phone link.
  5. Removes destination data files that the manifest no longer references.
  6. Runs --check on the result and writes an audit JSON to data/audit/.

Leaflet and Leaflet.markercluster are vendored once under js/vendor/ and are
not touched by this script.

Usage:
    python3 scripts/import_studio_map.py --dry-run
    python3 scripts/import_studio_map.py
    python3 scripts/import_studio_map.py --source ~/projects/github/quantumaikido.com
    python3 scripts/import_studio_map.py --check   # verify committed files only
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = Path.home() / "projects" / "github" / "quantumaikido.com"
DEST = REPO / "somatic-studios" / "map"
AUDIT_DIR = REPO / "data" / "audit"

# Contact keys that must never be committed to this public repo: email,
# phone, and street address (may be a home address for home-based teachers).
FORBIDDEN_KEYS = frozenset({"em", "ph", "addr", "email", "emails", "phone", "phones"})
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Links that carry a phone number: WhatsApp click-to-chat and tel: URLs.
PHONE_URL_RE = re.compile(r"wa\.me/|whatsapp\.com/send|^\s*tel:", re.IGNORECASE)

COPY_AS_IS = ("manifest.json", "studios-geo-tree.json", "continents.geo.json")

# (old, new) page edits. Each "old" must occur exactly once in the source page.
PAGE_EDITS = (
    (
        '<meta charset="UTF-8" />',
        '<meta charset="UTF-8" />\n    <title>Worldwide Studio Map — AikiField</title>\n'
        '    <link rel="canonical" href="https://aikifield.com/somatic-studios/map/">',
    ),
    (
        "<h1>Quantum Aikido — Worldwide Studio Map</h1>",
        "<h1>Worldwide Studio Map</h1>",
    ),
    # The page lives next to its data here, so the absolute /data/ path goes.
    ("fetch('/data/continents.geo.json')", "fetch('continents.geo.json')"),
)

log = logging.getLogger("import_studio_map")


def find_forbidden(node, path="$"):
    """Yield JSON paths of forbidden keys or email-like strings in node."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key in FORBIDDEN_KEYS:
                yield f"{path}.{key}"
            yield from find_forbidden(value, f"{path}.{key}")
    elif isinstance(node, list):
        for i, value in enumerate(node):
            if path.endswith("._keys") and value in FORBIDDEN_KEYS:
                yield f"{path}[{i}]={value}"
            yield from find_forbidden(value, f"{path}[{i}]")
    elif isinstance(node, str) and EMAIL_RE.search(node):
        yield f"{path} (email-like value)"
    elif isinstance(node, str) and PHONE_URL_RE.search(node):
        yield f"{path} (phone link)"


def strip_detail(doc: dict) -> tuple[dict, int]:
    """Return a studios-detail document without contact fields, and the count removed."""
    keys = doc.get("_keys")
    by_id = doc.get("byId")
    if not isinstance(keys, list) or not isinstance(by_id, dict):
        raise ValueError("studios-detail file lacks the _keys/byId layout")
    removed = 0
    out = {}
    for sid, rec in by_id.items():
        if not isinstance(rec, dict):
            raise ValueError(f"studios-detail record {sid} is not an object")
        # Scraped "web" values are sometimes an email dressed as a URL
        # (http://name@example.com) or a WhatsApp link with a phone number;
        # drop any value that holds either.
        clean = {
            k: v
            for k, v in rec.items()
            if k not in FORBIDDEN_KEYS
            and not (isinstance(v, str) and (EMAIL_RE.search(v) or PHONE_URL_RE.search(v)))
        }
        removed += sum(1 for k, v in rec.items() if v and k not in clean)
        out[sid] = clean
    return {"_keys": [k for k in keys if k not in FORBIDDEN_KEYS], "byId": out}, removed


def dump(doc) -> str:
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":"))


def check(dest: Path) -> list[str]:
    """Scan every JSON file under dest for contact data. Return the problems."""
    problems = []
    files = sorted(dest.rglob("*.json"))
    if not files:
        problems.append(f"no JSON files under {dest}")
    for f in files:
        try:
            doc = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            problems.append(f"{f.relative_to(REPO)}: unreadable ({exc})")
            continue
        for hit in find_forbidden(doc):
            problems.append(f"{f.relative_to(REPO)}: {hit}")
            if len(problems) > 50:
                return problems
    page = dest / "index.html"
    if page.exists() and "Quantum Aikido" in page.read_text(encoding="utf-8"):
        problems.append(f"{page.relative_to(REPO)}: still says 'Quantum Aikido'")
    return problems


def build_page(src_page: Path) -> str:
    html = src_page.read_text(encoding="utf-8")
    for old, new in PAGE_EDITS:
        n = html.count(old)
        if n != 1:
            raise ValueError(f"page edit expects 1 match of {old!r}, found {n}")
        html = html.replace(old, new)
    # Remaining brand mentions are source-file comments; neutralise them.
    return html.replace("Quantum Aikido Worldwide Studio Map", "Worldwide Studio Map").replace(
        "Quantum Aikido studio map", "studio map"
    )


def run(source: Path, dry_run: bool) -> dict:
    src = source / "data"
    if not (src / "studios-map.html").is_file():
        raise FileNotFoundError(f"{src / 'studios-map.html'} not found — is --source the quantumaikido.com repo?")

    planned: dict[Path, str] = {DEST / "index.html": build_page(src / "studios-map.html")}

    for name in COPY_AS_IS:
        doc = json.loads((src / name).read_text(encoding="utf-8"))
        hits = list(find_forbidden(doc))
        if hits:
            raise ValueError(f"{name} holds contact data: {hits[:5]}")
        planned[DEST / name] = (src / name).read_text(encoding="utf-8")

    manifest = json.loads((src / "manifest.json").read_text(encoding="utf-8"))
    cat_files = sorted({c["file"] for c in manifest["categories"]})
    for rel in cat_files:
        if not rel.startswith("studios-data/") or ".." in rel:
            raise ValueError(f"unexpected category file path in manifest: {rel}")
        text = (src / rel).read_text(encoding="utf-8")
        hits = list(find_forbidden(json.loads(text)))
        if hits:
            raise ValueError(f"{rel} holds contact data: {hits[:5]}")
        planned[DEST / rel] = text

    contacts_removed = 0
    detail_files = sorted((src / "studios-detail").glob("*.json"))
    for f in detail_files:
        clean, removed = strip_detail(json.loads(f.read_text(encoding="utf-8")))
        contacts_removed += removed
        planned[DEST / "studios-detail" / f.name] = dump(clean)

    stale = [
        p
        for sub in ("studios-data", "studios-detail")
        for p in sorted((DEST / sub).glob("*.json"))
        if p not in planned
    ]

    summary = {
        "source": str(source),
        "dest": str(DEST.relative_to(REPO)),
        "category_files": len(cat_files),
        "detail_files": len(detail_files),
        "contact_values_removed": contacts_removed,
        "stale_removed": [str(p.relative_to(REPO)) for p in stale],
        "bytes_written": sum(len(t.encode("utf-8")) for t in planned.values()),
        "dry_run": dry_run,
    }
    if dry_run:
        for p in planned:
            log.info("would write %s", p.relative_to(REPO))
        return summary

    for path, text in planned.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    for p in stale:
        p.unlink()
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="quantumaikido.com checkout")
    ap.add_argument("--dry-run", action="store_true", help="show what would be written")
    ap.add_argument("--check", action="store_true", help="only scan the committed map files for contact data")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO if args.verbose or args.dry_run else logging.WARNING, format="%(message)s")

    if not args.check:
        try:
            summary = run(args.source.expanduser(), args.dry_run)
        except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
            log.error("import failed: %s", exc)
            return 1
        print(json.dumps(summary, indent=2))
        if args.dry_run:
            return 0
        AUDIT_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        (AUDIT_DIR / f"import_studio_map_{stamp}.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    problems = check(DEST)
    for p in problems:
        log.error("contact-data check: %s", p)
    if problems:
        return 1
    print("contact-data check: OK — no email/phone/address fields, emails, or phone links")
    return 0


if __name__ == "__main__":
    sys.exit(main())
