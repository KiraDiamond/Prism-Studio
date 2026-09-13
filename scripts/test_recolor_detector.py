"""Regression examples: two user-identified recolors and one unrelated cape."""

import json
import unittest
from pathlib import Path

from recolor_detector import signature, similarity


CATALOG = Path(__file__).resolve().parents[1] / "ui" / "catalog"
NIA_DARK = "0bed68669c3388964c7f67f0b5469e993b7293a5"
NIA_LIGHT = "15297392c70fc854b2458188ab7bbbff0dad5d27"
UNRELATED = "0ead25e56a2c995c8ecc486a37aa2d62b73497cf"


class RecolorDetectorTests(unittest.TestCase):
    def test_user_identified_recolor_ranks_above_unrelated(self):
        original = signature(NIA_DARK)
        self.assertGreater(similarity(original, signature(NIA_LIGHT)), 0.9)
        self.assertLess(similarity(original, signature(UNRELATED)), 0.5)

    def test_review_files_reference_catalog_capes(self):
        records = json.loads((CATALOG / "capes.json").read_text(encoding="utf-8"))["capes"]
        hashes = {cape["sha1"] for cape in records}
        guilds = json.loads((CATALOG / "guild-capes.json").read_text(encoding="utf-8"))["capes"]
        links = json.loads((CATALOG / "recolor-links.json").read_text(encoding="utf-8"))["links"]
        self.assertTrue(set(guilds) <= hashes)
        self.assertTrue(set(links) <= hashes)
        self.assertTrue(set(links.values()) <= hashes)
        self.assertNotIn(NIA_DARK, links)
        self.assertEqual(links[NIA_LIGHT], NIA_DARK)


if __name__ == "__main__":
    unittest.main()
