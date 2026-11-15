"""Encode responsive WebP delivery assets without replacing their source images.

Build-time utility only. Requires Pillow; not needed to run the packaged app.
"""

from pathlib import Path

from PIL import Image


PUBLIC = Path(__file__).resolve().parent.parent / "frontend" / "public"


def encode(source, destination, widths):
    with Image.open(PUBLIC / source) as original:
        for width in widths:
            image = original.copy()
            if width < original.width:
                image.thumbnail((width, original.height), Image.Resampling.LANCZOS)
            suffix = f"-{width}" if width < original.width else ""
            output = PUBLIC / f"{destination}{suffix}.webp"
            image.save(output, "WEBP", quality=82, method=6)
            print(f"{output.name}: {image.width} x {image.height}, {output.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    encode("lunar-hero.png", "lunar-hero", (1672,))
    encode("lunar-terrain.png", "lunar-terrain", (640, 1000, 1672))
    encode("moon-lroc-2k.jpg", "lunar-color-map", (640, 1280, 2048))
