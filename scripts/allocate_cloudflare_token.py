#!/usr/bin/env python3
"""Create or verify a least-privilege Cloudflare API token for this repo.

The token currently in .env.secrets is shared across zones and cannot create
tokens (no Account API Tokens Write). This script:

  1. Fetches live permission group IDs when the bootstrap token allows it.
  2. Builds a zone-scoped account token from scripts/cloudflare_token_policy.json.
  3. Creates or updates that token when permitted.
  4. Otherwise writes dashboard + curl instructions (no secret in git).

Dry-run unless --apply is given. Token values are never printed unless
--print-secret is also passed after a successful create.

Usage:
    python3 scripts/allocate_cloudflare_token.py
    python3 scripts/allocate_cloudflare_token.py --verify
    python3 scripts/allocate_cloudflare_token.py --apply
    CLOUDFLARE_BOOTSTRAP_TOKEN=... python3 scripts/allocate_cloudflare_token.py --apply
    # also accepts CLOUD_FLARE_BOOTSTRAP_TOKEN (common typo) and ~/projects/.env.secrets
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BOOTSTRAP_KEYS = (
    "CLOUDFLARE_BOOTSTRAP_TOKEN",
    "CLOUD_FLARE_BOOTSTRAP_TOKEN",  # common typo of CLOUDFLARE_*
)
API = "https://api.cloudflare.com/client/v4"
REPO = Path(__file__).resolve().parent.parent
POLICY_PATH = Path(__file__).with_name("cloudflare_token_policy.json")
SECRETS_PATH = REPO / ".env.secrets"
AUDIT_DIR = REPO / "data" / "audit"

SCOPE_ZONE = "com.cloudflare.api.account.zone"
SCOPE_ACCOUNT = "com.cloudflare.api.account"
SCOPE_USER = "com.cloudflare.api.user"

PRODUCT_ALIASES = {
    "pages": "cloudflare pages",
    "cloudflare pages": "cloudflare pages",
    "account filter lists": "account lists",
    "account rule lists": "account lists",
    "cache rules": "cache rules",
    "cache settings": "cache rules",
    "email sending": "email sending",
    "workers email sending": "email sending",
}

# IDs copied from Cloudflare's own API examples. Used only when live
# permission_groups cannot be listed. Names still win when live data exists.
FALLBACK_IDS = {
    ("zone", "zone read"): "c8fed203ed3043cba015a93ad1616f1f",
    ("account", "workers kv storage write"): "f7f0eda5697f475c90846e879bab8666",
    ("account", "workers scripts write"): "e086da7e2179491d91ee5f35b3ca210a",
}

WRITE_WORDS = {"write", "edit"}
LEVEL_WORDS = {"read", "write", "edit"}


def load_policy(path=None):
    raw = (path or POLICY_PATH).read_text(encoding="utf-8")
    policy = json.loads(raw)
    for key in ("token_name", "account_id", "zone_name", "zone_id", "permissions"):
        if key not in policy:
            raise ValueError(f"policy missing required key {key}")
    policy.setdefault("env_keys", ["CLOUDFLARE_API_TOKEN"])
    policy.setdefault("forbidden_zones", [])
    policy.setdefault("verify", [])
    return policy


def split_secret_line(line):
    if "=" not in line or line.lstrip().startswith("#"):
        return None, None, line
    key, _, value = line.partition("=")
    return key.strip(), value.strip().strip('"').strip("'"), line


def parse_secrets_file(path):
    """Return {key: value} from a dotenv file. Values are not logged."""
    values = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        key, value, _ = split_secret_line(line)
        if key:
            values[key] = value
    return values


def load_named_token(path, names):
    values = parse_secrets_file(path)
    for name in names:
        tok = (os.environ.get(name) or values.get(name) or "").strip()
        if tok:
            return tok
    return ""


def redact(text, *secrets):
    out = str(text)
    for secret in secrets:
        if secret and secret in out:
            out = out.replace(secret, "<redacted>")
    return out


def log(status, step, detail="", secrets=()):
    mark = {
        "ok": "  OK  ",
        "apply": " APPLY",
        "skip": " SKIP ",
        "warn": " WARN ",
        "error": " ERROR",
        "info": "      ",
        "fail": " FAIL ",
    }[status]
    detail = redact(detail, *secrets)
    print(f"[{mark}] {step}" + (f" - {detail}" if detail else ""), flush=True)


def normalize_spaces(name):
    name = re.sub(r"([a-z])([A-Z])", r"\1 \2", name or "")
    name = re.sub(r"\s+", " ", name).strip().lower()
    return name


def split_level(name):
    norm = normalize_spaces(name)
    parts = norm.split()
    if not parts:
        return "", "none"
    if parts[-1] in LEVEL_WORDS:
        level = "write" if parts[-1] in WRITE_WORDS else "read"
        product = " ".join(parts[:-1])
        return alias_product(product), level
    return alias_product(norm), "none"


def alias_product(product):
    product = product.strip()
    return PRODUCT_ALIASES.get(product, product)


def group_scope(group):
    scopes = group.get("scopes") or []
    if SCOPE_ZONE in scopes:
        return "zone"
    if SCOPE_USER in scopes:
        return "user"
    if SCOPE_ACCOUNT in scopes:
        return "account"
    return "account"


def match_permission(groups, wanted_name, wanted_scope):
    """Pick the live permission group for a policy name.

    Write/Edit are treated as the same access level. Read never upgrades to
    Write. Product aliases cover Pages vs Cloudflare Pages and Cache Rules vs
    Cache Settings.
    """
    want_product, want_level = split_level(wanted_name)
    candidates = []
    for group in groups:
        if group_scope(group) != wanted_scope:
            continue
        product, level = split_level(group.get("name") or "")
        if product != want_product:
            continue
        if want_level == "write" and level not in ("write", "none"):
            continue
        if want_level == "read" and level not in ("read", "none"):
            continue
        if want_level == "none" and level not in ("none",):
            continue
        candidates.append(group)
    if not candidates:
        return None
    if want_level == "write":
        writes = [g for g in candidates if split_level(g["name"])[1] == "write"]
        if writes:
            candidates = writes
    if want_level == "read":
        reads = [g for g in candidates if split_level(g["name"])[1] == "read"]
        if reads:
            candidates = reads
    return candidates[0]


def resolve_permissions(policy, groups):
    """Map policy names to live (or fallback) permission groups."""
    resolved = []
    missing = []
    for spec in policy["permissions"]:
        optional = bool(spec.get("optional"))
        row = {
            "wanted": spec["name"],
            "scope": spec["scope"],
            "why": spec.get("why", ""),
            "optional": optional,
            "id": None,
            "live_name": None,
            "source": None,
        }
        hit = match_permission(groups, spec["name"], spec["scope"]) if groups else None
        if hit:
            row["id"] = hit.get("id")
            row["live_name"] = hit.get("name")
            row["source"] = "live"
        else:
            fallback_key = (spec["scope"], normalize_spaces(spec["name"]))
            baked = spec.get("id") or FALLBACK_IDS.get(fallback_key)
            if baked:
                row["id"] = baked
                row["live_name"] = spec["name"]
                row["source"] = "fallback"
            elif optional:
                row["source"] = "skipped"
            else:
                missing.append(spec["name"])
                row["source"] = "unresolved"
        resolved.append(row)
    return resolved, missing


def build_policies(policy, resolved):
    zone_groups = []
    account_groups = []
    seen_zone = set()
    seen_account = set()
    for row in resolved:
        if not row.get("id"):
            continue
        entry = {"id": row["id"]}
        if row.get("live_name"):
            entry["name"] = row["live_name"]
        if row["scope"] == "zone" and row["id"] not in seen_zone:
            zone_groups.append(entry)
            seen_zone.add(row["id"])
        elif row["scope"] == "account" and row["id"] not in seen_account:
            account_groups.append(entry)
            seen_account.add(row["id"])
    policies = []
    if zone_groups:
        policies.append({
            "effect": "allow",
            "resources": {
                f"{SCOPE_ZONE}.{policy['zone_id']}": "*",
            },
            "permission_groups": zone_groups,
        })
    if account_groups:
        policies.append({
            "effect": "allow",
            "resources": {
                f"{SCOPE_ACCOUNT}.{policy['account_id']}": "*",
            },
            "permission_groups": account_groups,
        })
    return policies


def create_body(policy, resolved):
    return {
        "name": policy["token_name"],
        "policies": build_policies(policy, resolved),
    }


def format_path(path, policy):
    return path.format(
        zone_id=policy["zone_id"],
        account_id=policy["account_id"],
        zone_name=policy["zone_name"],
    )


def dashboard_instructions(policy, resolved, verify_info=None):
    account_rows = [r for r in resolved if r["scope"] == "account"]
    zone_rows = [r for r in resolved if r["scope"] == "zone"]
    lines = [
        f"# Cloudflare token: {policy['token_name']}",
        "",
        "This session's token can use zones/Workers APIs but cannot create",
        "tokens (Account API Tokens Write / User API Tokens Write is missing).",
        "",
        "## 1. Create a bootstrap token (once)",
        "",
        "Do NOT grant Access: Users Write or Access: Organizations,",
        "Identity Providers, and Groups Write. Those are Cloudflare Zero",
        "Trust (Access apps), not API-token management.",
        "",
        "The Custom Token builder has no User category on purpose.",
        "User -> API Tokens -> Edit exists only on this template:",
        "",
        "https://dash.cloudflare.com/profile/api-tokens",
        "Create Token -> Get started next to **Create Additional Tokens**",
        "(not Custom Token). Leave the template as-is. Create.",
        "",
        "Already on Custom Token for Entire "
        "Kronsensei@gmail.com's Account? Stay there and pick:",
        "Account -> Account API Tokens -> Edit",
        "Account -> Account Settings -> Read",
        "Account resources: include this account only.",
        "Do not add Access:* permissions.",
        "",
        f"Account API Tokens page: https://dash.cloudflare.com/{policy['account_id']}/api-tokens",
        "",
        "Then (two commands — source does not run python3):",
        "source ../.env.secrets",
        "python3 scripts/allocate_cloudflare_token.py --apply",
        "",
        "## 2. Or create this repo token in the dashboard",
        "",
        f"Name: {policy['token_name']}",
        f"Account resource: {policy['account_id']} only",
        f"Zone resource: {policy['zone_name']} ({policy['zone_id']}) only",
        "No IP allowlist. No expiry.",
        "",
        "### Account permissions",
    ]
    for row in account_rows:
        flag = " (optional)" if row["optional"] else ""
        live = f" [{row['live_name']}]" if row.get("live_name") and row["live_name"] != row["wanted"] else ""
        lines.append(f"- {row['wanted']}{live}{flag} — {row['why']}")
    lines += ["", "### Zone permissions"]
    for row in zone_rows:
        flag = " (optional)" if row["optional"] else ""
        live = f" [{row['live_name']}]" if row.get("live_name") and row["live_name"] != row["wanted"] else ""
        lines.append(f"- {row['wanted']}{live}{flag} — {row['why']}")
    lines += [
        "",
        "Do not grant Billing, R2, D1, Stream, Images, Tunnel, Access,",
        "or any zone other than " + policy["zone_name"] + ".",
        "",
        "Paste the secret into .env.secrets as CLOUDFLARE_API_TOKEN"
        + (" and CFT" if "CFT" in policy.get("env_keys", []) else "")
        + ", then rerun:",
        "python3 scripts/allocate_cloudflare_token.py --verify",
    ]
    if verify_info:
        lines += ["", "## Current token probe", verify_info]
    return "\n".join(lines) + "\n"


def cf(path, token, method="GET", body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            try:
                payload = json.loads(raw) if raw else {"success": True, "result": {}}
            except json.JSONDecodeError:
                payload = {"success": True, "result": {"non_json": True}}
            return resp.status, payload
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")[:800]
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {
                "success": False,
                "errors": [{"code": exc.code, "message": exc.reason, "raw": raw}],
            }
        payload.setdefault("success", False)
        payload.setdefault("errors", [{"code": exc.code, "message": exc.reason}])
        return exc.code, payload
    except Exception as exc:
        return 0, {"success": False, "errors": [{"code": 0, "message": str(exc)}]}


def error_text(payload, secrets=()):
    errors = payload.get("errors") or []
    return redact(errors, *secrets)


def is_denied(status, payload):
    if status in (401, 403):
        return True
    errors = payload.get("errors") or []
    return any(e.get("code") in (9109, 10000, 1000) for e in errors)


def is_ok(status, payload):
    return status == 200 and bool(payload.get("success"))


def list_all(path, token, secrets=()):
    """Paginate a Cloudflare list endpoint."""
    items = []
    page = 1
    while page <= 50:
        joiner = "&" if "?" in path else "?"
        status, payload = cf(f"{path}{joiner}page={page}&per_page=100", token)
        if not is_ok(status, payload):
            return status, payload, items
        batch = payload.get("result") or []
        items.extend(batch)
        info = payload.get("result_info") or {}
        total_pages = info.get("total_pages") or 1
        if page >= total_pages or not batch:
            return status, payload, items
        page += 1
    return 200, {"success": True, "result": items}, items


def fetch_permission_groups(account_id, token, secrets=()):
    attempts = [
        f"/accounts/{account_id}/tokens/permission_groups",
        "/user/tokens/permission_groups",
    ]
    last_status, last_payload = 0, {}
    for path in attempts:
        status, payload, items = list_all(path, token, secrets)
        last_status, last_payload = status, payload
        if is_ok(status, payload) and items:
            return items, path, None
    return [], None, (last_status, last_payload)


def detect_token_kind(account_id, token):
    status, payload = cf(f"/accounts/{account_id}/tokens/verify", token)
    if is_ok(status, payload):
        result = payload.get("result") or {}
        return "account", result
    status, payload = cf("/user/tokens/verify", token)
    if is_ok(status, payload):
        result = payload.get("result") or {}
        return "user", result
    return "unknown", {}


def upsert_env_secrets(path, updates):
    """Write key=value pairs into a dotenv file without clobbering others."""
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    seen = set()
    out = []
    for line in lines:
        key, _, original = split_secret_line(line)
        if key in updates:
            out.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            out.append(original)
    for key, value in updates.items():
        if key not in seen:
            out.append(f"{key}={value}")
    text = "\n".join(out)
    if not text.endswith("\n"):
        text += "\n"
    path.write_text(text, encoding="utf-8")
    return sorted(updates)


def evaluate_check(check, status, payload):
    expect = check.get("expect", "ok")
    if expect == "ok":
        return is_ok(status, payload)
    if expect == "denied":
        return is_denied(status, payload) or not is_ok(status, payload)
    raise ValueError(f"unknown expect {expect}")


def run_verify(policy, token, secrets=()):
    results = []
    all_pass = True
    for check in policy.get("verify") or []:
        path = format_path(check["path"], policy)
        status, payload = cf(path, token, method=check.get("method", "GET"))
        passed = evaluate_check(check, status, payload)
        results.append({
            "name": check["name"],
            "expect": check.get("expect", "ok"),
            "path": path,
            "status": status,
            "passed": passed,
            "errors": payload.get("errors") or [],
        })
        all_pass = all_pass and passed
        state = "ok" if passed else "fail"
        log(state, f"verify:{check['name']}",
            f"HTTP {status} expect={check.get('expect', 'ok')}", secrets)
    return all_pass, results


def write_audit(name, payload, secrets=()):
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = AUDIT_DIR / f"{name}-{stamp}.json"
    text = json.dumps(payload, indent=2)
    path.write_text(redact(text, *secrets), encoding="utf-8")
    return path


def write_text(name, text, secrets=()):
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = AUDIT_DIR / f"{name}-{stamp}.md"
    path.write_text(redact(text, *secrets), encoding="utf-8")
    return path


def find_existing_token(account_id, kind, token, name, secrets=()):
    paths = []
    if kind == "user":
        paths.append("/user/tokens")
    paths.append(f"/accounts/{account_id}/tokens")
    if kind != "user":
        paths.append("/user/tokens")
    for path in paths:
        status, payload, items = list_all(path, token, secrets)
        if not is_ok(status, payload):
            continue
        for item in items:
            if item.get("name") == name:
                return item, path
        return None, path
    return None, None


def allocate(policy, bootstrap, apply, print_secret, secrets):
    account_id = policy["account_id"]
    kind, meta = detect_token_kind(account_id, bootstrap)
    expires = meta.get("expires_on")
    log("info", "bootstrap kind", f"{kind} id={meta.get('id', '?')} expires={expires or 'none'}", secrets)
    if expires:
        log("warn", "bootstrap expiry", expires, secrets)

    groups, groups_path, groups_err = fetch_permission_groups(account_id, bootstrap, secrets)
    if groups:
        log("ok", "permission groups", f"{len(groups)} from {groups_path}", secrets)
    else:
        status, payload = groups_err or (0, {})
        log("warn", "permission groups unavailable",
            f"HTTP {status} {error_text(payload, secrets)}; using names + fallback IDs",
            secrets)

    resolved, missing = resolve_permissions(policy, groups)
    for row in resolved:
        log("info" if row["id"] or row["optional"] else "warn",
            f"perm {row['scope']}:{row['wanted']}",
            f"id={row['id'] or 'none'} source={row['source']} live={row.get('live_name') or ''}",
            secrets)

    body = create_body(policy, resolved)
    audit = {
        "token_name": policy["token_name"],
        "zone": policy["zone_name"],
        "zone_id": policy["zone_id"],
        "account_id": account_id,
        "resolved": resolved,
        "missing": missing,
        "create_body": body,
        "bootstrap_kind": kind,
        "bootstrap_expires_on": expires,
    }
    audit_path = write_audit("cloudflare-token-plan", audit, secrets)
    log("ok", "wrote plan", str(audit_path), secrets)

    instructions = dashboard_instructions(policy, resolved)
    dash_path = write_text("cloudflare-token-dashboard", instructions, secrets)
    log("ok", "wrote dashboard instructions", str(dash_path), secrets)

    if missing and not groups:
        log("warn", "unresolved permissions",
            "live permission_groups were denied, so some IDs are unknown: "
            + ", ".join(missing),
            secrets)

    if not apply:
        log("skip", "create/update", "dry-run; pass --apply to allocate")
        print(instructions)
        return 0, None

    if not body["policies"]:
        log("error", "create/update", "no permission IDs resolved; cannot POST a token")
        print(instructions)
        return 2, None

    existing, list_path = find_existing_token(
        account_id, kind, bootstrap, policy["token_name"], secrets)
    if existing:
        token_id = existing["id"]
        base = list_path or f"/accounts/{account_id}/tokens"
        status, payload = cf(f"{base}/{token_id}", bootstrap, method="PUT", body=body)
        if is_ok(status, payload):
            log("apply", "updated token policies", f"id={token_id} (secret not rotated)", secrets)
            return 0, None
        log("error", "update token", f"HTTP {status} {error_text(payload, secrets)}", secrets)
        print(instructions)
        return 2, None

    create_paths = []
    if kind == "user":
        create_paths.append("/user/tokens")
    create_paths.append(f"/accounts/{account_id}/tokens")
    if kind != "user":
        create_paths.append("/user/tokens")

    last = None
    for path in create_paths:
        status, payload = cf(path, bootstrap, method="POST", body=body)
        last = (path, status, payload)
        if is_ok(status, payload):
            result = payload.get("result") or {}
            secret = result.get("value")
            token_id = result.get("id")
            log("apply", "created token", f"id={token_id} via {path}", secrets)
            if secret:
                updates = {key: secret for key in policy["env_keys"]}
                written = upsert_env_secrets(SECRETS_PATH, updates)
                log("ok", "wrote .env.secrets keys", ", ".join(written), secrets)
                if print_secret:
                    print("\nNew token secret (shown once):\n")
                    print(f"```\n{secret}\n```\n")
                else:
                    log("info", "secret", "stored in .env.secrets; not printed (pass --print-secret to show once)")
            return 0, secret
        log("warn", f"create via {path}", f"HTTP {status} {error_text(payload, secrets)}", secrets)

    path, status, payload = last
    log("error", "create token denied",
        "bootstrap lacks API Tokens Write. Use the dashboard steps above.",
        secrets)
    print(instructions)
    return 2, None


def load_bootstrap_token(repo, op_token=""):
    """Bootstrap token from env, parent .env.secrets, or the operational token."""
    for name in BOOTSTRAP_KEYS:
        tok = (os.environ.get(name) or "").strip()
        if tok:
            return tok
    parent_secrets = repo.parent / ".env.secrets"
    tok = load_named_token(parent_secrets, BOOTSTRAP_KEYS)
    if tok:
        return tok
    return op_token


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="Create or update the named token")
    parser.add_argument("--verify", action="store_true",
                        help="Probe CLOUDFLARE_API_TOKEN against this repo's checks")
    parser.add_argument("--print-secret", action="store_true",
                        help="Print a newly created secret once (still writes .env.secrets)")
    parser.add_argument("--policy", default=str(POLICY_PATH),
                        help="Path to cloudflare_token_policy.json")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv if argv is not None else sys.argv[1:])
    policy = load_policy(Path(args.policy))
    op_token = load_named_token(SECRETS_PATH, policy["env_keys"] + ["CFT", "CLOUDFLARE_API_TOKEN"])
    bootstrap = load_bootstrap_token(REPO, op_token)
    secrets = tuple(s for s in (op_token, bootstrap) if s)

    if not bootstrap:
        log("error", "auth", "no CLOUDFLARE_BOOTSTRAP_TOKEN / CLOUDFLARE_API_TOKEN / CFT")
        return 2

    code = 0
    should_verify = args.verify or not args.apply
    if should_verify:
        if not op_token:
            log("error", "verify", "no operational token in .env.secrets")
            code = 2
        else:
            log("info", "verify", f"token for {policy['token_name']} / {policy['zone_name']}")
            passed, results = run_verify(policy, op_token, secrets)
            write_audit("cloudflare-token-verify", {
                "token_name": policy["token_name"],
                "passed": passed,
                "results": [
                    {k: v for k, v in row.items() if k != "errors"} | {
                        "errors": json.loads(redact(json.dumps(row["errors"]), *secrets))
                    }
                    for row in results
                ],
            }, secrets)
            if not passed:
                log("warn", "verify",
                    "current token is too broad or missing a permission; "
                    "denied checks fail if this token can still see other zones")
                code = 1 if not args.apply else 0

    if args.verify and not args.apply:
        return code

    alloc_code, _secret = allocate(
        policy, bootstrap, apply=args.apply,
        print_secret=args.print_secret, secrets=secrets)
    if args.apply:
        code = alloc_code
        if alloc_code == 0:
            new_token = load_named_token(SECRETS_PATH, policy["env_keys"])
            if new_token:
                passed, _ = run_verify(policy, new_token, secrets + (new_token,))
                if not passed:
                    code = 1
    elif alloc_code != 0:
        code = alloc_code
    return code


if __name__ == "__main__":
    sys.exit(main())
