"""Scan one cape's color-separated lettering and optionally confirm its guild tag.

Only the explicitly named SHA is processed. OCR is a suggestion, never an
automatic ownership claim; --confirm PREFIX records a visually reviewed tag.
"""

import argparse
import json
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "ui" / "catalog"


def cape_panel(sha):
    source = Image.open(CATALOG / "raw" / f"{sha}.png").convert("RGB")
    scale = source.width // 64
    return source.crop((scale, scale, 11 * scale, 17 * scale))


def regions(panel, specified):
    if specified:
        x, y, width, height = map(int, specified.split(","))
        if x < 0 or y < 0 or width < 1 or height < 1 or x + width > panel.width or y + height > panel.height:
            raise ValueError("Region must fit the cape back panel")
        return [(f"selected-{x}-{y}", panel.crop((x, y, x + width, y + height)))]
    # Guild tags are often in the bottom strip. Try two nearby crops because
    # decorative pixels above the text can confuse OCR on tiny cape textures.
    return [(f"bottom-{height}", panel.crop((0, panel.height - height, panel.width, panel.height)))
            for height in (min(panel.height, max(8, round(panel.height * 0.38))),
                           min(panel.height, max(7, round(panel.height * 0.31))))]


def make_masks(region):
    pixels = list(region.getdata())
    masks = []
    for threshold in (45, 80):
        masks.append((f"dark-{threshold}", [max(rgb) < threshold for rgb in pixels]))
    for threshold in (150, 200):
        masks.append((f"light-{threshold}", [min(rgb) > threshold for rgb in pixels]))
    quantized = region.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    indices = list(quantized.getdata())
    for index, count in Counter(indices).most_common():
        if count >= len(indices) * 0.03:
            masks.append((f"color-{index}", [value == index for value in indices]))
    return masks


def prepare_images(panel, specified, directory):
    paths = []
    for region_name, region in regions(panel, specified):
        for mask_name, bits in make_masks(region):
            ink = sum(bits)
            if not (0.08 * len(bits) <= ink <= 0.72 * len(bits)):
                continue
            image = Image.new("L", region.size, 255)
            image.putdata([0 if bit else 255 for bit in bits])
            bounds = ImageOps.invert(image).getbbox()
            if not bounds or bounds[2] - bounds[0] < region.width * 0.45 or bounds[3] - bounds[1] < 4:
                continue
            image = ImageOps.expand(image.resize((region.width * 12, region.height * 12), Image.Resampling.NEAREST),
                                    border=24, fill=255)
            path = directory / f"{region_name}-{mask_name}.png"
            image.save(path)
            paths.append(path)
    return paths


def scan(sha, specified):
    with tempfile.TemporaryDirectory(prefix="cape-letters-") as temporary:
        images = prepare_images(cape_panel(sha), specified, Path(temporary))
        if not images:
            return []
        command = ["node", str(ROOT / "scripts" / "guild_ocr.mjs"), *(str(path) for path in images)]
        result = subprocess.run(command, cwd=ROOT, check=True, capture_output=True, text=True)
        readings = json.loads(result.stdout)
    groups = {}
    for reading in readings:
        word = re.sub("[^A-Za-z]", "", reading["text"])
        if not 2 <= len(word) <= 6 or reading["confidence"] < 50:
            continue
        key = word.casefold()
        group = groups.setdefault(key, {"text": word, "best_confidence": 0, "variants": 0})
        group["best_confidence"] = max(group["best_confidence"], round(reading["confidence"]))
        group["variants"] += 1
    return sorted(groups.values(), key=lambda group: (-group["variants"], -group["best_confidence"]))[:10]


def guild_for_prefix(prefix):
    if not re.fullmatch(r"[A-Za-z0-9]{2,6}", prefix):
        raise ValueError("Guild prefix must contain 2–6 letters or digits")
    request = urllib.request.Request(
        "https://api.wynncraft.com/v3/guild/prefix/" + urllib.parse.quote(prefix, safe=""),
        headers={"User-Agent": "Prism-Studio/0.1 (reviewed cape lettering)"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        guild = json.load(response)
    if not isinstance(guild, dict) or guild.get("prefix", "").casefold() != prefix.casefold():
        raise ValueError(f"No unique current guild has prefix {prefix}")
    return guild


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sha", help="Full SHA or unique prefix of one catalog cape")
    parser.add_argument("--region", help="Optional back-panel crop x,y,width,height in source pixels")
    parser.add_argument("--confirm", metavar="PREFIX", help="Visually reviewed guild prefix to save")
    args = parser.parse_args()
    catalog_path = CATALOG / "capes.json"
    document = json.loads(catalog_path.read_text(encoding="utf-8"))
    matches = [cape for cape in document["capes"] if cape["sha1"].startswith(args.sha.lower())]
    if len(matches) != 1:
        raise ValueError(f"Expected one cape for {args.sha}, found {len(matches)}")
    cape = matches[0]
    readings = scan(cape["sha1"], args.region)
    print(json.dumps({"cape": cape["id"], "ocr_candidates": readings}, indent=2))
    if args.confirm:
        guild = guild_for_prefix(args.confirm)
        link = {"tag": guild["prefix"], "name": guild["name"], "confidence": "High", "status": "text-reviewed"}
        cape["guilds"] = [other for other in cape["guilds"] if other["tag"].casefold() != args.confirm.casefold()] + [link]
        cape["tags"] = list(dict.fromkeys([*cape["tags"], "guild", guild["prefix"]]))
        cape["letter_scan"] = {"ocr_candidates": readings, "reviewed_prefix": guild["prefix"]}
        temporary = catalog_path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(document, separators=(",", ":")), encoding="utf-8")
        temporary.replace(catalog_path)
        print(f"Recorded possible guild {guild['name']} ({guild['prefix']}) for {cape['id']}; ownership is unverified.")


if __name__ == "__main__":
    main()
