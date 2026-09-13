"""Compare cape designs without assuming that corresponding colors are alike.

The detector is deliberately on demand. Importing this module never opens a
cape image; a caller chooses one cape and the candidates to compare with it.
Results are suggestions for visual review, not automatic guild assignments.
"""

from collections import Counter
from pathlib import Path

from PIL import Image


CATALOG = Path(__file__).resolve().parents[1] / "ui" / "catalog"
GRID = (20, 32)


def signature(sha, catalog=CATALOG):
    """Color-invariant spatial features from a cape's visible back design."""
    with Image.open(catalog / "back" / f"{sha}.png") as image:
        pixels = list(image.convert("RGBA").resize(GRID, Image.Resampling.NEAREST).getdata())
    opaque = [pixel[:3] if pixel[3] >= 128 else None for pixel in pixels]
    common = Counter(opaque).most_common(1)[0][0]
    main = frozenset(i for i, color in enumerate(opaque) if color == common)
    edges = set()
    width, height = GRID
    for y in range(height):
        for x in range(width):
            i = y * width + x
            for distance in (1, 2):
                if x + distance < width and opaque[i] != opaque[i + distance]:
                    edges.add((i, 0, distance))
                if y + distance < height and opaque[i] != opaque[i + distance * width]:
                    edges.add((i, 1, distance))
    # Canonical color IDs identify exact layout matches after arbitrary recoloring.
    color_ids = {}
    pattern = tuple(color_ids.setdefault(color, len(color_ids)) for color in opaque)
    return {"edges": frozenset(edges), "main": main, "pattern": pattern}


def overlap(left, right):
    if not left or not right:
        return 0.0
    return 2 * len(left & right) / (len(left) + len(right))


def similarity(left, right):
    """Return a 0..1 score; plain/blank backs are excluded."""
    if min(len(left["edges"]), len(right["edges"])) < 60:
        return 0.0
    if left["pattern"] == right["pattern"]:
        return 1.0
    edge_score = overlap(left["edges"], right["edges"])
    main_score = overlap(left["main"], right["main"])
    return round(0.8 * edge_score + 0.2 * main_score, 4)


def find_recolors(sha, records, catalog=CATALOG, minimum=0.72, limit=20,
                  progress=None):
    """Compare one selected cape with supplied records; never write metadata."""
    selected = next((record for record in records if record["sha1"] == sha), None)
    if selected is None:
        raise ValueError("Selected cape is not in the catalog")
    source = signature(sha, catalog)
    matches = []
    candidates = [record for record in records if record["sha1"] != sha
                  and record["resolution"] == selected["resolution"]
                  and record.get("coverage", 0) > 5]
    for index, record in enumerate(candidates, 1):
        try:
            score = similarity(source, signature(record["sha1"], catalog))
        except (FileNotFoundError, OSError):
            continue
        if score >= minimum:
            matches.append((score, record))
        if progress and index % 100 == 0:
            progress(index, len(candidates))
    return sorted(matches, key=lambda item: (-item[0], item[1]["sha1"]))[:limit]
