# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

AikiField.com — marketing site for the AikiField fractional-CISO /
security-leadership consultancy. Static HTML/CSS/JS + PHP includes, no
build step.

## Critical commands

```bash
./sync.sh dryrun                                 # deploy preview
./sync.sh --staging deploy                       # deploy staging (from staging branch)
bash tests/e2e/run.sh                            # e2e suite
```

## Global conventions (apply to every project)

The canonical home for cross-project rules is `AGENTS.md` (read by Devin).
The items below are mirrored here so Claude Code applies them too. If you
edit one, edit both.

- **Validation requests -- do not change code.** When asked to validate or
  check a conclusion, investigate and report only. Do not start editing code
  unless the user explicitly asks for a fix or implementation.
- **Never read secrets files.** Do not read, cat, or print `.env`,
  `.env.secrets`, `*.key`, `credentials*.json`, `service-account*.json`, or
  any file containing API keys, tokens, or passwords. Ask the user to
  provide credentials directly or via environment variables.
- **Never commit or log secrets.** Keep `.gitignore` entries for `.env`,
  `*.key`, `*.pem`, `credentials.json`, `cookies.txt`. Treat
  infrastructure-touching scripts as production-sensitive; prefer dry-run
  flags.
- **API cost comparisons -- be accurate and specific.** Verify pricing from
  official sources, distinguish per-call vs. subscription vs. tiered, compute
  break-even volume, separate marginal from total cost, account for free
  tiers, double-check arithmetic, state all assumptions.
- **Don't trust, verify.** Post-edit lint hooks run automatically
  (`.claude/hooks/post_edit_lint.py` for Claude Code, `magic-compact-devin`
  plugin hook for Devin): ruff/py_compile, `php -l`, `node --check`,
  `bash -n`/shellcheck, `json.tool`, gofmt, pyyaml — findings are defects,
  fix them. Before reporting done: run the repo's own gates, adversarially
  review the diff (callers, edge cases, leftovers, secrets, silent
  catches), and name the command that proves the claim. The
  `verify-change` skill encodes this gate.
- **Automate the annoying stuff.** A process explained more than once
  becomes a hook, a `scripts/` tool, or a `.devin/skills/<name>/SKILL.md`
  — not repeated prompt text.
- **Never fail silently.** Every exception or unavailable dependency must be
  logged at WARNING or ERROR with a specific message. No bare
  `except: pass` / `except: return`.
- **No backslash line continuations in shell commands shown to the user.**
  Long `gcloud`/`terraform`/`gsutil`/`kubectl` commands stay on one line.
- **One-off fix scripts** go in `scripts/fix/`, support `--dry-run`, write
  audit JSON to `data/audit/` (or `audit/`), and support `--limit`/`--offset`.
- **Prefer stored data files over hardcoding.** Never hardcode arrays or
  lookup tables with more than 15 items in source -- read from a
  version-controlled JSON/YAML/TOML file instead.
- **Cross-repo coordination.** If this project is part of a paired repo
  system (e.g. frontend + backend with a shared auth flow), document the
  sister repo in `AGENTS.md` and require both PRDs + both repos to be
  updated and deployed together for shared-flow changes.

- **Reply in Simplified Technical English (STE) — unless it hurts
  clarity.** Write chat replies in STE: short sentences, active voice, one
  instruction per sentence, consistent terminology, no unexplained jargon.
  If strict STE would create confusion or ambiguity, drop it and write
  whatever is briefest and clearest. Applies to chat output only — code,
  commit messages, and docs keep their normal style.

See `AGENTS.md` for the full text of each rule.


## Project wiki

Project knowledge lives in `.devin/wiki/` — read `INDEX.md`, load only
the page you need.
