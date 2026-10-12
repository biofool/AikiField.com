#!/usr/bin/env python3
"""jev_review.py — shadow-mode Jev code review for the diff about to be pushed.

Runs the TypeSafe Jev typed-question battery on the outgoing diff and prints
a compact verdict. Non-blocking by design: always exits 0 unless --strict is
given. Never prints or stores secrets.

Usage:
    python3 scripts/jev_review.py            # review @{u}..HEAD (unpushed commits)
    python3 scripts/jev_review.py --staged   # review staged changes
    python3 scripts/jev_review.py HEAD~3     # review an explicit ref range
    python3 scripts/jev_review.py --strict   # exit 1 when the diff is flagged

Required env:
    JEV_API_KEY    TypeSafe API key
Optional env:
    JEV_BASE_URL   default https://api.typesafe.ai/v1/systemone
    JEV_MODEL      default jev-latest

Install as a pre-push hook (optional):
    ln -s ../../scripts/jev_review.py .git/hooks/pre-push
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

MAX_DIFF = 12000  # chars; keep state small per Jev guidance

QUESTIONS = {
    "introduces_defect": {
        "type": "noul",
        "instructions": "If this diff were applied to the codebase, would it introduce a functional bug or regression (broken behavior, wrong result, crash, or data corruption)?",
        "criteria": {
            "true": "The added/changed code contains a defect that would produce incorrect behavior",
            "false": "The change is correct, a fix, docs/test/config only, or purely cosmetic",
        },
    },
    "security_issue": {
        "type": "noul",
        "instructions": "Would applying this diff weaken security — e.g. remove authentication/authorization/CSRF checks, disable input validation or sanitization, expose secrets or credentials in code/logs, or create an injection path?",
        "criteria": {
            "true": "The diff removes a security control or adds an exploitable weakness",
            "false": "No security-relevant weakening; security improvements count as no",
        },
    },
    "risk_score": {
        "type": "score",
        "instructions": "Rate the risk of merging this diff as a code reviewer would.",
        "criteria": [
            "Safe: docs/tests/cosmetic or a correct improvement",
            "Low: plausible minor issue, needs a look",
            "Medium: likely introduces a bug in an edge case",
            "High: likely introduces a bug or security weakness on a main path",
        ],
    },
    "review_route": {
        "type": "choice",
        "instructions": "How should this diff be routed for review?",
        "criteria": {
            "approve": "Safe to merge; docs/tests/fixes/cosmetic changes",
            "human_review": "Nontrivial logic change that looks plausibly correct",
            "security_review": "Touches auth, secrets, validation, sanitization, or unsafe operations",
            "reject": "Clearly introduces a defect or removes a protection",
        },
    },
}

# Thresholds from the jev-diff-eval benchmark (45 labeled diffs):
# introduces_defect at 0.5 -> P=0.92 R=0.73. Flag if any signal trips.
DEFECT_T = 0.5
SECURITY_T = 0.5
RISK_T = 1.5  # score midpoint (0..3 scale)


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True).stdout


def outgoing_diff(ref):
    if ref:
        return git("diff", f"{ref}...HEAD"), ref
    upstream = git("rev-parse", "--abbrev-ref", "@{u}").strip()
    if not upstream:
        # no upstream: review the last commit's changes
        return git("diff", "HEAD~1...HEAD"), "HEAD~1"
    return git("diff", f"{upstream}...HEAD"), upstream


def staged_diff():
    return git("diff", "--staged"), "staged"


def jev(state):
    url = os.environ.get("JEV_BASE_URL", "https://api.typesafe.ai/v1/systemone")
    key = os.environ.get("JEV_API_KEY", "")
    if not key:
        return {"error": "JEV_API_KEY not set"}
    payload = {"state": state, "model": os.environ.get("JEV_MODEL", "jev-latest"),
               "questions": QUESTIONS}
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}"}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}


def probability(answer):
    """Extract a 0..1 probability from a noul/score answer, tolerant of shape."""
    if isinstance(answer, (int, float)):
        return float(answer)
    if isinstance(answer, dict):
        for k in ("noul", "score", "probability", "value", "answer", "p"):
            if k in answer and isinstance(answer[k], (int, float)):
                return float(answer[k])
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    strict = "--strict" in sys.argv
    staged = "--staged" in sys.argv

    if staged:
        diff, base = staged_diff()
    else:
        diff, base = outgoing_diff(args[0] if args else None)

    if not diff.strip():
        print("jev-review: no changes to review")
        return 0

    repo = os.path.basename(os.getcwd())
    msg = git("log", "-1", "--format=%s").strip()
    state = {"repo": repo, "context": msg, "proposed_diff": diff[:MAX_DIFF]}
    if len(diff) > MAX_DIFF:
        state["note"] = f"diff truncated to {MAX_DIFF} of {len(diff)} chars"

    out = jev(state)
    if "error" in out:
        # shadow mode: report but never block
        print(f"jev-review: unavailable ({out['error']}) — skipping review")
        return 0

    answers = out.get("answers", out)
    p_defect = probability(answers.get("introduces_defect"))
    p_sec = probability(answers.get("security_issue"))
    risk = probability(answers.get("risk_score"))
    route = answers.get("review_route")
    if isinstance(route, dict):
        route = route.get("choice") or route.get("answer") or route.get("value")

    flagged = ((p_defect is not None and p_defect >= DEFECT_T)
               or (p_sec is not None and p_sec >= SECURITY_T)
               or (risk is not None and risk >= RISK_T))

    def fmt(p):
        return "n/a" if p is None else f"{p:.2f}"

    print(f"jev-review [{repo} vs {base}]: "
          f"defect={fmt(p_defect)} security={fmt(p_sec)} "
          f"risk={fmt(risk)} route={route}")
    if flagged:
        print("jev-review: FLAGGED — review this diff before relying on it "
              "(shadow mode: not blocking)")
        return 1 if strict else 0
    print("jev-review: no issues flagged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
