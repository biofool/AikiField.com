#!/usr/bin/env python3
"""Unit tests for scripts/allocate_cloudflare_token.py.

No live Cloudflare calls. Token values used here are fixtures, never real
secrets. Run:

    python3 tests/unit/test_allocate_cloudflare_token.py
    python3 tests/test_allocate_cloudflare_token.py
"""

from __future__ import annotations

import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


def load_script():
    here = Path(__file__).resolve()
    script = None
    for parent in [here.parent, *here.parents]:
        candidate = parent / "scripts" / "allocate_cloudflare_token.py"
        if candidate.exists():
            script = candidate
            break
    if script is None:
        raise FileNotFoundError("allocate_cloudflare_token.py not found")
    spec = importlib.util.spec_from_file_location("allocate_cloudflare_token", script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod, script.parent.parent


MOD, REPO = load_script()


SAMPLE_GROUPS = [
    {"id": "zone-read", "name": "Zone Read", "scopes": [MOD.SCOPE_ZONE]},
    {"id": "zone-settings-write", "name": "Zone Settings Write", "scopes": [MOD.SCOPE_ZONE]},
    {"id": "dns-write", "name": "DNS Write", "scopes": [MOD.SCOPE_ZONE]},
    {"id": "dns-edit", "name": "DNS Edit", "scopes": [MOD.SCOPE_ZONE]},
    {"id": "cache-purge", "name": "Cache Purge", "scopes": [MOD.SCOPE_ZONE]},
    {"id": "cache-rules-edit", "name": "Cache RulesEdit", "scopes": [MOD.SCOPE_ZONE]},
    {"id": "pages-write", "name": "Cloudflare Pages Write", "scopes": [MOD.SCOPE_ACCOUNT]},
    {"id": "pages-read", "name": "Cloudflare Pages Read", "scopes": [MOD.SCOPE_ACCOUNT]},
    {"id": "workers-write", "name": "Workers Scripts Write", "scopes": [MOD.SCOPE_ACCOUNT]},
    {"id": "lists-write", "name": "Account Rule Lists Write", "scopes": [MOD.SCOPE_ACCOUNT]},
    {"id": "email-sending-write", "name": "Email Sending Write", "scopes": [MOD.SCOPE_ACCOUNT]},
]


class PermissionMatchTests(unittest.TestCase):
    def test_write_prefers_write_over_edit_when_both_exist(self):
        hit = MOD.match_permission(SAMPLE_GROUPS, "DNS Write", "zone")
        self.assertEqual(hit["id"], "dns-write")

    def test_edit_satisfies_write(self):
        groups = [g for g in SAMPLE_GROUPS if g["id"] != "dns-write"]
        hit = MOD.match_permission(groups, "DNS Write", "zone")
        self.assertEqual(hit["id"], "dns-edit")

    def test_stuck_together_edit_suffix(self):
        hit = MOD.match_permission(SAMPLE_GROUPS, "Cache Rules Write", "zone")
        self.assertEqual(hit["id"], "cache-rules-edit")

    def test_pages_alias(self):
        hit = MOD.match_permission(SAMPLE_GROUPS, "Pages Write", "account")
        self.assertEqual(hit["id"], "pages-write")

    def test_read_does_not_upgrade_to_write(self):
        hit = MOD.match_permission(SAMPLE_GROUPS, "Pages Read", "account")
        self.assertEqual(hit["id"], "pages-read")

    def test_filter_lists_alias(self):
        hit = MOD.match_permission(SAMPLE_GROUPS, "Account Filter Lists Write", "account")
        self.assertEqual(hit["id"], "lists-write")

    def test_scope_mismatch_ignored(self):
        hit = MOD.match_permission(SAMPLE_GROUPS, "Zone Read", "account")
        self.assertIsNone(hit)

    def test_cache_purge_has_no_level(self):
        hit = MOD.match_permission(SAMPLE_GROUPS, "Cache Purge", "zone")
        self.assertEqual(hit["id"], "cache-purge")


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.policy = MOD.load_policy()

    def test_policy_matches_this_repo_zone(self):
        self.assertIn(self.policy["zone_name"], ("aikifield.com", "quantumaikido.com"))
        self.assertTrue(self.policy["token_name"].startswith(self.policy["zone_name"]))

    def test_aikifield_omits_pages_and_workers(self):
        if self.policy["zone_name"] != "aikifield.com":
            self.skipTest("quantum policy")
        names = [p["name"] for p in self.policy["permissions"]]
        self.assertNotIn("Pages Write", names)
        self.assertNotIn("Workers Scripts Write", names)
        self.assertIn("DNS Write", names)
        self.assertIn("Cache Rules Write", names)

    def test_quantum_includes_pages_and_workers(self):
        if self.policy["zone_name"] != "quantumaikido.com":
            self.skipTest("aikifield policy")
        names = [p["name"] for p in self.policy["permissions"]]
        self.assertIn("Pages Write", names)
        self.assertIn("Workers Scripts Write", names)
        self.assertIn("Workers KV Storage Write", names)

    def test_build_policies_only_this_zone(self):
        resolved, missing = MOD.resolve_permissions(self.policy, SAMPLE_GROUPS)
        policies = MOD.build_policies(self.policy, resolved)
        zone_resources = policies[0]["resources"]
        self.assertEqual(len(zone_resources), 1)
        self.assertIn(self.policy["zone_id"], next(iter(zone_resources)))
        for other in self.policy["forbidden_zones"]:
            self.assertNotIn(other["id"], json.dumps(policies))
        self.assertTrue(any(r.get("id") for r in resolved if r["scope"] == "zone"))

    def test_optional_email_sending_skipped_without_live_group(self):
        groups = [g for g in SAMPLE_GROUPS if "Email Sending" not in g["name"]]
        resolved, missing = MOD.resolve_permissions(self.policy, groups)
        email = [r for r in resolved if r["wanted"] == "Email Sending Write"]
        if not email:
            self.skipTest("policy has no Email Sending")
        self.assertEqual(email[0]["source"], "skipped")
        self.assertNotIn("Email Sending Write", missing)


class SecretsAndRedactTests(unittest.TestCase):
    def test_redact_strips_token_from_errors(self):
        secret = "cfat_fixture_not_a_real_token"
        text = MOD.redact(f"Authorization Bearer {secret} failed", secret)
        self.assertNotIn(secret, text)
        self.assertIn("<redacted>", text)

    def test_upsert_preserves_other_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / ".env.secrets"
            path.write_text("OTHER=keep-me\nCLOUDFLARE_API_TOKEN=old\n", encoding="utf-8")
            MOD.upsert_env_secrets(path, {"CLOUDFLARE_API_TOKEN": "new", "CFT": "new"})
            body = path.read_text(encoding="utf-8")
            self.assertIn("OTHER=keep-me", body)
            self.assertIn("CLOUDFLARE_API_TOKEN=new", body)
            self.assertIn("CFT=new", body)
            self.assertNotIn("old", body)

    def test_parse_secrets_ignores_comments(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / ".env.secrets"
            path.write_text("# CLOUDFLARE_API_TOKEN=commented\nCFT=real\n", encoding="utf-8")
            values = MOD.parse_secrets_file(path)
            self.assertEqual(values["CFT"], "real")
            self.assertNotIn("CLOUDFLARE_API_TOKEN", values)

    def test_bootstrap_typo_key_from_parent_env(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo = root / "site"
            repo.mkdir()
            (root / ".env.secrets").write_text(
                "CLOUD_FLARE_BOOTSTRAP_TOKEN=boot-secret\n", encoding="utf-8")
            env = {k: v for k, v in __import__("os").environ.items()
                   if k not in MOD.BOOTSTRAP_KEYS}
            with patch.dict("os.environ", env, clear=True):
                tok = MOD.load_bootstrap_token(repo, op_token="fallback")
            self.assertEqual(tok, "boot-secret")


class HttpHelperTests(unittest.TestCase):
    def test_evaluate_denied_pass_on_403(self):
        check = {"expect": "denied"}
        self.assertTrue(MOD.evaluate_check(check, 403, {"success": False}))

    def test_evaluate_denied_fail_on_200(self):
        check = {"expect": "denied"}
        self.assertFalse(MOD.evaluate_check(check, 200, {"success": True}))

    def test_evaluate_ok_pass_on_200(self):
        check = {"expect": "ok"}
        self.assertTrue(MOD.evaluate_check(check, 200, {"success": True}))

    def test_dashboard_mentions_bootstrap_template(self):
        policy = MOD.load_policy()
        resolved, _ = MOD.resolve_permissions(policy, SAMPLE_GROUPS)
        text = MOD.dashboard_instructions(policy, resolved)
        self.assertIn("Create Additional Tokens", text)
        self.assertIn("Account API Tokens", text)
        self.assertIn("Access: Users Write", text)
        self.assertIn("Do NOT grant", text)
        self.assertIn(policy["token_name"], text)
        self.assertIn(policy["zone_name"], text)
        self.assertIn("source does not run python3", text)
        self.assertIn("source ../.env.secrets", text)

    def test_dry_run_does_not_post(self):
        policy = MOD.load_policy()
        calls = []

        def fake_cf(path, token, method="GET", body=None, timeout=30):
            calls.append((method, path))
            if "permission_groups" in path:
                return 403, {"success": False, "errors": [{"code": 9109, "message": "no"}]}
            if path.endswith("/tokens/verify") or "/tokens/verify" in path:
                return 200, {"success": True, "result": {"id": "x", "status": "active"}}
            if "/tokens" in path and method == "POST":
                raise AssertionError("dry-run must not POST")
            return 403, {"success": False, "errors": [{"code": 9109, "message": "no"}]}

        with patch.object(MOD, "cf", side_effect=fake_cf), \
             patch.object(MOD, "AUDIT_DIR", Path(tempfile.mkdtemp())):
            code, secret = MOD.allocate(
                policy, "bootstrap-fixture", apply=False,
                print_secret=False, secrets=("bootstrap-fixture",))
        self.assertEqual(code, 0)
        self.assertIsNone(secret)
        self.assertFalse(any(m == "POST" for m, _ in calls))

    def test_apply_403_writes_instructions_not_secret(self):
        policy = MOD.load_policy()
        printed = []

        def fake_cf(path, token, method="GET", body=None, timeout=30):
            if "permission_groups" in path:
                return 200, {"success": True, "result": SAMPLE_GROUPS,
                             "result_info": {"total_pages": 1}}
            if "tokens/verify" in path:
                return 200, {"success": True, "result": {"id": "x", "status": "active"}}
            if "/tokens" in path and "permission_groups" not in path and method == "GET":
                return 403, {"success": False, "errors": [{"code": 9109, "message": "no"}]}
            if method == "POST":
                return 403, {"success": False, "errors": [{"code": 9109, "message": "Unauthorized"}]}
            return 403, {"success": False, "errors": [{"code": 9109, "message": "no"}]}

        with patch.object(MOD, "cf", side_effect=fake_cf), \
             patch.object(MOD, "AUDIT_DIR", Path(tempfile.mkdtemp())), \
             patch("builtins.print", side_effect=lambda *a, **k: printed.append(" ".join(str(x) for x in a))):
            code, secret = MOD.allocate(
                policy, "bootstrap-fixture", apply=True,
                print_secret=True, secrets=("bootstrap-fixture",))
        self.assertEqual(code, 2)
        self.assertIsNone(secret)
        blob = "\n".join(printed)
        self.assertIn("Create Additional Tokens", blob)
        self.assertNotIn("bootstrap-fixture", blob)

    def test_apply_create_writes_env_without_logging_secret(self):
        policy = MOD.load_policy()
        new_secret = "cfat_created_fixture_secret"

        def fake_cf(path, token, method="GET", body=None, timeout=30):
            if "permission_groups" in path:
                return 200, {"success": True, "result": SAMPLE_GROUPS,
                             "result_info": {"total_pages": 1}}
            if "tokens/verify" in path:
                return 200, {"success": True, "result": {"id": "x", "status": "active"}}
            if "/tokens" in path and "permission_groups" not in path and method == "GET":
                return 200, {"success": True, "result": [], "result_info": {"total_pages": 1}}
            if method == "POST" and "/tokens" in path:
                return 200, {"success": True, "result": {"id": "newid", "value": new_secret}}
            return 403, {"success": False, "errors": [{"code": 9109, "message": "no"}]}

        with tempfile.TemporaryDirectory() as tmp:
            secrets_path = Path(tmp) / ".env.secrets"
            secrets_path.write_text("CLOUDFLARE_API_TOKEN=old\n", encoding="utf-8")
            buf = io.StringIO()
            with patch.object(MOD, "cf", side_effect=fake_cf), \
                 patch.object(MOD, "AUDIT_DIR", Path(tmp) / "audit"), \
                 patch.object(MOD, "SECRETS_PATH", secrets_path), \
                 patch("sys.stdout", buf):
                code, secret = MOD.allocate(
                    policy, "bootstrap-fixture", apply=True,
                    print_secret=False, secrets=("bootstrap-fixture",))
            self.assertEqual(code, 0)
            self.assertEqual(secret, new_secret)
            written = secrets_path.read_text(encoding="utf-8")
            self.assertIn(new_secret, written)
            stdout = buf.getvalue()
            self.assertNotIn(new_secret, stdout)
            self.assertNotIn("bootstrap-fixture", stdout)


class LiveUrlopenDecodeTests(unittest.TestCase):
    def test_cf_accepts_non_json_200(self):
        class Resp:
            status = 200
            headers = {"Content-Type": "application/javascript"}

            def read(self):
                return b"addEventListener('fetch', () => {})"

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        with patch("urllib.request.urlopen", return_value=Resp()):
            status, payload = MOD.cf("/accounts/x/workers/scripts/y", "tok")
        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])


if __name__ == "__main__":
    unittest.main()
