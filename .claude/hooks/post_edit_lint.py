#!/usr/bin/env python3
"""PostToolUse hook: run fast deterministic checks on edited files.

Reads the hook payload on stdin ({tool_name, tool_input:{file_path}}),
dispatches per-extension linters/formatters, prints findings to stderr and
exits 2 so the agent sees and can fix its own mistakes. Exit 0 = silent.

Canonical copy lives in biofool/magic-compact-devin (src/post_edit_lint.py);
identical copies may be vendored at .claude/hooks/post_edit_lint.py.
Stdlib only. Every check no-ops when its tool is absent.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

EDIT_TOOLS = {
    "edit", "write", "notebook_edit", "str_replace",
    "Edit", "Write", "MultiEdit", "NotebookEdit",
}
TIMEOUT = 20
MAX_OUT = 1200


def _ruff(file: Path) -> list[str]:
    # Prefer a repo venv ruff over whatever is on PATH.
    for cand in (file.parent, *file.parents):
        for rel in (".venv/bin/ruff", "backend/.venv/bin/ruff", "venv/bin/ruff"):
            p = cand / rel
            if p.is_file():
                return _run([str(p), "check", "--output-format=concise", str(file)])
    if shutil.which("ruff"):
        return _run(["ruff", "check", "--output-format=concise", str(file)])
    return _run([sys.executable, "-m", "py_compile", str(file)])


def _run(cmd: list[str], cwd: Path | None = None) -> list[str]:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True,
                           timeout=TIMEOUT, cwd=cwd)
    except (OSError, subprocess.TimeoutExpired):
        return []
    if r.returncode == 0:
        return []
    out = (r.stdout + r.stderr).strip()
    return [out[:MAX_OUT]] if out else []


def checks_for(file: Path) -> list[str]:
    ext = file.suffix.lower()
    name = file.name
    if ext == ".py":
        return _ruff(file)
    if ext == ".php" and shutil.which("php"):
        return _run(["php", "-l", str(file)])
    if ext in (".js", ".mjs", ".cjs") and shutil.which("node"):
        return _run(["node", "--check", str(file)])
    if ext in (".sh", ".bash") or name.endswith(".sh"):
        out = _run(["bash", "-n", str(file)])
        if not out and shutil.which("shellcheck"):
            out = _run(["shellcheck", "-S", "error", str(file)])
        return out
    if ext == ".json" and not name.endswith((".jsonc",)):
        return _run([sys.executable, "-m", "json.tool", str(file)])
    if ext == ".go" and shutil.which("gofmt"):
        try:
            r = subprocess.run(["gofmt", "-l", str(file)],
                               capture_output=True, text=True, timeout=TIMEOUT)
            if r.stdout.strip():
                return [f"{file.name}: not gofmt-clean (run gofmt -w)"]
        except (OSError, subprocess.TimeoutExpired):
            pass
        return []
    if ext in (".yml", ".yaml"):
        return _run([sys.executable, "-c",
                     "import sys,yaml; yaml.safe_load(open(sys.argv[1]))", str(file)])
    return []


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)
    if data.get("tool_name") not in EDIT_TOOLS:
        sys.exit(0)
    ti = data.get("tool_input") or {}
    path = ti.get("file_path") or ti.get("notebook_path") or ""
    if not path or not os.path.isfile(path):
        sys.exit(0)
    findings = checks_for(Path(path))
    if findings:
        sys.stderr.write(f"post-edit lint findings in {path}:\n")
        for f in findings:
            sys.stderr.write(f"  {f}\n")
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
