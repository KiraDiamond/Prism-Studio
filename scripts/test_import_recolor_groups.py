"""Check the launcher index against the supplied classification decisions."""

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "ui" / "catalog"
SOURCE = ROOT / "scripts" / "recolor-source"


class RecolorIndexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = json.loads((CATALOG / "variation-groups.json").read_text(encoding="utf-8"))
        cls.source = json.loads((SOURCE / "unit_groups.json").read_text(encoding="utf-8"))
        cls.group_of = {}
        cls.variant_of = {}
        for group in cls.index["groups"]:
            for variant in group["variants"]:
                for sha in variant["members"]:
                    if sha in cls.group_of:
                        raise AssertionError(f"Duplicate index member: {sha}")
                    cls.group_of[sha] = group["id"]
                    cls.variant_of[sha] = variant["representative"]

    def test_every_exact_copy_and_accepted_recolor_is_grouped(self):
        units = self.source["unit_of"]
        for component in self.source["exact_components"]:
            self.assertEqual(len({self.variant_of[sha] for sha in component}), 1)
        for component in self.source["recolor_unit_components"]:
            self.assertEqual(len({self.group_of[unit] for unit in component}), 1)
            self.assertEqual(len({self.variant_of[unit] for unit in component}), len(component))
        for edge in self.source["accepted_edges"]:
            self.assertEqual(self.group_of[edge["a"]], self.group_of[edge["b"]])
        catalog = json.loads((CATALOG / "capes.json").read_text(encoding="utf-8"))["capes"]
        self.assertEqual(set(units), {cape["sha1"] for cape in catalog})

    def test_unresolved_pairs_stay_outside_accepted_groups(self):
        for pair in self.index["uncertain"]:
            self.assertNotEqual(self.group_of.get(pair["a"], pair["a"]),
                                self.group_of.get(pair["b"], pair["b"]))

    def test_user_supplied_nia_recolor_is_expandable(self):
        dark = "0bed68669c3388964c7f67f0b5469e993b7293a5"
        light = "15297392c70fc854b2458188ab7bbbff0dad5d27"
        self.assertEqual(self.group_of[dark], self.group_of[light])
        self.assertNotEqual(self.variant_of[dark], self.variant_of[light])


if __name__ == "__main__":
    unittest.main()
