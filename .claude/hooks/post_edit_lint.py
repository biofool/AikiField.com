#!/usr/bin/env python3
"""PostToolUse hook: run fast deterministic checks on edited files.

Reads the hook payload on stdin ({tool_name, tool_input:{file_path}}),
dispatches per-extension linters/formatters, prints findings to stderr and
exits 2 so the agent sees and can fix its own mistakes. Exit 0 = silent.

Canonical copy lives in biofool/magic-compact-devin (src/post_edit_lint.py);
identical copies may be vendored at .claude/hooks/post_edit_lint.py.
Stdlib only. Every check no-ops when its tool is absent.
"""

import importlib.util
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

# These .json files allow comments/trailing commas — json.tool would
# false-fail on every valid edit.
JSONC_FILES = {
    "tsconfig.json", "jsconfig.json", "devcontainer.json",
    "settings.json", "launch.json", "tasks.json", "extensions.json",
    ".code-workspace",
}


def _repo_root(file: Path) -> Path | None:
    for cand in (file.parent, *file.parents):
        if (cand / ".git").exists():
            return cand
    return None


def _py_check(file: Path) -> list[str]:
    try:
        compile(file.read_bytes(), str(file), "exec")
    except SyntaxError as e:
        return [f"{file.name}: {e.msg} (line {e.lineno})"]
    except (OSError, UnicodeDecodeError):
        pass
    return []


def _ruff(file: Path) -> list[str]:
    # Prefer a repo venv ruff over whatever is on PATH, but never walk above
    # the file's git root — a planted .venv in an ancestor dir would otherwise
    # execute attacker code on every edit. shortcut: a venv planted inside a
    # hostile repo itself still runs; treat working in untrusted clones as
    # trusted-context only.
    root = _repo_root(file)
    if root is not None:
        for cand in (file.parent, *file.parents):
            for rel in (".venv/bin/ruff", "backend/.venv/bin/ruff", "venv/bin/ruff"):
                p = cand / rel
                if p.is_file():
                    return _run([str(p), "check", "--output-format=concise", str(file)])
            if cand == root:
                break
    if shutil.which("ruff"):
        return _run(["ruff", "check", "--output-format=concise", str(file)])
    return _py_check(file)


def _run(cmd: list[str], cwd: Path | None = None) -> list[str]:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True,
                           timeout=TIMEOUT, cwd=cwd)
    except FileNotFoundError:
        return []  # tool absent — the documented no-op case
    except subprocess.TimeoutExpired:
        return [f"{cmd[0]}: timed out after {TIMEOUT}s — could not check file"]
    except OSError as e:
        return [f"{cmd[0]}: failed to run ({e}) — could not check file"]
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
    if ext == ".json" and name not in JSONC_FILES:
        return _run([sys.executable, "-m", "json.tool", str(file)])
    if ext == ".go" and shutil.which("gofmt"):
        try:
            # -e: report parse errors (stderr) too — gofmt -l alone lists
            # nothing for syntactically invalid files.
            r = subprocess.run(["gofmt", "-e", "-l", str(file)],
                               capture_output=True, text=True, timeout=TIMEOUT)
            if r.stdout.strip():
                return [f"{file.name}: not gofmt-clean (run gofmt -w)"]
            if r.returncode != 0 or r.stderr.strip():
                return [f"{file.name}: {r.stderr.strip()[:MAX_OUT]}"]
        except FileNotFoundError:
            pass
        except subprocess.TimeoutExpired:
            return ["gofmt: timed out — could not check file"]
        except OSError as e:
            return [f"gofmt: failed to run ({e}) — could not check file"]
        return []
    if ext in (".yml", ".yaml"):
        if importlib.util.find_spec("yaml") is None:
            return []
        return _run([sys.executable, "-c",
                     "import sys,yaml; yaml.safe_load(open(sys.argv[1]))", str(file)])
    return []


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)
    if not isinstance(data, dict):
        sys.exit(0)
    if data.get("tool_name") not in EDIT_TOOLS:
        sys.exit(0)
    ti = data.get("tool_input")
    if not isinstance(ti, dict):
        sys.exit(0)
    path = ti.get("file_path") or ti.get("notebook_path") or ""
    if not path or not os.path.isfile(path):
        sys.exit(0)
    # resolve() so the argv path always starts with '/' — a relative-looking
    # name like -e.py can never be parsed as a flag by the linter.
    findings = checks_for(Path(path).resolve())
    if findings:
        sys.stderr.write(f"post-edit lint findings in {path}:\n")
        for f in findings:
            sys.stderr.write(f"  {f}\n")
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
