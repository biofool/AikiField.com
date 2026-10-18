#!/usr/bin/env python3
"""Rename the method/brand "Quantum Aikido" -> "The Creative Unified Field".

Scope decision (issue discussion): method/brand references are renamed.
PROTECTED, left verbatim:
  - The published book title "Quantum Aikido: The Power of Harmony"
  - Quoted/testimonial content (blockquotes, testimonial-quote markup,
    JSON keys matching quote/review/testimonial/praise/reader/wisdom_quotes)
  - Real YouTube video titles (data/youtube-titles.json)
  - Corpus documents and manuscripts (content, not branding)
  - URLs/domains/code identifiers (they don't contain the spaced form anyway)

Replacement rules:
  - "a/an Quantum Aikido" -> "a/an Creative Unified Field" (drop The)
  - "QUANTUM AIKIDO" (all caps) -> "THE CREATIVE UNIFIED FIELD"
  - sentence/standalone position -> "The Creative Unified Field"
  - mid-sentence -> "the Creative Unified Field" (like "the Beatles")

Usage:
  python3 scripts/fix/rename_unified_field.py --repo aikifield --dry-run
  python3 scripts/fix/rename_unified_field.py --repo aikifield --apply
  python3 scripts/fix/rename_unified_field.py --repo airm --root ~/projects/github/AIRichardMoon --dry-run

Writes an audit record to data/audit/rename-unified-field-<ts>.json
under the AikiField repo root.
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
# Keys holding verbatim quote content: reviewer./reader./testimonial.
# prefixes, or keys ending in .quote / .page_quote / .blockquote.
# CTA labels like "reviews.experience_quantum_aikido" are NOT protected.
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

# Spans that must never be rewritten: URLs (real external links would break),
# href/src attribute values (file names keep their old names), and Markdown
# link targets.
PROTECT_SPAN_RE = re.compile(
    r"https?://[^\s\"'<>\)]+"
    r"|(?:href|src)\s*=\s*[\"'][^\"']+[\"']"
    r"|\]\([^)]*\)"
)

# --- Replacement engine -------------------------------------------------

_SENTENCE_START_CHARS = set(">\"'(\n\r-–—|#:")

def _repl_outside_protected(seg: str) -> str:
    # Existing article absorbs the "The": "the Quantum Aikido" ->
    # "the Creative Unified Field" (not "the the ...").
    seg = re.sub(r"\bthe(\s*[*_]+)?\s+Quantum Aikido\b", r"the\1 Creative Unified Field", seg)
    seg = re.sub(r"\bThe(\s*[*_]+)?\s+Quantum Aikido\b", r"The\1 Creative Unified Field", seg)
    # Articles: "a Quantum Aikido" -> "a Creative Unified Field"
    seg = re.sub(r"\b([Aa]n?)\s+Quantum Aikido\b", r"\1 Creative Unified Field", seg)
    # All-caps brand mentions (logos, headers)
    seg = re.sub(r"QUANTUM AIKIDO", "THE CREATIVE UNIFIED FIELD", seg)

    def _word(m: re.Match) -> str:
        i = m.start() - 1
        prev = ""
        while i >= 0 and seg[i] == " ":
            i -= 1
        if i >= 0:
            prev = seg[i]
        if m.start() == 0 or prev in ".!?" or prev in _SENTENCE_START_CHARS:
            return "The Creative Unified Field"
        return "the Creative Unified Field"

    return re.sub(r"Quantum Aikido", _word, seg)


def transform_line(line: str, in_blockquote: bool, protect_line: bool) -> str:
    if (
        in_blockquote
        or protect_line
        or ("Quantum Aikido" not in line and "QUANTUM AIKIDO" not in line and "quantum-aikido" not in line)
    ):
        return line
    # Markdown anchor slugs first: the heading text is renamed, so
    # `(#...quantum-aikido...)` fragment targets must follow. File links
    # (`](path/quantum-aikido-x.md)`) are masked below instead — files
    # keep their names.
    line = re.sub(
        r"\(#([^)]*?)quantum-aikido([^)]*?)\)",
        r"(#\1the-creative-unified-field\2)",
        line,
    )
    # Mask the published book title and URL/link-target spans before replacing.
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
    # A <blockquote> opening tag on the same line as content must protect
    # that line too (the state machine only marks the NEXT line).
    if BLOCKQUOTE_OPEN_RE.search(line):
        return True
    if TESTIMONIAL_LINE_RE.search(line) or JS_QUOTE_KEY_RE.search(line):
        return True
    if ext == ".json":
        m = JSON_KEY_RE.match(line)
        if m and PROTECT_KEY_RE.search(m.group(1)):
            return True
    return False


# --- File selection ------------------------------------------------------

AIKIFIELD_EXCLUDE_DIRS = {
    ".git", "node_modules", "input", "docs", "data/audit", ".devin",
    "ci-results", "venv", ".venv",
}
AIKIFIELD_EXCLUDE_FILES = {
    "data/youtube-titles.json",          # real YouTube titles — verbatim
    "data/translation-cache.json",       # cache of translations, regenerated
}

AIRM_INCLUDE_DIRS = (
    "frontend", "proxy-php", "backend/app", "backend/tests",
    "backend/policies", "backend/scripts", "backend/infra",
    "docs", ".ai-context", "deploy.d",
)
AIRM_EXCLUDE_DIRS = ("backend/data", "data/audit")
AIRM_INCLUDE_FILES = {
    "README.md", "CLAUDE.md", "AGENTS.md", "PR-FAQ.md", "TICKETS.md",
    "Interns.md", "TECHNOLOGY-UNDERPINNINGS.md", "init.md",
    "backend/PRD.md", "backend/mock_server.py", "deploy.sh",
}


def iter_files(root: Path, repo: str):
    if repo == "aikifield":
        for p in sorted(root.rglob("*")):
            if not p.is_file() or p.suffix.lower() not in TEXT_EXTS:
                continue
            rel = p.relative_to(root).as_posix()
            parts = rel.split("/")
            if any("/".join(parts[: i + 1]) in AIKIFIELD_EXCLUDE_DIRS for i in range(len(parts))):
                continue
            if rel in AIKIFIELD_EXCLUDE_FILES or p.suffix == ".dvc":
                continue
            yield p
    else:  # airm
        for p in sorted(root.rglob("*")):
            if not p.is_file() or p.suffix.lower() not in TEXT_EXTS:
                continue
            rel = p.relative_to(root).as_posix()
            if any(rel == d or rel.startswith(d + "/") for d in AIRM_EXCLUDE_DIRS):
                continue
            if rel in AIRM_INCLUDE_FILES:
                yield p
            elif any(rel == d or rel.startswith(d + "/") for d in AIRM_INCLUDE_DIRS):
                yield p


def process_file(path: Path, root: Path, apply: bool) -> dict | None:
    rel = path.relative_to(root).as_posix()
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None
    if (
        "Quantum Aikido" not in text
        and "QUANTUM AIKIDO" not in text
        and "quantum-aikido" not in text
    ):
        return None

    lines = text.splitlines(keepends=True)
    out_lines = []
    changes = []
    in_blockquote = False
    for i, line in enumerate(lines, 1):
        protect = _protected_line(line, path.suffix.lower())
        new = transform_line(line, in_blockquote, protect)
        if in_blockquote or protect:
            in_line_protected = line.count("Quantum Aikido") + line.count("QUANTUM AIKIDO")
            if in_line_protected:
                changes.append({"line": i, "action": "protected", "text": line.strip()[:140]})
        elif new != line:
            changes.append({"line": i, "action": "renamed", "before": line.strip()[:140], "after": new.strip()[:140]})
        out_lines.append(new)
        # blockquote state machine (last so the open/close tags' own line is covered)
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
    ap.add_argument("--repo", choices=["aikifield", "airm"], required=True)
    ap.add_argument("--root", default=None, help="repo root (default: AikiField for aikifield, required for airm)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--offset", type=int, default=0)
    args = ap.parse_args()

    if args.repo == "aikifield":
        root = Path(args.root).resolve() if args.root else SCRIPT_ROOT
    else:
        if not args.root:
            sys.exit("--root required for --repo airm")
        root = Path(args.root).resolve()

    if not args.dry_run and not args.apply:
        sys.exit("specify --dry-run or --apply")

    records = []
    for p in iter_files(root, args.repo):
        rec = process_file(p, root, apply=args.apply)
        if rec:
            records.append(rec)

    page = records[args.offset : args.offset + args.limit if args.limit else None]
    audit_dir = SCRIPT_ROOT / "data" / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    audit_path = audit_dir / ("rename-unified-field-%s.json" % time.strftime("%Y%m%dT%H%M%S"))
    audit = {
        "repo": args.repo,
        "root": str(root),
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
