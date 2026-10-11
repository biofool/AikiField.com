#!/usr/bin/env python3
"""Unit tests for scripts/cloudflare_migrate.py diagnose()/err() (CloudManagement#111).

Payloads are real Cloudflare error shapes from the 2026-10-09 audit.
No live calls. Run:

    python3 tests/unit/test_cloudflare_migrate_diagnose.py
"""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "cloudflare_migrate.py"
spec = importlib.util.spec_from_file_location("cloudflare_migrate", SCRIPT)
cfm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cfm)


def payload(code, message):
    return {"success": False, "errors": [{"code": code, "message": message}]}


class DiagnoseTests(unittest.TestCase):
    def test_categories(self):
        cases = [
            (payload(9109, "Cannot use the access token from location: 104.28.219.9"), "ip_blocked"),
            (payload(9109, "Valid user-level authentication not found"), "wrong_token_type"),
            (payload(9109, "Unauthorized to access requested resource"), "missing_scope"),
            (payload(10000, "Authentication error"), "missing_scope"),
            (payload(1000, "Invalid API Token"), "invalid_token"),
            (payload(6111, "Invalid format for Authorization header"), "invalid_token"),
            (payload(0, "timed out"), "network_error"),
            (payload(7003, "Could not route"), "unknown"),
        ]
        for body, want in cases:
            with self.subTest(want=want):
                self.assertEqual(cfm.diagnose(body)[0], want)

    def test_ip_hint_names_address(self):
        _, hint = cfm.diagnose(payload(9109, "Cannot use the access token from location: 104.28.219.9"))
        self.assertIn("104.28.219.9", hint)

    def test_err_prefixes_category_and_keeps_errors(self):
        text = cfm.err(payload(10000, "Authentication error"))
        self.assertTrue(text.startswith("[missing_scope]"))
        self.assertIn("Authentication error", text)

    def test_err_unknown_is_unchanged(self):
        body = payload(7003, "Could not route")
        self.assertEqual(cfm.err(body), str(body["errors"]))


if __name__ == "__main__":
    unittest.main()
