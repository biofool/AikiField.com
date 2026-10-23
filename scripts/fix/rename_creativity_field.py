#!/usr/bin/env python3
"""Rename the method/brand to "Creativity in the Unified Field" (issue #135).

Follow-up to scripts/fix/rename_unified_field.py: the intermediate name
"The Creative Unified Field" is superseded. This pass renames BOTH
  - "The/the/a Creative Unified Field" -> "Creativity in the Unified Field"
  - remaining "Quantum Aikido" mentions  -> "Creativity in the Unified Field"

PROTECTED, left verbatim (same rules as the first pass):
  - The published book title "Quantum Aikido: The Power of Harmony"
  - Quoted/testimonial content (blockquotes, testimonial-quote markup,
    JSON keys matching quote/review/testimonial/praise/reader/wisdom_quotes)
  - Real YouTube video titles (data/youtube-titles.json)
  - URLs/domains/href/src values (they keep their old names)
  - Corpus documents in for-review/documents keep their protection rules

Usage:
  python3 scripts/fix/rename_creativity_field.py --dry-run
  python3 scripts/fix/rename_creativity_field.py --apply

Writes an audit record to data/audit/rename-creativity-field-<ts>.json.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

SCRIPT_ROOT = Path(__file__).resolve().parents[2]

TEXT_EXTS = {
    ".html", ".htm", ".php", ".js", ".mjs", ".css", ".md", ".json", ".txt",
    ".py", ".sh", ".tf",
}
PROTECT_KEY_RE = re.compile(
    r"(?:^|\.)(?:reviewer|reader|testimonial|featured_quote)\.|\.(?:quote|page_quote|blockquote)$",
    re.I,
)
BOOK_TITLE_RE = re.compile(r"Quantum Aikido\s*[:—–-]\s*The\s+[Pp]ower\s+of\s+[Hh]armony")
JSON_KEY_RE = re.compile(r'^\s*"([^"]+)"\s*:')
BLOCKQUOTE_OPEN_RE = re.compile(r"<blockquote", re.I)
BLOCKQUOTE_CLOSE_RE = re.compile(r"</blockquote>", re.I)
TESTIMONIAL_LINE_RE = re.compile(r'testimonial|class="[^"]*quote', re.I)

MASK_FMT = "\x00QAPROT%d\x1f"

PROTECT_SPAN_RE = re.compile(
    r"https?://[^\s\"'<>\)]+"
    r"|(?:href|src)\s*=\s*[\"'][^\"']+[\"']"
    r"|\]\([^)]*\)"
)

# --- Replacement engine -------------------------------------------------

NEW_NAME = "Creativity in the Unified Field"
NEW_NAME_CAPS = "CREATIVITY IN THE UNIFIED FIELD"

# (pattern, replacement) — ordered; first match wins per pass.
_RULES = [
    # Article + old brand -> bare new name (the new name takes no article).
    # The lookahead covers CJK/Hebrew strings where "the" is glued to the
    # preceding word (no word boundary), e.g. "…のthe Creative Unified Fieldの…".
    (r"[Tt]he(?=\s+(?:Creative Unified Field|Quantum Aikido))\s+", ""),
    (r"\b([Aa]n?)(\s*[*_]+)?\s+Creative Unified Field\b", r"\1\2 " + NEW_NAME),
    (r"\b([Aa]n?)(\s*[*_]+)?\s+Quantum Aikido\b", r"\1\2 " + NEW_NAME),
    (r"CREATIVE UNIFIED FIELD", NEW_NAME_CAPS),
    (r"QUANTUM AIKIDO", NEW_NAME_CAPS),
    (r"Creative Unified Field", NEW_NAME),
    (r"Quantum Aikido", NEW_NAME),
]
_COMPILED = [(re.compile(p), r) for p, r in _RULES]


def _repl_outside_protected(seg: str) -> str:
    for pat, rep in _COMPILED:
        seg = pat.sub(rep, seg)
    return seg


def transform_line(line: str, in_blockquote: bool, protect_line: bool) -> str:
    if (
        in_blockquote
        or protect_line
        or not re.search(r"Quantum Aikido|QUANTUM AIKIDO|Creative Unified Field|CREATIVE UNIFIED FIELD|quantum-aikido|the-creative-unified-field", line)
    ):
        return line
    # Markdown anchor slugs: renamed headings need renamed fragment targets.
    line = re.sub(
        r"\(#([^)]*?)(?:quantum-aikido|the-creative-unified-field)([^)]*?)\)",
        r"(#\1creativity-in-the-unified-field\2)",
        line,
    )
    protected: list[str] = []

    def _mask(m: re.Match) -> str:
        protected.append(m.group(0))
        return MASK_FMT % (len(protected) - 1)

    masked = BOOK_TITLE_RE.sub(_mask, line)
    masked = PROTECT_SPAN_RE.sub(_mask, masked)
    out = _repl_outside_protected(masked)
    for i, orig in enumerate(protected):
        out = out.replace(MASK_FMT % i, orig)
    return out


JS_QUOTE_KEY_RE = re.compile(r"\b(?:quote|testimonial|review|page_quote)\s*[:=]", re.I)


def _protected_line(line: str, ext: str) -> bool:
    if BLOCKQUOTE_OPEN_RE.search(line):
        return True
    if TESTIMONIAL_LINE_RE.search(line) or JS_QUOTE_KEY_RE.search(line):
        return True
    if ext == ".json":
        m = JSON_KEY_RE.match(line)
        if m and PROTECT_KEY_RE.search(m.group(1)):
            return True
    return False


EXCLUDE_DIRS = {
    ".git", "node_modules", "input", "docs", "data/audit", ".devin",
    "ci-results", "venv", ".venv",
    # Fix-script source/docstrings describe the old names on purpose.
    "scripts/fix",
}
EXCLUDE_FILES = {
    "data/youtube-titles.json",          # real YouTube titles — verbatim
    "data/translation-cache.json",       # cache of translations, regenerated
}

NEEDLE = re.compile(
    r"Quantum Aikido|QUANTUM AIKIDO|quantum-aikido"
    r"|Creative Unified Field|CREATIVE UNIFIED FIELD|the-creative-unified-field"
)


def iter_files(root: Path):
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.suffix.lower() not in TEXT_EXTS:
            continue
        rel = p.relative_to(root).as_posix()
        parts = rel.split("/")
        if any("/".join(parts[: i + 1]) in EXCLUDE_DIRS for i in range(len(parts))):
            continue
        if rel in EXCLUDE_FILES or p.suffix == ".dvc":
            continue
        yield p


def process_file(path: Path, root: Path, apply: bool) -> dict | None:
    rel = path.relative_to(root).as_posix()
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None
    if not NEEDLE.search(text):
        return None

    lines = text.splitlines(keepends=True)
    out_lines = []
    changes = []
    in_blockquote = False
    for i, line in enumerate(lines, 1):
        protect = _protected_line(line, path.suffix.lower())
        new = transform_line(line, in_blockquote, protect)
        if in_blockquote or protect:
            in_line_protected = len(NEEDLE.findall(line))
            if in_line_protected:
                changes.append({"line": i, "action": "protected", "text": line.strip()[:140]})
        elif new != line:
            changes.append({"line": i, "action": "renamed", "before": line.strip()[:140], "after": new.strip()[:140]})
        out_lines.append(new)
        if BLOCKQUOTE_OPEN_RE.search(line):
            in_blockquote = True
        if BLOCKQUOTE_CLOSE_RE.search(line):
            in_blockquote = False

    if not changes:
        return None
    if apply:
        path.write_text("".join(out_lines), encoding="utf-8")
    return {"file": rel, "changes": changes}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--offset", type=int, default=0)
    args = ap.parse_args()

    if not args.dry_run and not args.apply:
        sys.exit("specify --dry-run or --apply")

    root = SCRIPT_ROOT
    records = []
    for p in iter_files(root):
        rec = process_file(p, root, apply=args.apply)
        if rec:
            records.append(rec)

    page = records[args.offset : args.offset + args.limit if args.limit else None]
    audit_dir = SCRIPT_ROOT / "data" / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    audit_path = audit_dir / ("rename-creativity-field-%s.json" % time.strftime("%Y%m%dT%H%M%S"))
    audit = {
        "mode": "apply" if args.apply else "dry-run",
        "files_matched": len(records),
        "files_reported": len(page),
        "renames": sum(1 for r in page for c in r["changes"] if c["action"] == "renamed"),
        "protected": sum(1 for r in page for c in r["changes"] if c["action"] == "protected"),
        "records": page,
    }
    audit_path.write_text(json.dumps(audit, indent=2, ensure_ascii=False))
    print(json.dumps({k: v for k, v in audit.items() if k != "records"}, indent=2))
    print("audit:", audit_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
