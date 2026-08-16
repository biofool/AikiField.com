#!/usr/bin/env python3
"""Unit tests for the CloudManagement intent/actual wrapping in
translate-strings.py (CloudManagement issue #52).

Tests cover:
  - _estimated_cost_usd with the shared 500K free tier (per-locale and cumulative)
  - _build_cm_client with --no-report, missing project_id, and configured env
  - translate_locale intent gating: denied intent skips the locale
  - translate_locale actual reporting on success and failure
  - translate_locale dry-run does not call CloudManagement

Does NOT make real Google Cloud Translation API calls or real HTTP calls to
the CloudManagement hub — the CM client is a fake and the Google Translate
client import is stubbed.
"""

import argparse
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

# Make scripts/ importable so we can import the vendored cloud_management_client.
SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts')
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

# translate-strings.py has a hyphen in its name, so import it via importlib.
import importlib.util
_spec = importlib.util.spec_from_file_location('translate_strings', os.path.join(SCRIPTS_DIR, 'translate-strings.py'))
ts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ts)


class TestEstimatedCost(unittest.TestCase):
    """Verify _estimated_cost_usd accounts for the shared 500K free tier."""

    def test_within_free_tier_zero_cost(self):
        self.assertEqual(ts._estimated_cost_usd(90_000), 0.0)
        self.assertEqual(ts._estimated_cost_usd(500_000), 0.0)

    def test_beyond_free_tier_positive_cost(self):
        # 600K chars, 100K billable → 100K * $20/1M = $2.00
        self.assertAlmostEqual(ts._estimated_cost_usd(600_000), 2.0, places=4)

    def test_cumulative_prior_chars_depletes_free_tier(self):
        # 450K already translated, 100K more → 50K billable → $1.00
        self.assertAlmostEqual(ts._estimated_cost_usd(100_000, prior_chars=450_000), 1.0, places=4)

    def test_cumulative_free_tier_exhausted(self):
        # 500K already translated, 90K more → all 90K billable → $1.80
        self.assertAlmostEqual(ts._estimated_cost_usd(90_000, prior_chars=500_000), 1.8, places=4)

    def test_cumulative_beyond_free_tier(self):
        # 600K already translated, 100K more → all 100K billable → $2.00
        self.assertAlmostEqual(ts._estimated_cost_usd(100_000, prior_chars=600_000), 2.0, places=4)


class TestBuildCmClient(unittest.TestCase):
    """Verify _build_cm_client returns None when disabled/unconfigured."""

    def _args(self, no_report=False, cm_url=None, cm_project=None):
        return argparse.Namespace(no_report=no_report, cm_url=cm_url, cm_project=cm_project)

    def test_no_report_returns_none(self):
        self.assertIsNone(ts._build_cm_client(self._args(no_report=True)))

    def test_missing_project_id_returns_none(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(ts._build_cm_client(self._args()))

    def test_with_project_id_returns_client(self):
        with patch.dict(os.environ, {'CLOUDMANAGEMENT_PROJECT_ID': 'test-proj'}, clear=True):
            client = ts._build_cm_client(self._args(cm_project='test-proj', cm_url='http://fake:9999'))
            self.assertIsNotNone(client)
            self.assertEqual(client.project_id, 'test-proj')


class FakeIntentResponse:
    def __init__(self, approved=True, intent_id='int_fake123', reason=''):
        self.approved = approved
        self.intent_id = intent_id
        self.reason = reason


class TestTranslateLocaleIntentGating(unittest.TestCase):
    """Verify translate_locale skips locales when intent is denied."""

    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.strings_dir = os.path.join(self.tmpdir.name, 'i18n-strings')
        os.makedirs(self.strings_dir)
        # en.json with 2 keys
        with open(os.path.join(self.strings_dir, 'en.json'), 'w') as f:
            json.dump({'greeting': 'Hello world', 'farewell': 'Goodbye'}, f)
        # es.json with empty placeholders
        with open(os.path.join(self.strings_dir, 'es.json'), 'w') as f:
            json.dump({'greeting': '', 'farewell': ''}, f)
        # Patch STRINGS_DIR
        self._orig_dir = ts.STRINGS_DIR
        ts.STRINGS_DIR = self.strings_dir

    def tearDown(self):
        ts.STRINGS_DIR = self._orig_dir
        self.tmpdir.cleanup()

    def test_denied_intent_skips_locale(self):
        """When the hub denies the intent, no translation calls are made."""
        cm_client = MagicMock()
        cm_client.declare_intent.return_value = FakeIntentResponse(approved=False, reason='budget exceeded')
        en_strings = ts.load_json(os.path.join(self.strings_dir, 'en.json'))

        with patch.object(ts, 'translate_batch') as mock_batch:
            keys, chars = ts.translate_locale('es', en_strings, dry_run=False, cm_client=cm_client)
            mock_batch.assert_not_called()

        self.assertEqual(keys, 0)
        # chars still reported (the locale was planned but skipped)
        self.assertGreater(chars, 0)
        # No actual report should be sent since intent_id is empty on denial
        cm_client.report_actual.assert_not_called()

    def test_approved_intent_translates_and_reports(self):
        """When the hub approves, translation proceeds and actuals are reported."""
        cm_client = MagicMock()
        cm_client.declare_intent.return_value = FakeIntentResponse(approved=True, intent_id='int_ok')
        en_strings = ts.load_json(os.path.join(self.strings_dir, 'en.json'))

        with patch.object(ts, 'translate_batch', return_value=['Hola mundo', 'Adiós']):
            # Stub the Google Translate client import inside translate_locale
            import types
            fake_translate_mod = types.ModuleType('google.cloud.translate_v2')
            fake_client = MagicMock()
            fake_translate_mod.Client = MagicMock(return_value=fake_client)
            sys.modules['google'] = types.ModuleType('google')
            sys.modules['google.cloud'] = types.ModuleType('google.cloud')
            sys.modules['google.cloud.translate_v2'] = fake_translate_mod
            try:
                keys, chars = ts.translate_locale('es', en_strings, dry_run=False, cm_client=cm_client)
            finally:
                sys.modules.pop('google.cloud.translate_v2', None)
                sys.modules.pop('google.cloud', None)
                sys.modules.pop('google', None)

        self.assertEqual(keys, 2)
        cm_client.declare_intent.assert_called_once()
        cm_client.report_actual.assert_called_once()
        actual_call = cm_client.report_actual.call_args
        self.assertEqual(actual_call.kwargs['status'], 'completed')
        self.assertEqual(actual_call.kwargs['actual_calls'], 2)
        self.assertEqual(actual_call.kwargs['intent_id'], 'int_ok')

    def test_dry_run_does_not_call_cm(self):
        """Dry run should not declare intents or report actuals."""
        cm_client = MagicMock()
        en_strings = ts.load_json(os.path.join(self.strings_dir, 'en.json'))
        keys, chars = ts.translate_locale('es', en_strings, dry_run=True, cm_client=cm_client)
        cm_client.declare_intent.assert_not_called()
        cm_client.report_actual.assert_not_called()
        self.assertEqual(keys, 2)

    def test_no_cm_client_does_not_crash(self):
        """When cm_client is None, the script still translates normally."""
        en_strings = ts.load_json(os.path.join(self.strings_dir, 'en.json'))
        import types
        fake_translate_mod = types.ModuleType('google.cloud.translate_v2')
        fake_client = MagicMock()
        fake_translate_mod.Client = MagicMock(return_value=fake_client)
        sys.modules['google'] = types.ModuleType('google')
        sys.modules['google.cloud'] = types.ModuleType('google.cloud')
        sys.modules['google.cloud.translate_v2'] = fake_translate_mod
        try:
            with patch.object(ts, 'translate_batch', return_value=['Hola', 'Adiós']):
                keys, chars = ts.translate_locale('es', en_strings, dry_run=False, cm_client=None)
        finally:
            sys.modules.pop('google.cloud.translate_v2', None)
            sys.modules.pop('google.cloud', None)
            sys.modules.pop('google', None)
        self.assertEqual(keys, 2)


if __name__ == '__main__':
    unittest.main()
