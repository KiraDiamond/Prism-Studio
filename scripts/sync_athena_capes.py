"""Add new public Athena capes to the bundled catalog and derive filter metadata.

Run with --list-file/--image-dir for an already downloaded export, or without
arguments to fetch the current public Athena list and any missing textures.
Existing catalog records are kept so later hand-curated details survive a sync.
"""

import argparse
import colorsys
import hashlib
import json
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "ui" / "catalog"
LIST_URL = "https://athena.wynntils.com/capes/list"
IMAGE_URL = "https://athena.wynntils.com/capes/get/"


def request_bytes(url):
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Prism-Studio-Catalog/1.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def load_list(path):
    if path:
        document = json.loads(path.read_text(encoding="utf-8-sig"))
        records = document["data"]
        expected = document.get("metadata", {}).get("total", len(records))
    else:
        first = json.loads(request_bytes(LIST_URL + "?page=1"))
        records = list(first["data"])
        expected = first["total"]
        for page in range(2, first["last_page"] + 1):
            time.sleep(0.1)
            records.extend(json.loads(request_bytes(f"{LIST_URL}?page={page}"))["data"])
    hashes = [item["sha"] for item in records]
    if len(records) != expected or len(set(hashes)) != expected:
        raise ValueError(f"Incomplete Athena list: {len(records)} entries, {expected} expected")
    return records


def face(texture, x):
    width, height = texture.size
    if width * 1 != height * 2 or width % 64:
        raise ValueError(f"Unsupported cape dimensions: {width}x{height}")
    scale = width // 64
    return texture.crop((x * scale, scale, (x + 10) * scale, 17 * scale)).resize(
        (80, 128), Image.Resampling.NEAREST
    )


def dhash(image):
    gray = image.convert("L").resize((9, 8), Image.Resampling.BILINEAR)
    pixels = list(gray.getdata())
    bits = 0
    for y in range(8):
        for x in range(8):
            bits = (bits << 1) | (pixels[y * 9 + x] > pixels[y * 9 + x + 1])
    return bits


def palette_and_coverage(back):
    pixels = [(r, g, b) for r, g, b, a in back.getdata() if a >= 128]
    if not pixels:
        return [], 0.0
    buckets = Counter(tuple(min(255, ((value + 16) // 32) * 32) for value in rgb) for rgb in pixels)
    palette = [{"hex": "#" + "".join(f"{v:02X}" for v in rgb), "rgb": list(rgb),
                "percent_visible": round(count * 100 / len(pixels), 2)}
               for rgb, count in buckets.most_common(6)]
    return palette, round(len(pixels) * 100 / (80 * 128), 2)


def classify(texture, back, palette):
    if palette:
        rgb = palette[0]["rgb"]
        visible = [(r, g, b) for r, g, b, a in back.getdata() if a >= 128]
    else:
        visible = [(r, g, b) for r, g, b, a in texture.getdata() if a >= 128]
        rgb = Counter(tuple(min(255, ((v + 16) // 32) * 32) for v in pixel)
                      for pixel in visible).most_common(1)[0][0] if visible else (0, 0, 0)
    hue, saturation, value = colorsys.rgb_to_hsv(*(v / 255 for v in rgb))
    degrees = hue * 360
    if value < 0.14:
        color = "Black"
    elif saturation < 0.16:
        color = "White" if value > 0.88 else "Gray"
    elif degrees < 15 or degrees >= 345:
        color = "Red"
    elif degrees < 35:
        color = "Brown" if value < 0.55 else "Orange"
    elif degrees < 52:
        color = "Brown" if value < 0.4 else "Gold"
    elif degrees < 72:
        color = "Yellow"
    elif degrees < 165:
        color = "Green"
    elif degrees < 200:
        color = "Cyan"
    elif degrees < 255:
        color = "Blue"
    elif degrees < 295:
        color = "Purple"
    else:
        color = "Pink"
    light = sum((0.2126 * r + 0.7152 * g + 0.0722 * b) for r, g, b in visible) / (255 * len(visible)) if visible else 0
    if light < 0.12:
        shade = "Black"
    elif light < 0.25:
        shade = "Very Dark"
    elif light < 0.4:
        shade = "Dark"
    elif light < 0.65:
        shade = "Medium"
    elif light < 0.8:
        shade = "Light"
    elif light < 0.92:
        shade = "Very Light"
    else:
        shade = "White"
    return color, shade


def validated_texture(content, item):
    sha = item["sha"]
    # Athena's identifier names the cape, but GET may re-encode its PNG bytes.
    if not isinstance(sha, str) or len(sha) != 40 or any(c not in "0123456789abcdef" for c in sha):
        raise ValueError(f"Invalid Athena identifier: {sha}")
    image = Image.open(BytesIO(content))
    if image.format != "PNG" or image.size != (item["width"], item["height"]):
        raise ValueError(f"PNG format or dimensions mismatch for {sha}")
    return image.convert("RGBA")


def raw_texture(item, image_dir):
    sha = item["sha"]
    target = CATALOG / "raw" / f"{sha}.png"
    if target.exists():
        content = target.read_bytes()
    elif image_dir and (image_dir / f"{sha}.png").exists():
        content = (image_dir / f"{sha}.png").read_bytes()
    elif image_dir:
        raise FileNotFoundError(f"Missing downloaded image {sha}")
    else:
        time.sleep(0.3)
        content = request_bytes(IMAGE_URL + sha)
    image = validated_texture(content, item)
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    return image


def index_existing(records):
    exact = {}
    candidates = defaultdict(list)
    for record in records:
        sha = record["sha1"]
        image = Image.open(CATALOG / "raw" / f"{sha}.png").convert("RGBA")
        back, front = face(image, 1), face(image, 12)
        group = record.get("repeat_of") or sha
        key = hashlib.sha256(back.tobytes() + front.tobytes()).digest()
        exact.setdefault(key, group)
        blank = len(back.getcolors(maxcolors=2) or []) == 1 and len(front.getcolors(maxcolors=2) or []) == 1
        if not blank:
            family = (record["color"], record["shade"], hashlib.sha256(front.tobytes()).digest())
            candidates[family].append((group, back, dhash(back)))
    return exact, candidates


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list-file", type=Path, help="Saved Athena list JSON; otherwise fetch the current list")
    parser.add_argument("--image-dir", type=Path, help="Already downloaded SHA.png files; otherwise fetch missing images")
    args = parser.parse_args()
    items = load_list(args.list_file)
    catalog_path = CATALOG / "capes.json"
    document = json.loads(catalog_path.read_text(encoding="utf-8"))
    existing = document["capes"]
    by_sha = {record["sha1"]: record for record in existing}
    exact, candidates = index_existing(existing)
    added = 0
    for item in items:
        sha = item["sha"]
        if sha in by_sha:
            if item["animated"] and "animated" not in by_sha[sha]["tags"]:
                by_sha[sha]["tags"].append("animated")
            by_sha[sha]["animated"] = bool(item["animated"])
            continue
        texture = raw_texture(item, args.image_dir)
        back, front = face(texture, 1), face(texture, 12)
        palette, coverage = palette_and_coverage(back)
        color, shade = classify(texture, back, palette)
        size = f'{item["width"]}x{item["height"]}'
        tags = [size, color.lower(), shade.lower().replace(" ", "-")]
        if item["animated"]:
            tags.append("animated")
        if coverage == 0:
            tags.append("transparent-back")
        back_path = CATALOG / "back" / f"{sha}.png"
        back.save(back_path)
        back_key = hashlib.sha256(back.tobytes() + front.tobytes()).digest()
        blank = len(back.getcolors(maxcolors=2) or []) == 1 and len(front.getcolors(maxcolors=2) or []) == 1
        repeat_of = exact.get(back_key) if not blank else None
        family = (color, shade, hashlib.sha256(front.tobytes()).digest())
        hash_value = dhash(back)
        if repeat_of is None and not blank:
            for representative, other, other_hash in candidates[family]:
                if (hash_value ^ other_hash).bit_count() > 2:
                    continue
                difference = ImageStat.Stat(ImageChops.difference(back, other).convert("L")).mean[0] / 255
                if difference <= 0.02:
                    repeat_of = representative
                    break
        if repeat_of is None:
            repeat_of = sha
            if not blank:
                candidates[family].append((sha, back, hash_value))
        if not blank:
            exact.setdefault(back_key, repeat_of)
        record = {"sha1": sha, "id": "ATH-" + sha[:12].upper(), "resolution": size,
                  "color": color, "shade": shade, "palette": palette, "coverage": coverage,
                  "guilds": [], "tags": tags, "repeat_of": repeat_of if repeat_of != sha else None,
                  "animated": bool(item["animated"])}
        existing.append(record)
        by_sha[sha] = record
        added += 1
        if added % 250 == 0:
            print(f"Classified {added} new capes", flush=True)
    document["generated_at"] = datetime.now(timezone.utc).isoformat()
    document["source"] = "Wynntils Athena public cape list; original 2,143 rich records retain their supplied metadata."
    temporary_path = catalog_path.with_suffix(".json.tmp")
    temporary_path.write_text(json.dumps(document, separators=(",", ":")), encoding="utf-8")
    temporary_path.replace(catalog_path)
    print(f"Catalog now has {len(existing)} capes ({added} added)")


if __name__ == "__main__":
    main()
