#!/usr/bin/env python3
"""Migrate quantumaikido.com linked resources into aikifield.com (issue #135).

Phase 1 — port QA pages into the AF repo root with transforms:
  * absolute https://quantumaikido.com URLs -> https://aikifield.com
  * QA-internal absolute links -> AF equivalents (link map below)
  * shared QA-template assets (/styles.css, /js/*, /subscribe-popup.js,
    /script.js, /favicon.ico) -> the /blog/ bundle (the already-ported
    QA-template asset set)
  * page-local assets (BookHeadShot.png, ReviewPortraits/*, PDFs, ...)
    -> root-level paths copied alongside

Phase 2 — copy binary/asset files (PDFs, images, ReviewPortraits, JS).

Phase 3 — repoint quantumaikido.com links in existing AF files to the new
  local paths (same link map). Skips auth/backend files, the real mailbox
  (mailto:kenneth@quantumaikido.com), Instagram, and corpus/docs content.

Usage:
  python3 scripts/fix/migrate_qa_resources.py --qa-root ~/projects/github/quantumaikido.com --dry-run
  python3 scripts/fix/migrate_qa_resources.py --qa-root ~/projects/github/quantumaikido.com --apply

Writes an audit record to data/audit/migrate-qa-resources-<ts>.json.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import time
from pathlib import Path

AF_ROOT = Path(__file__).resolve().parents[2]

# ── Pages to port: QA file -> AF file ───────────────────────────────────────
PAGE_COPIES = {
    "glossary.html": "glossary.html",
    "media-kit.html": "media-kit.html",
    "richard-moon.html": "richard-moon.html",
    "resources.html": "resources.html",
    "privacy.html": "privacy.html",
    "terms.html": "terms.html",
    "reviews.html": "reviews.html",
    "podcasts.html": "podcasts.html",
    "sangha.html": "sangha.html",
    "about.html": "about.html",
    "free_chapter.html": "free_chapter.html",
    "book.html": "book.html",
    "media.html": "media.html",
    "books/print-on-demand.html": "books/print-on-demand.html",
    "books/egbert_bigger_world.html": "books/egbert_bigger_world.html",
}

# ── Binary/asset copies: QA path -> AF path ─────────────────────────────────
ASSET_COPIES = {
    "js/page-toc.js": "blog/js/page-toc.js",
    "script.js": "blog/js/script.js",
    "sangha-wordcloud.png": "sangha-wordcloud.png",
    "assets/RichardMoonPortrait.jpg": "assets/RichardMoonPortrait.jpg",
    "assets/Quantum_Aikido_Sangha_Chapter1.pdf": "assets/Quantum_Aikido_Sangha_Chapter1.pdf",
    "ReviewPortraits/HiroshiIkeda.webp": "ReviewPortraits/HiroshiIkeda.webp",
    "ReviewPortraits/PeterRalston.jpeg": "ReviewPortraits/PeterRalston.jpeg",
    "ReviewPortraits/RichardStrozziHeckler.jpg": "ReviewPortraits/RichardStrozziHeckler.jpg",
    "ReviewPortraits/WilliamIsaacs.jpeg": "ReviewPortraits/WilliamIsaacs.jpeg",
    "books/AdventuresinAiki-land.pdf": "books/AdventuresinAiki-land.pdf",
    "books/AFYL.pdf": "books/AFYL.pdf",
    "books/AikidoandTheTransformationInEgbert.pdf": "books/AikidoandTheTransformationInEgbert.pdf",
    "books/CreateABeautifulWorldIn3AikidoLessons.pdf": "books/CreateABeautifulWorldIn3AikidoLessons.pdf",
    "books/HealingWithKi.pdf": "books/HealingWithKi.pdf",
    "books/Lifein3EasyLessons.pdf": "books/Lifein3EasyLessons.pdf",
    "books/River.pdf": "books/River.pdf",
    "books/TenToTheTenth.pdf": "books/TenToTheTenth.pdf",
    "books/ThalamicDiscourses.pdf": "books/ThalamicDiscourses.pdf",
    "books/TheBusinessofListening.pdf": "books/TheBusinessofListening.pdf",
    "books/tpoel.pdf": "books/tpoel.pdf",
    "books/egbert_bigger_world.md": "books/egbert_bigger_world.md",
}

# ── Link map: QA public path -> AF path ─────────────────────────────────────
# Applied to both absolute https://quantumaikido.com<path> URLs and to
# QA-internal absolute href="/<path>" links inside ported pages.
# Order matters: longest/most-specific paths first.
LINK_MAP = [
    ("/data/ask-richard-moon/schema/", "/data/ask/schema/", True),
    ("/data/i18n-config.schema.json", "https://aikifield.com/data/i18n-config.schema.json", False),
    ("/books/print-on-demand", "/books/print-on-demand", False),
    ("/books/", "/books.html", False),
    ("/book", "/book", False),
    ("/blog/", "/blog/", True),
    ("/blog", "/blog/", False),
    ("/glossary", "/glossary", False),
    ("/media-kit", "/media-kit", False),
    ("/media", "/media", False),
    ("/richard-moon", "/richard-moon", False),
    ("/resources", "/resources", False),
    ("/privacy", "/privacy", False),
    ("/terms", "/terms", False),
    ("/reviews", "/reviews", False),
    ("/podcasts", "/podcasts", False),
    ("/sangha", "/sangha", False),
    ("/about", "/about", False),
    ("/free_chapter", "/free_chapter", False),
    ("/members", "/members", False),
    ("/login", "/login.php", False),
    ("/contact", "/contact.html", False),
    ("/#author", "/richard-moon", False),
]

# File extensions that mark a linked file (kept verbatim under /books/ etc.).
FILE_EXT_RE = re.compile(r"\.[a-z0-9]{2,5}$", re.I)

# QA-relative asset paths used by the shared template -> /blog/ bundle.
TEMPLATE_ASSET_MAP = [
    ("/styles.css", "/blog/styles.css"),
    ("/js/language-selector.js", "/blog/js/language-selector.js"),
    ("/js/locale-utils.js", "/blog/js/locale-utils.js"),
    ("/js/page-toc.js", "/blog/js/page-toc.js"),
    ("/subscribe-popup.js", "/blog/subscribe-popup.js"),
    ("/script.js", "/blog/js/script.js"),
    ("/favicon.ico", "/blog/favicon.ico"),
    ("/data/i18n-strings/", "/blog/data/i18n-strings/"),
    ("/data/i18n-config.json", "/blog/data/i18n-config.json"),
    ("/data/category-terminology.json", "/blog/data/category-terminology.json"),
    ("/data/granularity-labels.json", "/blog/data/granularity-labels.json"),
]

# Page-local assets referenced relatively by ported pages -> root-level path.
LOCAL_ASSET_MAP = [
    ('src="BookHeadShot.png', 'src="/BookHeadShot.png'),
    ('src="sangha-wordcloud.png', 'src="/sangha-wordcloud.png'),
    ('src="ReviewPortraits/', 'src="/ReviewPortraits/'),
    ('href="egbert_bigger_world.md"', 'href="/books/egbert_bigger_world.md"'),
    ('href="RideTheLuckyWave.html"', 'href="/games/lucky-wave/"'),
    ('src="/assets/', 'src="/assets/'),
    ('href="/assets/', 'href="/assets/'),
    ('href="books/', 'href="/books/'),
]

# richard-moon/<sub> URLs 308 to /richard-moon on QA — collapse to the parent.
RICHARD_MOON_SUB_RE = re.compile(r'(href=")(?:https://aikifield\.com)?/richard-moon/[a-z0-9-]+(")')

# href="..." value rewriter: maps a QA path (or full QA URL) to an AF path.
# Returns (new_path, note) where note describes the outcome.
def map_path(path: str) -> tuple[str, str | None]:
    path = re.sub(r"^https://(?:quantumaikido|aikifield)\.com", "", path)
    if path.startswith("http"):
        return path, None  # external — leave
    if path == "" or path == "/":
        # QA site root -> the Unified Field section home on AF.
        return ("/blog/" if path == "/" else "https://aikifield.com"), "site-root"
    if not path.startswith("/"):
        return path, None  # relative — already local
    # Split query/fragment off for matching; reattach at the end.
    m = re.search(r"[?#]", path)
    bare, suffix = (path[: m.start()], path[m.start():]) if m else (path, "")
    for src, dst, prefix_ok in LINK_MAP:
        if prefix_ok and bare.startswith(src):
            return dst + bare[len(src):] + suffix, None
        if bare == src or (src.endswith("/") and bare == src[:-1]):
            return dst + suffix, None
    # /richard-moon/<sub> 308s to the parent on QA — collapse.
    if bare.startswith("/richard-moon/"):
        return "/richard-moon" + suffix, "richard-moon-sub"
    # File links keep their path verbatim only when AF actually serves the
    # file (existing or in this migration's copy list); otherwise fall
    # through to the existence checks so a /blog/ twin can be found.
    if FILE_EXT_RE.search(bare) and (
        (AF_ROOT / bare.lstrip("/")).exists() or bare.lstrip("/") in ASSET_COPIES.values()
    ):
        return bare + suffix, "file"
    # Unmapped page path: keep it if AF serves it (extensionless or file),
    # or will after this migration copies it.
    af = AF_ROOT / bare.lstrip("/")
    planned = bare.lstrip("/") + ".html"
    if af.exists() or af.with_suffix(".html").exists() or planned in PAGE_COPIES.values():
        return bare + suffix, "exists-on-af"
    if (AF_ROOT / "blog" / bare.lstrip("/")).exists():
        return "/blog" + bare + suffix, "exists-under-blog"
    return bare + suffix, f"UNMAPPED {path}"


def transform_page(text: str, rel: str) -> tuple[str, list[str]]:
    notes: list[str] = []
    # 1) Domain swap for absolute URLs (canonical, og, schema, hrefs).
    text = text.replace("https://quantumaikido.com", "https://aikifield.com")
    # 2) Template asset paths -> /blog/ bundle.
    for src, dst in TEMPLATE_ASSET_MAP:
        text = text.replace('href="' + src, 'href="' + dst).replace('src="' + src, 'src="' + dst)
        text = text.replace("'" + src, "'" + dst).replace('"' + src, '"' + dst)
    # 3) href="/path" (now aikifield absolute or QA-internal) -> link map.
    def _href(m: re.Match) -> str:
        url = m.group(2)
        new, note = map_path(url)
        if new != url or (note and note.startswith("UNMAPPED")):
            notes.append(f"{url} -> {new}" + (f" [{note}]" if note else ""))
        return m.group(1) + new + m.group(3)
    text = re.sub(r'(href=")((?:https://aikifield\.com)?/[^"]*)(")', _href, text)
    # Canonical/hreflang URLs must stay absolute.
    text = re.sub(
        r'(<link rel="canonical" href=")(/[^"]*")',
        lambda m: m.group(1) + "https://aikifield.com" + m.group(2),
        text,
    )
    # 4) /richard-moon/<sub> -> /richard-moon (QA 308 behaviour).
    text = RICHARD_MOON_SUB_RE.sub(r"\1/richard-moon\2", text)
    # 5) Page-local relative assets -> root-level copies.
    for src, dst in LOCAL_ASSET_MAP:
        text = text.replace(src, dst)
    return text, notes


# ── Phase 3: repoint links in existing AF files ─────────────────────────────

# Files/dirs where quantumaikido.com references are functional (backend
# endpoints, real email, SSH key names, historical docs) — do not rewrite.
SKIP_FILES = {
    "coach-proxy.php", "coach-config.php", "coach-config.staging.php",
    "coach-config.local.php", "includes/coach-config.load.php",
    "login.php", "includes/beta-gate.load.php", "includes/for-review-serve.php",
    "dashboard.php", "sync.sh",
    # Manual handling: books.js builds QA-absolute URLs (rewritten to
    # root-relative by hand); projects.php links the live QA product.
    "js/books.js", "projects.php",
}
SKIP_DIRS = {
    ".git", "node_modules", "input", "docs", "data/audit", ".devin",
    "ci-results", "venv", ".venv", "for-review/documents", "logs",
}
TEXT_EXTS = {".html", ".htm", ".php", ".js", ".mjs", ".css", ".md", ".json", ".txt", ".xml"}

# hrefs to keep verbatim even though they contain the domain.
KEEP_RE = re.compile(r"mailto:kenneth@quantumaikido\.com|instagram\.com/quantumaikido|/profile\b")


def _is_skip(rel: str) -> bool:
    parts = rel.split("/")
    if rel in SKIP_FILES:
        return True
    return any("/".join(parts[: i + 1]) in SKIP_DIRS for i in range(len(parts)))


def repoint_file(path: Path, apply: bool) -> dict | None:
    rel = path.relative_to(AF_ROOT).as_posix()
    if _is_skip(rel):
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None
    if "quantumaikido.com" not in text:
        return None

    changes: list[str] = []

    def _sub(m: re.Match) -> str:
        url = m.group(0)
        if KEEP_RE.search(url):
            return url
        new, note = map_path(url)
        if new != url:
            changes.append(f"{url} -> {new}" + (f" [{note}]" if note else ""))
        return new

    # Absolute URLs. The char class stops at prose/markup delimiters
    # (quotes, parens, brackets, backticks, commas, semicolons, braces).
    new = re.sub(r"https://quantumaikido\.com[^\s\"'<>\)\]`\\;{},]*", _sub, text)

    if new == text:
        return None
    if apply:
        path.write_text(new, encoding="utf-8")
    return {"file": rel, "changes": changes}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--qa-root", required=True, help="path to the quantumaikido.com repo")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--offset", type=int, default=0)
    args = ap.parse_args()
    if not args.dry_run and not args.apply:
        sys.exit("specify --dry-run or --apply")

    qa = Path(args.qa_root).resolve()
    if not (qa / "glossary.html").exists():
        sys.exit(f"QA repo not found at {qa}")

    audit: dict = {"pages": [], "assets": [], "repointed": [], "warnings": []}

    # Phase 1 — port pages.
    for qa_rel, af_rel in sorted(PAGE_COPIES.items()):
        src = qa / qa_rel
        dst = AF_ROOT / af_rel
        if not src.exists():
            audit["warnings"].append(f"missing QA page: {qa_rel}")
            continue
        text, notes = transform_page(src.read_text(encoding="utf-8"), qa_rel)
        if args.apply:
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(text, encoding="utf-8")
        audit["pages"].append({"from": qa_rel, "to": af_rel, "links_rewritten": notes})

    # Phase 2 — copy assets.
    for qa_rel, af_rel in sorted(ASSET_COPIES.items()):
        src = qa / qa_rel
        dst = AF_ROOT / af_rel
        if not src.exists():
            audit["warnings"].append(f"missing QA asset: {qa_rel}")
            continue
        if args.apply:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
        audit["assets"].append({"from": qa_rel, "to": af_rel, "bytes": src.stat().st_size})

    # Phase 3 — repoint links in existing AF files.
    files = [
        p for p in sorted(AF_ROOT.rglob("*"))
        if p.is_file() and p.suffix.lower() in TEXT_EXTS
    ]
    page = files[args.offset : args.offset + args.limit if args.limit else None]
    for p in page:
        rec = repoint_file(p, apply=args.apply)
        if rec:
            audit["repointed"].append(rec)

    out_dir = AF_ROOT / "data" / "audit"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / ("migrate-qa-resources-%s.json" % time.strftime("%Y%m%dT%H%M%S"))
    out.write_text(json.dumps({"mode": "apply" if args.apply else "dry-run", **audit}, indent=2, ensure_ascii=False))
    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "pages": len(audit["pages"]),
        "assets": len(audit["assets"]),
        "repointed_files": len(audit["repointed"]),
        "warnings": audit["warnings"],
        "audit": str(out),
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
