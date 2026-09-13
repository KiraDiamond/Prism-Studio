"""Validate the supplied cape analysis and build a compact launcher index.

Exact copies share a unit. Accepted recolor components join units into a
design. Unresolved candidates remain outside those groups. The one previously
reviewed Nia recolor link is included as an additional accepted relationship.
"""

import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts" / "recolor-source"
CATALOG = ROOT / "ui" / "catalog"
OUTPUT = CATALOG / "variation-groups.json"


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def build():
    records = read(CATALOG / "capes.json")["capes"]
    by_sha = {cape["sha1"]: cape for cape in records}
    order = {cape["sha1"]: index for index, cape in enumerate(records)}
    hashes = set(by_sha)
    if len(hashes) != len(records):
        raise ValueError("Catalog contains duplicate SHA IDs")
    features = read(SOURCE / "features_v2.json")
    if len(features) != len(hashes) or {entry["sha"] for entry in features} != hashes:
        raise ValueError("Feature file does not cover the complete catalog")
    for entry in features:
        if f"{entry['w']}x{entry['h']}" != by_sha[entry["sha"]]["resolution"]:
            raise ValueError(f"Feature dimensions differ for {entry['sha']}")

    units = read(SOURCE / "unit_groups.json")
    unit_of = units["unit_of"]
    if set(unit_of) != hashes or not set(unit_of.values()) <= hashes:
        raise ValueError("Unit mapping does not cover the complete catalog")
    members = defaultdict(list)
    for sha in by_sha:
        members[unit_of[sha]].append(sha)
    for group in units["exact_components"]:
        if len({unit_of[sha] for sha in group}) != 1:
            raise ValueError("Exact component spans multiple units")

    cross_scale = read(SOURCE / "cross_scale_dups.json")
    if set(cross_scale["norm_hash"]) != hashes:
        raise ValueError("Cross-scale hashes do not cover the catalog")
    for a, b, *_ in cross_scale["verified_pairs"]:
        if unit_of[a] != unit_of[b]:
            raise ValueError("Verified cross-scale duplicate is not an exact unit")

    parent = {unit: unit for unit in members}

    def find(unit):
        while parent[unit] != unit:
            parent[unit] = parent[parent[unit]]
            unit = parent[unit]
        return unit

    def join(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[max(a, b)] = min(a, b)

    seen_units = set()
    for component in units["recolor_unit_components"]:
        if len(component) < 2 or seen_units.intersection(component):
            raise ValueError("Recolor components must be distinct units")
        seen_units.update(component)
        for unit in component[1:]:
            join(component[0], unit)

    reviewed = read(CATALOG / "recolor-links.json")["links"]
    for cape, base in reviewed.items():
        if cape not in hashes or base not in hashes:
            raise ValueError("Reviewed recolor link is missing from the catalog")
        join(unit_of[cape], unit_of[base])

    for edge in units["accepted_edges"]:
        if find(unit_of[edge["a"]]) != find(unit_of[edge["b"]]):
            raise ValueError("Accepted recolor edge is missing from its group")
    for edge in units["rejected_edges"]:
        if find(unit_of[edge["a"]]) == find(unit_of[edge["b"]]):
            raise ValueError("Rejected recolor edge was joined")

    grouped_units = defaultdict(list)
    for unit in members:
        grouped_units[find(unit)].append(unit)
    groups = []
    for group_units in grouped_units.values():
        if len(group_units) == 1 and len(members[group_units[0]]) == 1:
            continue
        variants = []
        for unit in sorted(group_units, key=lambda value: min(order[sha] for sha in members[value])):
            copies = sorted(members[unit], key=order.get)
            variants.append({"representative": copies[0], "members": copies})
        groups.append({"id": variants[0]["representative"], "variants": variants})
    groups.sort(key=lambda group: order[group["id"]])

    uncertain = read(SOURCE / "uncertain_candidates_unresolved.json")
    for edge in uncertain:
        a, b = edge["a"], edge["b"]
        if a not in hashes or b not in hashes:
            raise ValueError("Unresolved pair contains an unknown cape")
        if find(unit_of[a]) == find(unit_of[b]):
            raise ValueError("Unresolved pair was joined as a confirmed recolor")

    result = {
        "version": 1,
        "source": "Supplied exact, cross-scale, recolor, and unresolved analysis; reviewed Nia example",
        "catalog_count": len(records),
        "groups": groups,
        "uncertain": [{"a": edge["a"], "b": edge["b"]} for edge in uncertain],
    }
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    temporary.replace(OUTPUT)
    print(f"Indexed {len(groups)} expandable designs and {len(uncertain)} unresolved pairs from {len(records)} capes")


if __name__ == "__main__":
    build()
