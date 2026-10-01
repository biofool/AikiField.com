# Chapter 2 path inventory

Source: *VA App 2023*, PDF pages 8–11 (the extracted file labels these printed pages `p8`–`p11`). A path is a sequence of response types. Numbers are angry-face meter values after each response. `?` means the PDF supplies no delta.

## Normalized node mapping

`reply1$` → `attack1`; `reply2$` → `counterAttack`; `reply8$` → `submissiveAttack`; `reply3$` → `victimAttack`; `reply$7` → `disgustAttack`; `X1`/`reply4$` → `X1`; `reply9$` → `lyingAttack`; the unlabeled reply menu after “completely self-centered” → `selfCenteredAttack`; `X2`/`reply5$` → `X2`; `reply6$` → `longTimeAttack`; `Y1` → successful outcome; `Y2` → partial outcome; all “Try again/recommend lessons” exits → shared `retry` outcome.

## All 43 distinct paths

The compact inventory below is exhaustive: expand every prefix with every indented suffix. The number in parentheses is the number of concrete paths represented.

- `attack1 A` — meter `2→1`, then every **X1 suffix** below (14 paths).
- `attack1 C` — meter `2→3`:
  - `counterAttack C` — `3→4`, **retry**.
  - `counterAttack J` — `3→4`, **retry**.
  - `counterAttack A` — `3→1`, then every **X1 suffix** below (14 paths).
- `attack1 S` — meter `2→2`:
  - `submissiveAttack A` — `2→1`, then every **X2 suffix** below (3 paths).
  - `submissiveAttack V` — `2→3`:
    - `victimAttack J` — `3→4`, **retry**.
    - `victimAttack V` — `3→4`, **retry**.
    - `victimAttack A` — `3→1`, then every **X2 suffix** below (3 paths).
  - `submissiveAttack S` — `2→3`:
    - `disgustAttack S` — `3→4`, **retry**.
    - `disgustAttack N` — `3→?`, **retry**.
    - `disgustAttack A` — `3→1`, then every **X2 suffix** below (3 paths).

### X1 suffixes (14)

- `X1 A` — `1→0`, **partial** at Y2.
- `X1 J` — `1→2`; the PDF gives two contradictory continuations:
  - `lyingAttack V` — `2→3`, **retry**.
  - `lyingAttack J` — `2→3`, **retry**.
  - `lyingAttack A` — `2→1`, then every **X2 suffix** (3 paths).
  - `longTimeAttack C` — `2→4`, **retry**.
  - `longTimeAttack V` — `2→3`, **retry**.
  - `longTimeAttack A` — `2→0`, **success** at Y1.
- `X1 N` — `1→3`:
  - `selfCenteredAttack J` — `3→?`, **retry**.
  - `selfCenteredAttack C` — `3→?`, **retry**.
  - `selfCenteredAttack A` — `3→?`; the PDF resets X2 to 1, then every **X2 suffix** (3 paths).

### X2 suffixes (3)

- `X2 N` — `1→2`, **retry**.
- `X2 A` — `1→0`, **success** at Y1.
- `X2 C` — `1→3`, **retry**.

Totals: direct-A family 14 + initial-C family 16 + initial-S family 13 = **43 paths**. Outcomes: **success**, **partial**, or **retry** as marked above.

## PDF ambiguities and normalization decisions

- Page 9 says `If reply2$ = V/S`, but V and S are choices from `reply8$`; these transitions are assigned to `submissiveAttack`.
- The response variable is printed `reply$7`; normalized to the `disgustAttack` node.
- Page 10 introduces `reply9$`, although the surrounding numbering is non-sequential. It is retained as `lyingAttack` because it contains a distinct attack and choices.
- `X1` choice A says `GOTO Y1`, while page 11 explicitly says `reply4$ = A$` produces “Hmm. OK…” at Y2 and a partial/repeat result. The reference follows the more specific page-11 outcome: Y2/partial.
- `If reply4$ = J` appears twice with different attacks (`lyingAttack` and `longTimeAttack`). Neither is discarded. The reference records `lyingAttack` as the primary destination and `longTimeAttack` as `pdfAlternativeNextNode`; the validator requires both branches to be representable (for example, as duplicate J choices).
- The self-centered attack has no reply variable in the PDF; it receives its own stable node ID.
- No meter deltas are printed for disgust N or any self-centered reply. They are `null`, not inferred. The validator checks their path/outcome but does not invent arithmetic.
- The self-centered A response goes from a displayed meter of 3 to X2, whose stated meter is 1, but has no printed `-2`; this unresolved reset is preserved.
- Typos are preserved in reference text where fidelity matters (`I just trying`, `brining`, `Vicitim` is documented but the label is normalized to V). Curly quotes and punctuation differences are normalized by the validator.
