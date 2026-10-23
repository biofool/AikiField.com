# Conventions — AikiField.com

Coding conventions for this repo. Project-specific rules live in
`AGENTS.md` / `CLAUDE.md`; this file records how source files should be
sized and organized so AI-assisted edits stay safe.

## File size & responsibility

- **One responsibility per file.** A file should have one reason to
  change. When a file accumulates multiple reasons to change (e.g. login
  + registration + OAuth + password reset), split it.
- **Keep the public surface explicit.** Obvious imports, types, and
  boundaries at the top of the file. No hidden context required to
  understand what a file exports or consumes.
- **400 lines is a review trigger, not a law.** At 300–400 lines, ask
  whether the file should be divided. Do not mechanically fragment a
  file at 401 lines — a coherent, single-responsibility file may stay.
- **Optimize the task, not only the file.** The right context for an
  edit beats minimal token count. Context cut too terse forces extra
  tool calls and raises the risk of a wrong edit.
- **Pair small files with strong tests and a concise architecture map.**
  Small files multiply; navigation comes from
  `.ai-context/architecture/` and `testing/test-map.yaml`, not from
  memorizing file contents.
- **Target ~150–400 lines per source file.** 400 is the soft refactor
  threshold. Each file should be independently understandable,
  narrow-purpose, and free of hidden context.
- **Prefer diff-based targeted edits over full-file rewrites** for
  large files. Rewriting a 2,000-line file loses details and inflates
  review burden; edit the section that changes.

See `.ai-context/debt/filesize-audit.md` for the current list of files
over the 400-line trigger and their refactor priorities.
