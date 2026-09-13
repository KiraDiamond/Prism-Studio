"""Automatically sort catalog capes by design, palette, and OCR lettering.

Run from the test checkout. Writes resumable review suggestions under work/;
never changes the reviewed guild registry or original Prism Studio app.
"""

import json
import re
import subprocess
import tempfile
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from recolor_detector import signature
from scan_cape_guild import cape_panel, prepare_images


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "ui" / "catalog"
WORK = ROOT / "work"
RESULTS = WORK / "guild-sort-results.json"
PROGRESS = WORK / "guild-sort-progress.json"
LETTERS = WORK / "guild-sort-letters.jsonl"
MIN_DESIGN = 0.88
MIN_GUILD_DESIGN = 0.82


def write_json(path, data):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)


def progress(phase, done, total, detail=""):
    write_json(PROGRESS, {"phase": phase, "done": done, "total": total,
                          "detail": detail, "updated_at": datetime.now(timezone.utc).isoformat()})


def packed(sha):
    sample = signature(sha, CATALOG)
    edges = sum(1 << (index * 4 + axis * 2 + distance - 1)
                for index, axis, distance in sample["edges"])
    main = sum(1 << index for index in sample["main"])
    return edges, edges.bit_count(), main, main.bit_count()


def design_score(left, right):
    if min(left[1], right[1]) < 60:
        return 0.0
    edge = 2 * (left[0] & right[0]).bit_count() / (left[1] + right[1])
    main = 2 * (left[2] & right[2]).bit_count() / (left[3] + right[3])
    return round(0.8 * edge + 0.2 * main, 4)


def dominant(record):
    palette = record.get("palette") or []
    return tuple(palette[0]["rgb"]) if palette else (0, 0, 0)


def color_distance(a, b):
    return round(sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5 / (255 * 3 ** 0.5), 3)


def add_candidate(item, tag, name, evidence, score, source=None):
    existing = next((entry for entry in item["guild_candidates"] if entry["tag"].casefold() == tag.casefold()), None)
    if existing:
        if evidence not in existing["evidence"]:
            existing["evidence"].append(evidence)
        existing["score"] = max(existing["score"], round(score, 3))
    else:
        item["guild_candidates"].append({"tag": tag, "name": name,
                                         "evidence": [evidence], "score": round(score, 3),
                                         "source_sha": source})
    item["guild_candidates"].sort(key=lambda candidate: (-len(candidate["evidence"]),
                                                        -candidate["score"], candidate["tag"]))


def design_stage(records, registry):
    features = {}
    results = {}
    resolution_by_sha = {record["sha1"]: record["resolution"] for record in records}
    total = len(records)
    progress("design fingerprints", 0, total)
    for index, record in enumerate(records, 1):
        sha = record["sha1"]
        try:
            features[sha] = packed(sha)
        except (FileNotFoundError, OSError):
            features[sha] = None
        results[sha] = {"id": record["id"], "sha1": sha, "color": record["color"],
                        "shade": record["shade"], "dominant_rgb": dominant(record),
                        "color_group": f"{record['color']} / {record['shade']}",
                        "color_peers": [], "recolor_candidates": [],
                        "guild_candidates": [], "letter_candidates": [],
                        "design_group": sha}
        for guild in registry.get(sha, {}).get("guilds", []):
            add_candidate(results[sha], guild["tag"], guild["name"],
                          "existing lead", 1.0, sha)
        if index % 100 == 0 or index == total:
            progress("design fingerprints", index, total)

    groups = defaultdict(list)
    for record in records:
        if features[record["sha1"]] is not None:
            groups[record["resolution"]].append(record)
    parent = {record["sha1"]: record["sha1"] for record in records}

    def root(sha):
        while parent[sha] != sha:
            parent[sha] = parent[parent[sha]]
            sha = parent[sha]
        return sha

    def join(a, b):
        ra, rb = root(a), root(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    compared = 0
    total_pairs = sum(len(group) * (len(group) - 1) // 2 for group in groups.values())
    progress("design comparison", 0, total_pairs)
    for group in groups.values():
        for i, first in enumerate(group):
            a = first["sha1"]
            fa = features[a]
            for second in group[i + 1:]:
                b = second["sha1"]
                fb = features[b]
                compared += 1
                if min(fa[1], fb[1]) * 2 < max(fa[1], fb[1]):
                    continue
                score = design_score(fa, fb)
                if score >= MIN_DESIGN:
                    join(a, b)
                    distance = color_distance(results[a]["dominant_rgb"], results[b]["dominant_rgb"])
                    for source, target in ((a, b), (b, a)):
                        matches = results[source]["recolor_candidates"]
                        matches.append({"sha1": target, "score": score,
                                        "color_distance": distance})
                        matches.sort(key=lambda match: (-match["score"], -match["color_distance"]))
                        del matches[8:]
            if i % 100 == 0:
                progress("design comparison", compared, total_pairs)
    progress("design comparison", total_pairs, total_pairs)
    for sha in results:
        results[sha]["design_group"] = root(sha)

    seeds = [(sha, features[sha], guilds["guilds"])
             for sha, guilds in registry.items() if features.get(sha)]
    progress("guild design matches", 0, total)
    for index, record in enumerate(records, 1):
        sha = record["sha1"]
        feature = features[sha]
        if feature:
            for seed_sha, seed_feature, links in seeds:
                if sha == seed_sha:
                    continue
                if record["color"] == results[seed_sha]["color"]:
                    distance = color_distance(results[sha]["dominant_rgb"],
                                              results[seed_sha]["dominant_rgb"])
                    if distance <= 0.18:
                        peers = results[sha]["color_peers"]
                        peers.append({"sha1": seed_sha, "distance": distance,
                                      "guilds": [link["tag"] for link in links]})
                        peers.sort(key=lambda peer: (peer["distance"], peer["sha1"]))
                        del peers[3:]
                if record["resolution"] != resolution_by_sha[seed_sha]:
                    continue
                score = design_score(feature, seed_feature)
                if score >= MIN_GUILD_DESIGN:
                    for link in links:
                        add_candidate(results[sha], link["tag"], link["name"],
                                      "matching design", score, seed_sha)
        if index % 100 == 0 or index == total:
            progress("guild design matches", index, total)
    return results


def read_saved_letters():
    saved = {}
    if LETTERS.exists():
        for line in LETTERS.read_text(encoding="utf-8").splitlines():
            if line.strip():
                entry = json.loads(line)
                saved[entry["sha1"]] = entry["letter_candidates"]
    return saved


def normalize_readings(readings):
    grouped = {}
    for reading in readings:
        word = re.sub("[^A-Za-z]", "", reading["text"])
        if not 2 <= len(word) <= 6 or reading["confidence"] < 50:
            continue
        entry = grouped.setdefault(word.casefold(), {"text": word,
                                                       "confidence": 0, "variants": 0})
        entry["confidence"] = max(entry["confidence"], round(reading["confidence"]))
        entry["variants"] += 1
    return sorted(grouped.values(), key=lambda entry: (-entry["variants"],
                                                       -entry["confidence"]))[:10]


def merge_letters(results, saved, prefixes):
    for sha, candidates in saved.items():
        if sha not in results:
            continue
        item = results[sha]
        item["letter_candidates"] = candidates
        for reading in candidates:
            for guild in prefixes.get(reading["text"].casefold(), []):
                add_candidate(item, guild["tag"], guild["name"], "lettering",
                              reading["confidence"] / 100, sha)
                if any(guild["tag"] in peer["guilds"] for peer in item["color_peers"]):
                    add_candidate(item, guild["tag"], guild["name"], "similar palette", 0.6)


def publish(results, saved, prefixes, total):
    merge_letters(results, saved, prefixes)
    ordered = sorted(results.values(), key=lambda item: (item["color"], item["shade"],
                                                        item["dominant_rgb"], item["id"]))
    write_json(RESULTS, {"version": 1, "total": total, "letter_scanned": len(saved),
                         "generated_at": datetime.now(timezone.utc).isoformat(),
                         "notice": "Automatic suggestions only; review lettering and design before accepting guild links.",
                         "capes": ordered})


def ocr_stage(records, results, registry):
    prefixes = defaultdict(list)
    for entry in registry.values():
        for guild in entry["guilds"]:
            if guild not in prefixes[guild["tag"].casefold()]:
                prefixes[guild["tag"].casefold()].append(guild)
    saved = read_saved_letters()
    publish(results, saved, prefixes, len(records))
    progress("lettering", len(saved), len(records), "Automatic results can be opened while this continues")
    with (WORK / "guild-ocr.log").open("a", encoding="utf-8") as errors:
        process = subprocess.Popen(["node", str(ROOT / "scripts" / "guild_ocr_stream.mjs")],
                                   cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=errors, text=True, encoding="utf-8", bufsize=1)
        try:
            for record in records:
                sha = record["sha1"]
                if sha in saved:
                    continue
                readings = []
                if record.get("coverage", 0) > 5:
                    with tempfile.TemporaryDirectory(prefix="cape-sort-") as temporary:
                        try:
                            images = prepare_images(cape_panel(sha), None, Path(temporary))[:6]
                        except (FileNotFoundError, OSError):
                            images = []
                        if images:
                            process.stdin.write(json.dumps({"sha": sha, "files": [str(path) for path in images]}) + "\n")
                            process.stdin.flush()
                            response = process.stdout.readline()
                            if not response:
                                raise RuntimeError("OCR worker stopped unexpectedly; see work/guild-ocr.log")
                            payload = json.loads(response)
                            if payload["sha"] != sha:
                                raise RuntimeError("OCR worker returned a different cape")
                            readings = payload["readings"]
                candidates = normalize_readings(readings)
                with LETTERS.open("a", encoding="utf-8") as output:
                    output.write(json.dumps({"sha1": sha, "letter_candidates": candidates}) + "\n")
                saved[sha] = candidates
                if len(saved) % 25 == 0 or len(saved) == len(records):
                    publish(results, saved, prefixes, len(records))
                    progress("lettering", len(saved), len(records),
                             "Automatic results can be opened while this continues")
        finally:
            if process.stdin:
                process.stdin.close()
            process.wait(timeout=20)
    publish(results, saved, prefixes, len(records))
    progress("complete", len(records), len(records), "Review the suggestions in Guild Cape Sorter")


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    records = json.loads((CATALOG / "capes.json").read_text(encoding="utf-8"))["capes"]
    registry = json.loads((CATALOG / "guild-capes.json").read_text(encoding="utf-8"))["capes"]
    started = time.monotonic()
    try:
        results = design_stage(records, registry)
        ocr_stage(records, results, registry)
    except Exception as error:
        progress("failed", 0, len(records), str(error))
        raise
    print(f"Sorted {len(records)} capes in {(time.monotonic() - started) / 60:.1f} minutes", flush=True)


if __name__ == "__main__":
    main()
