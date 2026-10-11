# Verbal Aikido content validation

This directory contains the PDF-derived Chapter 2 reference and a dependency-free validator for the Story-mode prototype.

## Run

From the repository root:

```sh
node va-game/tests/validate-content.js
```

If `va-game/content.json` has not been generated yet, the script prints `content.json not found; run later` and exits 0. Otherwise it finds Chapter 2 by `id: "ch2"` or title `My first Dojo`, validates it, and exits 0 only when no validation errors remain.

## Result types

- **ERROR / exit 1:** missing chapter, node, or choice; orphaned actual node; meter/node/delta mismatch; invalid meter transition; missing reference path; or wrong terminal outcome.
- **WARNING / exit 0 if warnings are the only findings:** attack/reply wording differs significantly. Punctuation, smart quotes, case, and whitespace are normalized before comparison.
- **Parse/structural failure / exit 2:** either JSON file cannot be parsed.

The validator accepts these content layouts: a chapter at `chapter2` or `ch2`, an item in top-level `chapters`, an item in `story.chapters`, or `story.chapter2`. The Chapter 2 object itself must use the reference schema: `startNode`, a node map keyed by stable IDs, and choices containing `text`, `type`, `meterDelta`, `nextNode`, and `outcome`.

## Files and normalization

- `chapter2-reference.json` is the normalized, machine-readable source of truth for PDF pages 8–11.
- `path-inventory.md` maps every PDF variable to a stable node ID, inventories all 43 paths and meter trajectories, and records unresolved source ambiguities.
- `validate-content.js` compares `../content.json` with the reference using only Node.js built-ins.

The PDF contradicts itself about two `reply4$ = J` continuations and the A route from X1. No source route is silently dropped: both J continuations are required, while the explicit page-11 X1-A result (Y2/partial) takes precedence over the earlier `GOTO Y1`. Missing source meter deltas remain JSON `null`; they are not guessed or treated as zero.
