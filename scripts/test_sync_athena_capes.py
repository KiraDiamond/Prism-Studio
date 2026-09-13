import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

from PIL import Image

import sync_athena_capes as catalog


class CatalogSyncTests(unittest.TestCase):
    def test_back_geometry_and_visibility(self):
        texture = Image.new("RGBA", (128, 64), (0, 0, 0, 0))
        texture.paste((255, 0, 0, 255), (2, 2, 22, 34))
        back = catalog.face(texture, 1)
        self.assertEqual(back.size, (80, 128))
        palette, coverage = catalog.palette_and_coverage(back)
        self.assertEqual(coverage, 100)
        self.assertEqual(palette[0]["hex"], "#FF0000")
        self.assertEqual(catalog.palette_and_coverage(catalog.face(texture, 12))[1], 0)

    def test_athena_id_does_not_have_to_hash_to_served_png_bytes(self):
        image = Image.new("RGBA", (128, 64), (255, 0, 0, 255))
        data = BytesIO()
        image.save(data, format="PNG")
        decoded, source_format, frames = catalog.validated_texture(data.getvalue(), {
            "sha": "a" * 40, "width": 128, "height": 64,
        })
        self.assertEqual(decoded.size, (128, 64))
        self.assertEqual((source_format, frames), ("PNG", 1))
        with self.assertRaises(ValueError):
            catalog.validated_texture(data.getvalue(), {
                "sha": "a" * 40, "width": 64, "height": 32,
            })

    def test_animated_sheet_uses_first_frame_for_preview(self):
        texture = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        texture.paste((0, 255, 0, 255), (2, 2, 22, 34))
        texture.paste((255, 0, 0, 255), (2, 66, 22, 98))
        self.assertEqual(catalog.face(texture, 1).getpixel((0, 0)), (0, 255, 0, 255))

    def test_gif_source_is_recognized(self):
        image = Image.new("RGB", (128, 64), "red")
        data = BytesIO()
        image.save(data, format="GIF", save_all=True, append_images=[Image.new("RGB", (128, 64), "blue")])
        _, source_format, frames = catalog.validated_texture(data.getvalue(), {
            "sha": "b" * 40, "width": 128, "height": 64,
        })
        self.assertEqual((source_format, frames), ("GIF", 2))

    def test_incomplete_list_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "list.json"
            path.write_text(json.dumps({"metadata": {"total": 2}, "data": [
                {"sha": "a" * 40, "width": 128, "height": 64, "animated": False},
            ]}), encoding="utf-8")
            with self.assertRaises(ValueError):
                catalog.load_list(path)


if __name__ == "__main__":
    unittest.main()
