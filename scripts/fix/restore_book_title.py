#!/usr/bin/env python3
"""Restore the published book title "Quantum Aikido" where the brand rename
(issue #135, commit 01f225c) incorrectly replaced it with
"Creativity in the Unified Field".

The Inner Traditions / Park Street Press book is titled *Quantum Aikido* and
that title does not change. Only occurrences that refer to the *book* are
restored: verbatim review/endorsement text, real podcast episode titles,
italicized title references, "by Richard Moon" bylines, publisher contexts,
and free-chapter/sangha references to the book. Brand/method/site-name uses
of "Creativity in the Unified Field" are untouched.

Each replacement is an exact (file, old, new) triple — no pattern matching —
so nothing outside the audited list can change.

Usage:
  python3 scripts/fix/restore_book_title.py --dry-run
  python3 scripts/fix/restore_book_title.py --apply [--limit N] [--offset N]

Writes an audit record to data/audit/restore-book-title-<ts>.json.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT_DIR = ROOT / "data" / "audit"

BOOK = "Quantum Aikido"
BRAND = "Creativity in the Unified Field"

# (file, old, new) — old must occur exactly `expected` times in the file.
REPLACEMENTS = [
    # book.html — meta/JSON-LD descriptions and the POD FAQ heading describe the book
    ("book.html", f"{BRAND} bridges ancient wisdom with modern physics.",
                 f"{BOOK} bridges ancient wisdom with modern physics.", 1),
    ("book.html", f"{BRAND} bridges ancient wisdom with modern physics, teaching readers",
                 f"{BOOK} bridges ancient wisdom with modern physics, teaching readers", 1),
    ("book.html", f"Is {BRAND} a print-on-demand book?",
                 f"Is {BOOK} a print-on-demand book?", 1),

    # books.html — "More about" links to /book (the book page)
    ("books.html", f"More about {BRAND}", f"More about {BOOK}", 1),

    # books/print-on-demand.html — contrasts POD titles with the commercial book
    ("books/print-on-demand.html",
     f"{BRAND} is commercially published by Inner Traditions / Park Street Press.",
     f"{BOOK} is commercially published by Inner Traditions / Park Street Press.", 2),
    ("books/print-on-demand.html", f"How this differs from {BRAND}",
     f"How this differs from {BOOK}", 1),

    # media-kit.html — press materials are for the book
    ("media-kit.html", f"Press materials for {BRAND} by Richard Moon",
     f"Press materials for {BOOK} by Richard Moon", 3),
    ("media-kit.html",
     f"{BRAND} transforms life by recognizing that the quality of engagements transforms the world.",
     f"{BOOK} transforms life by recognizing that the quality of engagements transforms the world.", 2),
    ("media-kit.html", f"the world. Through {BRAND}, discord informs",
     f"the world. Through {BOOK}, discord informs", 1),  # book-desc para only, not the bio
    ("media-kit.html", f"<em>{BRAND}</em> offers intellectually rigorous",
     f"<em>{BOOK}</em> offers intellectually rigorous", 1),
    ("media-kit.html",
     f"{BRAND} Reveals How Physics Principles Transform Human Conflict Into Creative Harmony",
     f"{BOOK} Reveals How Physics Principles Transform Human Conflict Into Creative Harmony", 1),

    # reviews.html — the page reviews the book; quotes and titles are verbatim
    ("reviews.html", f"| {BRAND} by Richard Moon", f"| {BOOK} by Richard Moon", 1),
    ("reviews.html", f"say about {BRAND} by Richard Moon",
     f"say about {BOOK} by Richard Moon", 3),
    ("reviews.html", f"Reviews & Endorsements | {BRAND}",
     f"Reviews & Endorsements | {BOOK}", 2),
    ("reviews.html", f"{BRAND} has been endorsed by pioneering thinkers and practitioners",
     f"{BOOK} has been endorsed by pioneering thinkers and practitioners", 1),
    ("reviews.html",
     f"{BRAND} is one of the most conceptually rigorous examinations",
     f"{BOOK} is one of the most conceptually rigorous examinations", 1),
    ("reviews.html", f"{BRAND} is not merely recommended reading",
     f"{BOOK} is not merely recommended reading", 1),

    # podcasts.html — real episode titles + "the book Quantum Aikido"
    ("podcasts.html",
     f"From Jug Band to {BRAND}: An Exploration of the Power of Harmony",
     f"From Jug Band to {BOOK}: An Exploration of the Power of Harmony", 1),
    ("podcasts.html", f"{BRAND}: The Flow of Wisdom and Practice",
     f"{BOOK}: The Flow of Wisdom and Practice", 1),
    ("podcasts.html", f"the book {BRAND}", f"the book {BOOK}", 1),
    ("podcasts.html", f"{BRAND} Deep Dive", f"{BOOK} Deep Dive", 1),

    # media.html — real episode title + topic tag
    ("media.html", f"{BRAND} Deep Dive", f"{BOOK} Deep Dive", 1),
    ("media.html", f'<span class="topic-tag">{BRAND}</span>',
     f'<span class="topic-tag">{BOOK}</span>', 1),

    # sangha.html — the free teaching is chapter 1 of the book
    ("sangha.html", f"Free Teaching: {BRAND}", f"Free Teaching: {BOOK}", 3),
    ("sangha.html", f"intimate teaching on {BRAND} free",
     f"intimate teaching on {BOOK} free", 1),
    ("sangha.html", f"'{BRAND} Sangha-Chapter1.pdf'",
     f"'{BOOK} Sangha-Chapter1.pdf'", 1),
    ("sangha.html", f'alt="{BRAND} by Richard Moon - book cover"',
     f'alt="{BOOK} by Richard Moon - book cover"', 1),

    # free_chapter.html — a free chapter of the book
    ("free_chapter.html", f"Free Chapter - {BRAND}", f"Free Chapter - {BOOK}", 1),
    ("free_chapter.html", f"Thank You for Your Interest in {BRAND}",
     f"Thank You for Your Interest in {BOOK}", 1),

    # blog — italicized / "writing" / "read" references name the book
    ("blog/cyprus.html", f"foreword to <em>{BRAND}</em>",
     f"foreword to <em>{BOOK}</em>", 1),
    ("blog/david-pearl.html", f"writing <em>{BRAND}</em>",
     f"writing <em>{BOOK}</em>", 2),
    ("blog/future-school.html", f"writing {BRAND}", f"writing {BOOK}", 1),
    ("blog/index.html", f"uses both: <em>{BRAND}</em> through Inner Traditions",
     f"uses both: <em>{BOOK}</em> through Inner Traditions", 1),
    ("blog/index.html", f"writing <em>{BRAND}</em>", f"writing <em>{BOOK}</em>", 1),
    ("blog/kenneth-kron.html", f"core teachings in <em>{BRAND}</em>",
     f"core teachings in <em>{BOOK}</em>", 1),
    ("blog/print-on-demand-publishing-for-authors.html",
     f"already read <em>{BRAND}</em>", f"already read <em>{BOOK}</em>", 1),
    ("blog/print-on-demand-publishing-for-authors.html",
     f"alongside <em>{BRAND}</em> itself", f"alongside <em>{BOOK}</em> itself", 1),
    ("blog/osensei_mindmap.html", f"writes in {BRAND}:",
     f"writes in {BOOK}:", 1),
    ("blog/osensei_mindmap.html", f"in {BRAND} as the unified field",
     f"in {BOOK} as the unified field", 1),
    ("blog/osensei_mindmap.html", f"{BRAND} itself is an expression of this teaching",
     f"{BOOK} itself is an expression of this teaching", 1),
    ("blog/subscribe-popup.js", f"Chapter One of <strong>{BRAND}</strong>",
     f"Chapter One of <strong>{BOOK}</strong>", 1),

    # data/ask — the stored quote must match the source page text
    ("data/ask/answers/what-is-quantum-aikido.json",
     f'"{BRAND} bridges ancient wisdom with modern physics"',
     f'"{BOOK} bridges ancient wisdom with modern physics"', 1),
    ("data/ask/sources/page-book.json",
     f"{BRAND} bridges ancient wisdom with modern physics",
     f"{BOOK} bridges ancient wisdom with modern physics", 1),

    # for-review OCR corpus — the link text is the Inner Traditions book title
    ("for-review/documents/ocr/AI-KI-DO-Intro-main-5.md", f"{BRAND}", f"{BOOK}", 1),
    ("for-review/documents/ocr/An-Aiki-Life-rev-i.md", f"{BRAND}", f"{BOOK}", 1),
]

# i18n keys whose value refers to the book (the brand stays English inside
# every locale file, so a substring replace inside these keys is safe).
I18N_KEYS = [
    "reviews.quantum_aikido_has_been_endorsed_by_pion",
    "richard-moon.author_quantum_aikido",
    "about.cyprus_desc",
    "about.previous_work_intro",
]
I18N_DIRS = ["blog/data/i18n-strings", "data/i18n-strings"]


def apply_replacements(changes, audit):
    buffers = {}
    for rel, old, new, expected in REPLACEMENTS:
        if rel not in buffers:
            buffers[rel] = (ROOT / rel).read_text(encoding="utf-8")
        text = buffers[rel]
        count = text.count(old)
        entry = {"file": rel, "old": old, "new": new,
                 "expected": expected, "found": count}
        if count != expected:
            entry["status"] = "SKIP — occurrence count mismatch"
            audit["skipped"].append(entry)
            continue
        buffers[rel] = text.replace(old, new)
        entry["status"] = "ok"
        audit["changed"].append(entry)
    if changes:
        for rel, text in buffers.items():
            (ROOT / rel).write_text(text, encoding="utf-8")


def apply_i18n(changes, audit):
    for d in I18N_DIRS:
        for path in sorted((ROOT / d).glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            touched = []
            for key in I18N_KEYS:
                val = data.get(key)
                if isinstance(val, str) and BRAND in val:
                    data[key] = val.replace(BRAND, BOOK)
                    touched.append(key)
            if not touched:
                continue
            entry = {"file": str(path.relative_to(ROOT)), "keys": touched}
            if changes:
                path.write_text(
                    json.dumps(data, ensure_ascii=False, indent=4) + "\n",
                    encoding="utf-8")
            audit["changed"].append(entry)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--offset", type=int, default=0)
    args = ap.parse_args()
    if args.dry_run == args.apply:
        ap.error("pass exactly one of --dry-run / --apply")

    global REPLACEMENTS
    REPLACEMENTS = REPLACEMENTS[args.offset:]
    if args.limit is not None:
        REPLACEMENTS = REPLACEMENTS[:args.limit]

    audit = {"ts": datetime.now(timezone.utc).isoformat(),
             "mode": "apply" if args.apply else "dry-run",
             "changed": [], "skipped": []}
    apply_replacements(args.apply, audit)
    if args.limit is None and args.offset == 0:
        apply_i18n(args.apply, audit)

    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    out = AUDIT_DIR / ("restore-book-title-"
                       + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
                       + ".json")
    out.write_text(json.dumps(audit, ensure_ascii=False, indent=2))
    print(f"{audit['mode']}: {len(audit['changed'])} changed, "
          f"{len(audit['skipped'])} skipped -> {out}")
    if audit["skipped"]:
        for s in audit["skipped"]:
            print("  SKIP", s["file"], "found", s["found"],
                  "expected", s["expected"], "::", s["old"][:60])
        sys.exit(1)


if __name__ == "__main__":
    main()
