#!/usr/bin/env python3
"""Data and deployment rules for the Twenty Practices data (AikiField issue #114).

The practice text lives in ONE file, data/exercises/practices.json, in a
directory the web server must deny. These tests check the file itself, that no
other copy of the text is left, and that the directory's REAL .htaccess still
denies every request. They read the real .htaccess on purpose: a test that only
checked the e2e router could pass while production allowed the file.

No network. Run:

    python3 tests/unit/test_exercises_data.py
"""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PRIVATE_DIR = ROOT / "data" / "exercises"
PRACTICES = PRIVATE_DIR / "practices.json"
STUDIOS = PRIVATE_DIR / "studios.json"
HTACCESS = PRIVATE_DIR / ".htaccess"
FREE_IDS = {1, 6, 12}
PART_RE = re.compile(r"^Part (I|II|III|IV) — \S")


def _active_lines(text: str) -> list[str]:
    """The lines of an .htaccess that Apache acts on (no blanks, no comments)."""
    return [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("#")]


class PracticeDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = json.loads(PRACTICES.read_text(encoding="utf-8"))
        cls.practices = cls.doc["practices"]

    def test_header(self):
        for key in ("title", "book_title", "author", "note"):
            self.assertTrue(isinstance(self.doc[key], str) and self.doc[key].strip(), key)
        self.assertIsInstance(self.doc["version"], int)

    def test_fifteen_practices_with_ids_one_to_fifteen(self):
        self.assertEqual([p["id"] for p in self.practices], list(range(1, 16)))

    def test_practice_shape(self):
        for p in self.practices:
            with self.subTest(id=p["id"]):
                for key in ("title", "meta", "body", "part"):
                    self.assertTrue(isinstance(p[key], str) and p[key].strip(), key)
                self.assertTrue(isinstance(p["complexity"], int) and p["complexity"] >= 1)
                self.assertEqual(p["type"], "exercise")
                self.assertRegex(p["part"], PART_RE)

    def test_titles_are_unique(self):
        titles = [p["title"] for p in self.practices]
        self.assertEqual(len(titles), len(set(titles)))

    def test_free_flag_marks_practices_1_6_and_12(self):
        free = {p["id"] for p in self.practices if "free" in p}
        self.assertEqual(free, FREE_IDS)
        for p in self.practices:
            if "free" in p:
                self.assertIs(p["free"], True, f"practice {p['id']}: free is true or absent")


def _time_range_seconds(meta: str) -> tuple[int, int]:
    """The first time range in a practice's meta line, as (low, high) seconds."""
    m = re.search(r"(\d+)\s*[\u2013-]\s*(\d+)\s*min", meta)
    if m:
        return int(m.group(1)) * 60, int(m.group(2)) * 60
    m = re.search(r"(\d+)\s*min", meta)
    if m:
        return int(m.group(1)) * 60, int(m.group(1)) * 60
    m = re.search(r"(\d+)\s*sec", meta)
    if m:
        return int(m.group(1)), int(m.group(1))
    raise AssertionError(f"no time range in meta: {meta}")


class GuideDataTests(unittest.TestCase):
    """Play Guided data (issue #113): a duration per practice, prompts only where the author wrote them."""

    MAX_SEC = 7200

    @classmethod
    def setUpClass(cls):
        cls.practices = json.loads(PRACTICES.read_text(encoding="utf-8"))["practices"]

    def test_every_practice_has_a_guide_with_a_duration(self):
        for p in self.practices:
            with self.subTest(id=p["id"]):
                d = p["guide"]["duration_sec"]
                self.assertTrue(isinstance(d, int) and not isinstance(d, bool))
                self.assertTrue(1 <= d <= self.MAX_SEC, d)

    def test_duration_sits_inside_the_practices_own_time_range(self):
        # Started at the low end of the range; the owner may raise it per practice
        # but it must stay inside what the practice's own meta line promises.
        for p in self.practices:
            with self.subTest(id=p["id"]):
                low, high = _time_range_seconds(p["meta"])
                self.assertTrue(low <= p["guide"]["duration_sec"] <= high, (low, p["guide"]["duration_sec"], high))

    def test_durations_as_shipped_are_the_low_end_of_each_range(self):
        shipped = {p["id"]: p["guide"]["duration_sec"] for p in self.practices}
        self.assertEqual(
            shipped,
            {1: 30, 2: 120, 3: 180, 4: 300, 5: 600, 6: 300, 7: 180, 8: 300, 9: 180, 10: 120, 11: 180, 12: 600, 13: 180, 14: 300, 15: 300},
        )

    def test_guide_keys_are_known(self):
        for p in self.practices:
            with self.subTest(id=p["id"]):
                self.assertLessEqual(set(p["guide"]), {"duration_sec", "phase", "prompt", "meter", "steps"})

    def test_steps_are_in_order_inside_the_session(self):
        for p in self.practices:
            g = p["guide"]
            previous = 0
            for i, step in enumerate(g.get("steps", [])):
                with self.subTest(id=p["id"], step=i):
                    self.assertLessEqual(set(step), {"at_sec", "prompt", "phase", "meter"})
                    self.assertTrue(isinstance(step["at_sec"], int) and previous < step["at_sec"] < g["duration_sec"])
                    previous = step["at_sec"]
                    self.assertTrue({"prompt", "phase", "meter"} & set(step), "a step changes something")
                    for key in ("prompt", "phase"):
                        if key in step:
                            self.assertTrue(isinstance(step[key], str) and step[key].strip())
                    if "meter" in step:
                        self.assertIn("meter", g)
                        self.assertTrue(0 <= step["meter"] <= 100)

    def test_meter_shape(self):
        for p in self.practices:
            m = p["guide"].get("meter")
            if m is None:
                continue
            with self.subTest(id=p["id"]):
                self.assertEqual(set(m), {"start", "goal", "caption"})
                self.assertTrue(0 <= m["start"] <= 100 and 0 <= m["goal"] <= 100)
                self.assertIn("{value}", m["caption"])

    def test_wrist_grab_grounding_keeps_push_pull_and_the_ground_meter(self):
        g = next(p for p in self.practices if p["id"] == 6)["guide"]
        prompts = [s["prompt"] for s in g["steps"] if "prompt" in s]
        self.assertTrue(any(t.startswith("Push") for t in prompts))
        self.assertTrue(any(t.startswith("Pull") for t in prompts))
        self.assertEqual(g["meter"]["start"], 50)
        self.assertEqual(g["meter"]["goal"], 60)
        self.assertEqual([s["meter"] for s in g["steps"] if "meter" in s], [50, 55, 60])

    def test_no_other_practice_borrows_the_wrist_grab_wording(self):
        for p in self.practices:
            if p["id"] == 6:
                continue
            with self.subTest(id=p["id"]):
                text = json.dumps(p["guide"], ensure_ascii=False)
                for phrase in ("Push", "Pull", "ground", "Resist", "50/50", "DBSO \u2014"):
                    self.assertNotIn(phrase, text)


class StudioDataTests(unittest.TestCase):
    """The studio list is third-party business data: name and area only (issue #112)."""

    @classmethod
    def setUpClass(cls):
        cls.doc = json.loads(STUDIOS.read_text(encoding="utf-8"))
        cls.studios = cls.doc["studios"]

    def test_header(self):
        for key in ("title", "note"):
            self.assertTrue(isinstance(self.doc[key], str) and self.doc[key].strip(), key)
        self.assertIsInstance(self.doc["version"], int)

    def test_twenty_studios_with_unique_names(self):
        names = [s["name"] for s in self.studios]
        self.assertEqual(len(names), 20)
        self.assertEqual(len(names), len(set(names)))

    def test_only_name_and_region_are_stored(self):
        for studio in self.studios:
            with self.subTest(name=studio.get("name")):
                self.assertEqual(set(studio), {"name", "region"})
                for key in ("name", "region"):
                    self.assertTrue(isinstance(studio[key], str) and studio[key].strip(), key)

    def test_no_street_address_or_blurb_is_left(self):
        text = STUDIOS.read_text(encoding="utf-8")
        for fragment in ("University Ave", "Thorndon Quay", "Customhouse Quay", "remedial", "Movement is Medicine", "Shihan"):
            self.assertNotIn(fragment, text)


class OneCopyTests(unittest.TestCase):
    """The practice text exists once, in the private directory."""

    def test_the_three_dead_copies_are_gone(self):
        data_dir = ROOT / "games" / "exercises" / "data"
        self.assertFalse(data_dir.exists(), "games/exercises/data/ must not exist")
        for name in (
            "collected_exercises_app_data.json",
            "collected_exercises_16_app.jsonl",
            "collected_exercises_full_markdown.jsonl",
        ):
            self.assertFalse((data_dir / name).exists(), name)

    def test_lightness_data_moved_to_the_private_directory(self):
        self.assertTrue((PRIVATE_DIR / "lightness.json").is_file())
        self.assertFalse((ROOT / "games" / "exercises" / "data" / "lightness.json").exists())

    def test_no_other_file_under_games_carries_a_practice_body(self):
        bodies = [p["body"] for p in json.loads(PRACTICES.read_text(encoding="utf-8"))["practices"]]
        # A sentence-sized probe from each body; shorter ones would match unrelated copy.
        probes = []
        for body in bodies:
            runs = re.findall(r"[A-Za-z0-9 ,.']{20,}", body)
            self.assertTrue(runs, "no probe-sized run of plain characters in a body")
            probes.append(max(runs, key=len)[:60])
        self.assertEqual(len(probes), 15)
        offenders = []
        for path in sorted((ROOT / "games").rglob("*")):
            if not path.is_file() or path.suffix.lower() in {".webp", ".png", ".jpg", ".jpeg", ".gif"}:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            for probe in probes:
                if probe in text:
                    offenders.append((str(path.relative_to(ROOT)), probe))
        self.assertEqual(offenders, [], "practice text found outside data/exercises/")


class PrivateDirectoryTests(unittest.TestCase):
    """The REAL .htaccess is what production reads."""

    def test_htaccess_exists_and_denies_everything(self):
        self.assertTrue(HTACCESS.is_file(), "data/exercises/.htaccess is missing")
        active = _active_lines(HTACCESS.read_text(encoding="utf-8"))
        self.assertIn("Require all denied", active)

    def test_nothing_in_the_htaccess_grants_access_again(self):
        active = " ".join(_active_lines(HTACCESS.read_text(encoding="utf-8"))).lower()
        for grant in ("require all granted", "allow from", "satisfy any", "require ip", "require valid-user"):
            self.assertNotIn(grant, active)

    def test_no_php_or_html_file_sits_in_the_private_directory(self):
        # Apache would execute or serve them if the deny line were ever lost.
        for path in PRIVATE_DIR.rglob("*"):
            if path.is_file():
                self.assertIn(path.suffix.lower(), {".json", ""}, str(path))

    def test_the_page_reads_only_from_the_private_directory(self):
        page = (ROOT / "games" / "exercises" / "index.php").read_text(encoding="utf-8")
        self.assertIn("/data/exercises/practices.json", page)
        self.assertIn("/data/exercises/lightness.json", page)
        self.assertNotIn("games/exercises/data", page)

    def test_the_router_reads_the_real_htaccess_files(self):
        # tests/e2e/router.php must derive its 403s from the real files, so the
        # e2e specs cannot pass while the production rule is missing.
        router = (ROOT / "tests" / "e2e" / "router.php").read_text(encoding="utf-8")
        self.assertIn(".htaccess", router)
        self.assertIn("Require\\s+all\\s+denied", router)


if __name__ == "__main__":
    unittest.main(verbosity=2)
