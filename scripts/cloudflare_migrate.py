#!/usr/bin/env python3
"""Converge aikifield.com's Cloudflare zone and local config to the desired
post-migration state, then verify it.

Idempotent by design: every step reads current state, applies only the delta,
and re-verifies. Safe to re-run at any point. Dry-run unless --apply is given.

Usage:
    python3 scripts/cloudflare_migrate.py                 # dry run, show delta
    python3 scripts/cloudflare_migrate.py --apply         # converge + verify
    python3 scripts/cloudflare_migrate.py --verify-only   # no writes at all
    python3 scripts/cloudflare_migrate.py --only dns,files

Reads CFT from .env.secrets. The token value is never printed or logged.
Writes an audit record to data/audit/cloudflare-migrate-<timestamp>.json.

See GitHub issue #25.
"""

import argparse
import json
import os
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ZONE = "aikifield.com"
ZONE_ID = "71a04598ce4a9580faf7c0ee79f6da6c"
ORIGIN_IP = "108.163.225.126"
API = "https://api.cloudflare.com/client/v4"
TTL = 300  # keep low until the migration is confirmed stable

# ── Desired DNS state ───────────────────────────────────────────────────────
# proxied=False is load-bearing for anything not on a Cloudflare-proxied port.
# Cloudflare proxies only HTTP(S) ports: 80/8080/8880/2052/2082/2086/2095 and
# 443/2053/2083/2087/2096/8443. SMTP (25), FTP (21) and Web Disk (2077/2078)
# are NOT in that list, so those hostnames must resolve straight to the origin.
DESIRED_DNS = [
    # (type, name, content, proxied, priority, why)
    ("A", ZONE, ORIGIN_IP, True, None, "site apex"),
    ("CNAME", f"www.{ZONE}", ZONE, True, None, "301s to apex"),
    ("A", f"mail.{ZONE}", ORIGIN_IP, False, None,
     "SMTP:25 is not proxied - proxying this stops inbound mail"),
    ("A", f"ftp.{ZONE}", ORIGIN_IP, False, None, "FTP:21 is not proxied"),
    ("A", f"webdisk.{ZONE}", ORIGIN_IP, False, None,
     "Web Disk:2077/2078 is not proxied"),
    ("MX", ZONE, f"mail.{ZONE}", False, 0,
     "must target a DNS-only host, never the proxied apex"),
    ("TXT", ZONE,
     f"v=spf1 +ip4:{ORIGIN_IP} include:spf.greengeeks.net ~all", False, None,
     "+a/+mx would resolve to Cloudflare's edge and authorize their whole range"),
    # cPanel hostnames sit on proxied ports, so they stay orange.
    ("A", f"cpanel.{ZONE}", ORIGIN_IP, True, None, "cPanel:2083 is proxied"),
    ("A", f"whm.{ZONE}", ORIGIN_IP, True, None, "WHM:2087 is proxied"),
    ("A", f"webmail.{ZONE}", ORIGIN_IP, True, None, "webmail:2096 is proxied"),
]

# Records that exist and are deliberately left alone (DKIM, DMARC, ACME/DCV
# challenges). Listed so the reconciler reports them as known rather than drift.
LEAVE_ALONE = {
    f"default._domainkey.{ZONE}", f"_dmarc.{ZONE}",
    f"_acme-challenge.{ZONE}", f"_cpanel-dcv-test-record.{ZONE}",
}

DESIRED_SETTINGS = {
    "ssl": "full",             # not "flexible" (redirect loops), Strict comes later
    "always_use_https": "on",
    "http3": "on",
    "0rtt": "on",
    "brotli": "on",
}

CACHE_RULES = [
    {
        "description": "Bypass cache for PHP, coach API and beta (session state)",
        "expression": (
            '(http.request.uri.path wildcard "*.php") or '
            '(starts_with(http.request.uri.path, "/coach-api/")) or '
            '(starts_with(http.request.uri.path, "/beta/"))'
        ),
        "action": "set_cache_settings",
        "action_parameters": {"cache": False},
    },
    {
        "description": "Cache static assets for 1 year",
        "expression": (
            '(http.request.uri.path wildcard "*.css") or '
            '(http.request.uri.path wildcard "*.js") or '
            '(http.request.uri.path wildcard "*.svg") or '
            '(http.request.uri.path wildcard "*.woff2") or '
            '(http.request.uri.path wildcard "*.png") or '
            '(http.request.uri.path wildcard "*.jpg") or '
            '(http.request.uri.path wildcard "*.webp") or '
            '(http.request.uri.path wildcard "*.ico")'
        ),
        "action": "set_cache_settings",
        "action_parameters": {
            "cache": True,
            "edge_ttl": {"mode": "override_origin", "default": 31536000},
            "browser_ttl": {"mode": "respect_origin"},
        },
    },
    {
        "description": "Cache HTML at the edge for 1 hour",
        "expression": (
            '(http.request.uri.path wildcard "*.html") or '
            '(http.request.uri.path eq "/")'
        ),
        "action": "set_cache_settings",
        "action_parameters": {
            "cache": True,
            "edge_ttl": {"mode": "override_origin", "default": 3600},
            "browser_ttl": {"mode": "respect_origin"},
        },
    },
]

PAGES = [
    "/", "/index.html", "/services.html", "/approach.html", "/process.html",
    "/assessment.html", "/contact.html", "/case-studies.html",
    "/fractional-ciso-for-saas.html",
    "/ai-devsecops-vulnerability-remediation.html",
    "/fractional-ciso.html", "/board-security-clarity.html", "/projects.php",
]

audit = {"started": datetime.now(timezone.utc).isoformat(), "steps": []}


def log(status, step, detail=""):
    """Record and print one outcome. Nothing here ever fails silently."""
    mark = {"ok": "  OK  ", "apply": " APPLY", "skip": " SKIP ",
            "warn": " WARN ", "error": " ERROR", "info": "      "}[status]
    print(f"[{mark}] {step}" + (f" - {detail}" if detail else ""), flush=True)
    audit["steps"].append({"status": status, "step": step, "detail": detail})


def load_token():
    """Read CFT from .env.secrets without echoing it anywhere."""
    env = REPO / ".env.secrets"
    if not env.exists():
        sys.exit("ERROR: .env.secrets not found - cannot authenticate")
    for line in env.read_text().splitlines():
        line = line.strip()
        if line.startswith("CFT=") and not line.startswith("#"):
            tok = line[4:].strip().strip('"').strip("'")
            if tok:
                return tok
    sys.exit("ERROR: no CFT= entry in .env.secrets")


def cf(path, method="GET", body=None, token=None):
    """Call the Cloudflare API. Returns (ok, payload). Never raises on 4xx."""
    req = urllib.request.Request(
        f"{API}{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = json.load(r)
    except urllib.error.HTTPError as e:
        try:
            payload = json.load(e)
        except Exception:
            return False, {"errors": [{"code": e.code, "message": e.reason}]}
    except Exception as e:  # network, DNS, TLS
        return False, {"errors": [{"code": 0, "message": str(e)}]}
    return bool(payload.get("success")), payload


def err(payload):
    errors = payload.get("errors") or []
    if any(e.get("code") in (9109, 10000) for e in errors):
        return ("token lacks the required permission (add Zone Settings Edit / "
                "Cache Rules Edit / Cache Purge to the token) - " + str(errors))
    return str(errors)


# ── Step: DNS reconciliation ────────────────────────────────────────────────

def step_dns(token, apply):
    ok, payload = cf(f"/zones/{ZONE_ID}/dns_records?per_page=100", token=token)
    if not ok:
        log("error", "dns: list records", err(payload))
        return False
    current = payload["result"]
    by_key = {(r["type"], r["name"]): r for r in current}
    healthy = True

    for rtype, name, content, proxied, priority, why in DESIRED_DNS:
        want = {"type": rtype, "name": name, "content": content,
                "proxied": proxied, "ttl": 1 if proxied else TTL}
        if priority is not None:
            want["priority"] = priority

        # A desired A record may currently exist as a CNAME (or vice versa).
        existing = by_key.get((rtype, name))
        stale = [r for (t, n), r in by_key.items()
                 if n == name and t in ("A", "CNAME") and t != rtype
                 and rtype in ("A", "CNAME")]

        if existing:
            drift = []
            if existing["content"].rstrip(".") != content.rstrip("."):
                drift.append(f"content {existing['content']} -> {content}")
            if bool(existing.get("proxied")) != proxied:
                drift.append(f"proxied {existing.get('proxied')} -> {proxied}")
            if priority is not None and existing.get("priority") != priority:
                drift.append(f"priority {existing.get('priority')} -> {priority}")
            if not drift:
                log("ok", f"dns: {rtype} {name}", why)
                continue
            if not apply:
                log("apply", f"dns: {rtype} {name} (would fix)",
                    "; ".join(drift) + f" | {why}")
                continue
            ok, resp = cf(f"/zones/{ZONE_ID}/dns_records/{existing['id']}",
                          "PUT", want, token)
            log("apply" if ok else "error", f"dns: {rtype} {name}",
                "; ".join(drift) if ok else err(resp))
            healthy &= ok
        else:
            if not apply:
                log("apply", f"dns: {rtype} {name} (would create)",
                    f"{content} proxied={proxied} | {why}")
                if stale:
                    log("apply", f"dns: {name} (would delete conflicting)",
                        ", ".join(f"{r['type']} {r['content']}" for r in stale))
                continue
            for r in stale:
                dok, dresp = cf(f"/zones/{ZONE_ID}/dns_records/{r['id']}",
                                "DELETE", token=token)
                log("apply" if dok else "error",
                    f"dns: delete conflicting {r['type']} {name}",
                    r["content"] if dok else err(dresp))
                healthy &= dok
            ok, resp = cf(f"/zones/{ZONE_ID}/dns_records", "POST", want, token)
            log("apply" if ok else "error", f"dns: create {rtype} {name}",
                f"{content} proxied={proxied}" if ok else err(resp))
            healthy &= ok

    managed = {(t, n) for t, n, *_ in DESIRED_DNS}
    for (t, n), r in sorted(by_key.items()):
        if (t, n) not in managed and n not in LEAVE_ALONE:
            log("info", f"dns: unmanaged {t} {n}",
                f"{r['content'][:50]} proxied={r.get('proxied')}")
    return healthy


# ── Step: zone settings ─────────────────────────────────────────────────────

def step_settings(token, apply):
    healthy = True
    for key, want in DESIRED_SETTINGS.items():
        ok, payload = cf(f"/zones/{ZONE_ID}/settings/{key}", token=token)
        if not ok:
            log("warn", f"settings: {key} unreadable", err(payload))
            healthy = False
            continue
        have = payload["result"].get("value")
        if str(have) == want:
            log("ok", f"settings: {key}", f"= {have}")
            continue
        if not apply:
            log("apply", f"settings: {key} (would set)", f"{have} -> {want}")
            continue
        ok, resp = cf(f"/zones/{ZONE_ID}/settings/{key}", "PATCH",
                      {"value": want}, token)
        log("apply" if ok else "error", f"settings: {key}",
            f"{have} -> {want}" if ok else err(resp))
        healthy &= ok
    return healthy


# ── Step: cache rules ───────────────────────────────────────────────────────

def step_cache_rules(token, apply):
    phase = "http_request_cache_settings"
    ok, payload = cf(f"/zones/{ZONE_ID}/rulesets/phases/{phase}/entrypoint",
                     token=token)
    existing = payload.get("result", {}).get("rules", []) if ok else []
    if not ok and not any(e.get("code") == 10000 for e in payload.get("errors", [])):
        # A missing entrypoint ruleset is normal on a fresh zone, not an error.
        log("info", "cache: no ruleset yet", "will be created")
    elif not ok:
        log("warn", "cache: cannot read ruleset", err(payload))
        return False

    # Never clobber a working ruleset. Rules configured by hand may differ in
    # wording while being functionally correct, and the entrypoint API replaces
    # the whole list - so only seed rules when there are none, and otherwise
    # report what is there for a human to compare.
    if existing:
        for r in existing:
            log("ok", "cache: existing rule", r.get("description", "(unnamed)"))
        covered = any("coach-api" in json.dumps(r) for r in existing)
        if not covered:
            log("info", "cache: /coach-api/* has no explicit bypass rule",
                "it currently returns DYNAMIC anyway; add a bypass rule by hand "
                "if you want it guaranteed rather than incidental")
        return True

    if not apply:
        log("apply", "cache: rules (would seed)",
            f"no rules present -> {[r['description'] for r in CACHE_RULES]}")
        return True

    ok, resp = cf(f"/zones/{ZONE_ID}/rulesets/phases/{phase}/entrypoint",
                  "PUT", {"rules": CACHE_RULES}, token)
    log("apply" if ok else "error", "cache: rules",
        f"{len(CACHE_RULES)} rules seeded" if ok else err(resp))
    return ok


# ── Step: local file fixes ──────────────────────────────────────────────────

def step_files(apply):
    healthy = True

    # .gitignore: bare `.env` does not match `.env.secrets`, which holds a live
    # Cloudflare token. Never read the secrets file to check this.
    gi = REPO / ".gitignore"
    text = gi.read_text()
    if re.search(r"^\.env\*\s*$", text, re.M):
        log("ok", "files: .gitignore covers .env*")
    elif not re.search(r"^\.env\s*$", text, re.M):
        log("warn", "files: .gitignore has no .env line", "check manually")
        healthy = False
    elif not apply:
        log("apply", "files: .gitignore (would change)", ".env -> .env*")
    else:
        gi.write_text(re.sub(r"^\.env\s*$", ".env*", text, count=1, flags=re.M))
        log("apply", "files: .gitignore", ".env -> .env*")

    # .htaccess: pin Vary to Accept-Encoding. The origin currently emits
    # `Vary: Accept-Encoding,User-Agent`; UA strings are near-unique, so any
    # cache honouring it fragments per visitor.
    ht = REPO / ".htaccess"
    text = ht.read_text()
    if 'set Vary "Accept-Encoding"' in text:
        log("ok", "files: .htaccess pins Vary")
    elif not apply:
        log("apply", "files: .htaccess (would add)",
            'Header always set Vary "Accept-Encoding"')
    else:
        anchor = '  Header always set Referrer-Policy'
        if anchor not in text:
            log("error", "files: .htaccess anchor missing", "add Vary by hand")
            healthy = False
        else:
            ht.write_text(text.replace(
                anchor,
                '  # Pin Vary: the host adds User-Agent, which fragments the\n'
                '  # Cloudflare edge cache per visitor (see issue #25).\n'
                '  Header always set Vary "Accept-Encoding"\n' + anchor, 1))
            log("apply", "files: .htaccess",
                'added Vary "Accept-Encoding" - deploy with ./sync.sh')
    return healthy


# ── Step: verification ──────────────────────────────────────────────────────

def resolve(name, rtype="A"):
    """Resolve via the system resolver. Returns a list of strings."""
    try:
        if rtype == "A":
            return sorted({ai[4][0] for ai in socket.getaddrinfo(
                name, None, socket.AF_INET, socket.SOCK_STREAM)})
    except OSError as e:
        log("warn", f"verify: cannot resolve {name}", str(e))
    return []


def http(path, host=ZONE):
    """GET a page. Header keys are lower-cased - HTTP/1.1 responses use
    `CF-RAY` while HTTP/2 uses `cf-ray`, and a case-sensitive lookup silently
    reports every page as not served through Cloudflare."""
    req = urllib.request.Request(f"https://{host}{path}",
                                 headers={"User-Agent": "aikifield-migrate/1"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read(2048)
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, b""
    except Exception as e:
        return 0, {"_error": str(e)}, b""


def step_verify():
    healthy = True
    cf_ips, origin_seen = [], []

    # DNS-only hosts must land on the origin; proxied hosts must not.
    for host in ("mail", "ftp", "webdisk"):
        ips = resolve(f"{host}.{ZONE}")
        good = ips == [ORIGIN_IP]
        log("ok" if good else "error", f"verify: {host} is DNS-only",
            f"{ips}" + ("" if good else f" - expected [{ORIGIN_IP}]"))
        healthy &= good
    for host in (ZONE, f"www.{ZONE}"):
        ips = resolve(host)
        good = bool(ips) and ORIGIN_IP not in ips
        log("ok" if good else "error", f"verify: {host} is proxied",
            f"{ips}" + ("" if good else " - origin IP exposed"))
        healthy &= good

    # Pages.
    for path in PAGES:
        status, headers, _ = http(path)
        ray = headers.get("cf-ray", "")
        cache = headers.get("cf-cache-status", "-")
        good = status == 200 and bool(ray)
        log("ok" if good else "error", f"verify: GET {path}",
            f"{status} cf-cache-status={cache}"
            + ("" if ray else " - NOT served through Cloudflare"))
        healthy &= good

    # Session-bearing paths must never be cached.
    for path in ("/projects.php", "/beta/assessment.php"):
        status, headers, _ = http(path)
        cache = headers.get("cf-cache-status", "-")
        good = cache.upper() not in ("HIT", "STALE")
        log("ok" if good else "error", f"verify: {path} not cached",
            f"{status} cf-cache-status={cache}")
        healthy &= good

    # Coach API proxy still reachable through the edge.
    status, headers, body = http("/coach-api/v1/auth/providers")
    good = status == 200 and body.strip().startswith((b"{", b"["))
    log("ok" if good else "error", "verify: /coach-api/v1/auth/providers",
        f"{status} {body[:60]!r}")
    healthy &= good

    # Vary must not fragment the cache.
    _, headers, _ = http("/index.html")
    vary = headers.get("vary", "")
    good = "user-agent" not in vary.lower()
    log("ok" if good else "warn", "verify: Vary header",
        vary or "(none)")
    healthy &= good

    # HTML should reach HIT on a repeat request once cache rules exist.
    http("/index.html")
    time.sleep(1)
    _, headers, _ = http("/index.html")
    cache = headers.get("cf-cache-status", "-")
    log("ok" if cache.upper() == "HIT" else "warn",
        "verify: HTML edge cache", f"cf-cache-status={cache}"
        + ("" if cache.upper() == "HIT" else " - cache rules not effective yet"))

    # TTFB, informational.
    start = time.time()
    http("/index.html")
    log("info", "verify: TTFB /index.html", f"{(time.time()-start)*1000:.0f} ms")
    return healthy


# ── Driver ──────────────────────────────────────────────────────────────────

STEPS = ("dns", "settings", "cache", "files", "verify")


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apply", action="store_true",
                   help="make changes (default is a dry run)")
    p.add_argument("--verify-only", action="store_true",
                   help="run only the verification sweep, no writes")
    p.add_argument("--only", default=",".join(STEPS),
                   help=f"comma-separated subset of: {','.join(STEPS)}")
    args = p.parse_args()

    only = [s.strip() for s in args.only.split(",") if s.strip()]
    bad = set(only) - set(STEPS)
    if bad:
        sys.exit(f"ERROR: unknown step(s): {', '.join(sorted(bad))}")
    if args.verify_only:
        only, args.apply = ["verify"], False

    apply = args.apply
    audit["mode"] = "apply" if apply else "dry-run"
    print(f"\naikifield.com Cloudflare convergence - "
          f"{'APPLYING CHANGES' if apply else 'DRY RUN (no changes)'}\n")

    token = load_token()
    ok, payload = cf(f"/zones/{ZONE_ID}", token=token)
    if not ok:
        sys.exit(f"ERROR: cannot read zone {ZONE_ID}: {err(payload)}")
    z = payload["result"]
    log("info", "zone", f"{z['name']} status={z['status']} plan={z['plan']['name']}")

    healthy = True
    if "dns" in only:
        healthy &= step_dns(token, apply)
    if "settings" in only:
        healthy &= step_settings(token, apply)
    if "cache" in only:
        healthy &= step_cache_rules(token, apply)
    if "files" in only:
        healthy &= step_files(apply)
    if "verify" in only:
        if apply:
            print("\n  waiting 10s for DNS/cache changes to take effect\n")
            time.sleep(10)
        healthy &= step_verify()

    audit["finished"] = datetime.now(timezone.utc).isoformat()
    audit["healthy"] = healthy
    out = REPO / "data" / "audit"
    out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = out / f"cloudflare-migrate-{stamp}.json"
    path.write_text(json.dumps(audit, indent=2))

    counts = {}
    for s in audit["steps"]:
        counts[s["status"]] = counts.get(s["status"], 0) + 1
    print(f"\n{'-'*70}")
    print("  " + "  ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    print(f"  audit: {path.relative_to(REPO)}")
    if not apply and any(s["status"] == "apply" for s in audit["steps"]):
        print("  re-run with --apply to make the changes marked APPLY")
    print(f"{'-'*70}\n")
    return 0 if healthy else 1


if __name__ == "__main__":
    sys.exit(main())
