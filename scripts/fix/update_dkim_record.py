#!/usr/bin/env python3
"""Sync the aikifield.com DKIM TXT record in Cloudflare with cPanel's key.

Re-adding the aikifield.com addon in cPanel (issue #81) generated a new DKIM
key, so `default._domainkey.aikifield.com` in Cloudflare DNS no longer
matches the key Exim signs with. This script asks cPanel for the expected
record (`uapi EmailAuth validate_current_dkims`, public key only) and
updates that one TXT record. It touches no other record:
scripts/cloudflare_migrate.py deliberately leaves DKIM alone.

    python3 scripts/fix/update_dkim_record.py            # dry run (default)
    python3 scripts/fix/update_dkim_record.py --apply    # write the record

The Cloudflare token is read from .env.secrets by cloudflare_migrate's
loader and is never printed. An audit JSON is written to data/audit/.
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts"))
import cloudflare_migrate as cfm  # noqa: E402  (reuses load_token / cf / ZONE_ID)

NAME = f"default._domainkey.{cfm.ZONE}"
SSH = ["ssh", "-i", str(Path.home() / ".ssh/quantumaikido_ed25519"),
       "-o", "LogLevel=ERROR", "peecbiz@peec.biz"]


def expected_record():
    out = subprocess.run(
        SSH + [f"uapi --output=json EmailAuth validate_current_dkims domain={cfm.ZONE}"],
        capture_output=True, text=True, timeout=60)
    if out.returncode != 0:
        sys.exit(f"ERROR: uapi call failed (exit {out.returncode}): {out.stderr.strip()}")
    data = json.loads(out.stdout)["result"]["data"]
    rec = next((d for d in data if d.get("domain") == NAME), None)
    if not rec or not rec.get("expected"):
        sys.exit(f"ERROR: cPanel returned no expected DKIM record for {NAME}")
    return rec["state"], rec["expected"]


def norm(txt):
    # Cloudflare may return TXT content quoted and split into 255-char chunks.
    return txt.replace('" "', "").strip('"')


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--apply", action="store_true", help="write the record")
    p.add_argument("--dry-run", action="store_true", help="explicit dry run (default)")
    args = p.parse_args()
    apply = args.apply and not args.dry_run

    audit = {"script": "update_dkim_record", "name": NAME, "apply": apply,
             "at": datetime.now(timezone.utc).isoformat()}
    state, want = expected_record()
    audit["cpanel_state"] = state
    print(f"cPanel says {NAME}: {state}")

    token = cfm.load_token()
    ok, payload = cfm.cf(f"/zones/{cfm.ZONE_ID}/dns_records?type=TXT&name={NAME}", token=token)
    if not ok:
        sys.exit(f"ERROR: list TXT records failed: {cfm.err(payload)}")
    found = payload["result"]
    if len(found) > 1:
        sys.exit(f"ERROR: {len(found)} TXT records named {NAME}; resolve by hand")

    if found and norm(found[0]["content"]) == want:
        print("Cloudflare already has the expected key - nothing to do")
        audit["result"] = "no-change"
    elif not apply:
        print(f"DRY RUN: would {'update' if found else 'create'} {NAME} "
              f"(new key starts {want[:40]}...). Re-run with --apply.")
        audit["result"] = "dry-run"
    else:
        body = {"type": "TXT", "name": NAME, "content": want, "ttl": 1}
        if found:
            ok, resp = cfm.cf(f"/zones/{cfm.ZONE_ID}/dns_records/{found[0]['id']}",
                              "PUT", body, token)
        else:
            ok, resp = cfm.cf(f"/zones/{cfm.ZONE_ID}/dns_records", "POST", body, token)
        if not ok:
            audit["result"] = "error"
            audit["error"] = cfm.err(resp)
        else:
            audit["result"] = "updated" if found else "created"
        print(f"{audit['result']}: {NAME}" + (f" - {audit.get('error')}" if not ok else ""))

    audit_dir = REPO / "data" / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    path = audit_dir / f"update-dkim-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json"
    path.write_text(json.dumps(audit, indent=2))
    print(f"audit: {path.relative_to(REPO)}")
    return 1 if audit["result"] == "error" else 0


if __name__ == "__main__":
    sys.exit(main())
