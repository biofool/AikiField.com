#!/usr/bin/env python3
"""Data-rule tests for games/exercises/data/lightness.json (AikiField issue #110).

The file holds the short, kind lines the Twenty Practices page shows after a
member logs a session. These tests enforce the rules from the issue: 100 unique
lines, a length limit, valid practice ids, none on a banned topic, no real
person's name, and no attribution. The rules (limits and banned patterns) live
in tests/unit/data/lightness_rules.json. No network. Run:

    python3 tests/unit/test_lightness_data.py
"""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "games" / "exercises" / "data" / "lightness.json"
EXERCISES = ROOT / "games" / "exercises" / "data" / "collected_exercises_app_data.json"
RULES = Path(__file__).resolve().parent / "data" / "lightness_rules.json"

ITEM_KEYS = {"id", "text", "kind", "practices", "themes", "approved"}


def _norm(text: str) -> str:
    return " ".join(text.lower().split())


class LightnessDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(DATA.read_text(encoding="utf-8"))
        cls.rules = json.loads(RULES.read_text(encoding="utf-8"))
        exercises = json.loads(EXERCISES.read_text(encoding="utf-8"))["exercises"]
        cls.practice_ids = {e["id"] for e in exercises}
        cls.items = cls.data["items"]

    def test_header(self):
        d = self.data
        self.assertIsInstance(d["version"], int)
        for key in ("title", "status", "written_by", "license"):
            self.assertTrue(isinstance(d[key], str) and d[key].strip(), key)
        approval = d["approval"]
        self.assertIs(approval["required_before_wide_release"], True)
        for key in ("reviewer", "how", "attribution"):
            self.assertTrue(isinstance(approval[key], str) and approval[key].strip(), key)
        self.assertIsInstance(d["display"]["show_unapproved"], bool)
        self.assertTrue(isinstance(d["guidelines"], list) and d["guidelines"])
        self.assertTrue(isinstance(d["voice_sources"], list) and d["voice_sources"])
        self.assertTrue(isinstance(d["kinds"], dict) and d["kinds"])
        self.assertTrue(isinstance(d["themes"], list) and d["themes"])
        self.assertIsInstance(d["items"], list)

    def test_item_count(self):
        self.assertEqual(len(self.items), self.rules["expected_item_count"])

    def test_item_shape(self):
        kinds = set(self.data["kinds"])
        themes = set(self.data["themes"])
        for item in self.items:
            with self.subTest(id=item.get("id")):
                self.assertEqual(set(item), ITEM_KEYS)
                self.assertRegex(item["id"], r"^lt-\d{3}$")
                self.assertIn(item["kind"], kinds)
                self.assertTrue(item["themes"], "themes must not be empty")
                self.assertTrue(set(item["themes"]) <= themes, item["themes"])
                self.assertIsInstance(item["approved"], bool)

    def test_unique_ids_and_texts(self):
        ids = [i["id"] for i in self.items]
        self.assertEqual(len(ids), len(set(ids)), "duplicate id")
        texts = [_norm(i["text"]) for i in self.items]
        self.assertEqual(len(texts), len(set(texts)), "duplicate text")

    def test_text_rules(self):
        lo, hi = self.rules["min_chars"], self.rules["max_chars"]
        for item in self.items:
            text = item["text"]
            with self.subTest(id=item["id"]):
                self.assertIsInstance(text, str)
                self.assertEqual(text, text.strip())
                self.assertNotIn("  ", text)
                self.assertTrue(all(32 <= ord(c) < 127 for c in text), "plain printable ASCII only")
                self.assertNotIn('"', text, "no quoted speech: lines are not attributed")
                self.assertTrue(lo <= len(text) <= hi, f"{len(text)} chars")

    def test_practice_ids(self):
        for item in self.items:
            with self.subTest(id=item["id"]):
                practices = item["practices"]
                self.assertIsInstance(practices, list)
                self.assertEqual(len(practices), len(set(practices)))
                for p in practices:
                    self.assertTrue(isinstance(p, int) and not isinstance(p, bool), p)
                    self.assertIn(p, self.practice_ids)

    def test_every_practice_has_lines_and_there_are_general_ones(self):
        per_practice = {pid: 0 for pid in self.practice_ids}
        general = 0
        for item in self.items:
            if not item["practices"]:
                general += 1
            for p in item["practices"]:
                per_practice[p] = per_practice.get(p, 0) + 1
        for pid in sorted(self.practice_ids):
            self.assertGreaterEqual(per_practice[pid], self.rules["min_items_per_practice"], f"practice {pid}")
        self.assertGreaterEqual(general, self.rules["min_general_items"])

    def _offenders(self, patterns):
        compiled = [re.compile(p, re.IGNORECASE) for p in patterns]
        found = []
        for item in self.items:
            for rx in compiled:
                if rx.search(item["text"]):
                    found.append((item["id"], rx.pattern, item["text"]))
        return found

    def test_no_banned_topics(self):
        self.assertEqual(self._offenders(self.rules["banned_topic_patterns"]), [])

    def test_no_real_names_or_attribution(self):
        self.assertEqual(self._offenders(self.rules["banned_name_patterns"]), [])

    def test_hiding_unapproved_still_leaves_something_to_show(self):
        if self.data["display"]["show_unapproved"]:
            return
        self.assertTrue(any(i["approved"] for i in self.items), "show_unapproved is false but nothing is approved")

    def test_rules_file_catches_what_it_should(self):
        """Guard the guard: the banned patterns must flag obvious bad lines."""
        compiled = [re.compile(p, re.IGNORECASE) for p in self.rules["banned_topic_patterns"]]
        names = [re.compile(p, re.IGNORECASE) for p in self.rules["banned_name_patterns"]]
        for bad in ("Mind the pain in your back.", "An old joke about injuries.", "Heal yourself in three breaths."):
            self.assertTrue(any(rx.search(bad) for rx in compiled), bad)
        for bad in ("As Richard says, relax.", "Bob would laugh.", "Verbal Aikido for lunch."):
            self.assertTrue(any(rx.search(bad) for rx in names), bad)
        for fine in ("Gravity is the original teacher.", "The paint is dry, and so is the plan.", "A skill, a hold, a fold."):
            self.assertFalse(any(rx.search(fine) for rx in compiled + names), fine)


if __name__ == "__main__":
    unittest.main(verbosity=2)
