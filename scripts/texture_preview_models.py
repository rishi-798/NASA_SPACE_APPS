"""Texture the 3D measured terrain preview PNGs with authentic lunar regolith and albedo.

Replaces flat, monochromatic clay disk previews with photorealistic lunar surface
textures (Apollo-consistent albedo, fine regolith grain, and 3D relief modulation).
"""
import glob
import os
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUTS_DIR = PROJECT_ROOT / "outputs"
DETAIL_COLOR_PATH = PROJECT_ROOT / "frontend" / "public" / "terrain" / "lunar-detail-color.png"

def texture_preview_images():
    if not DETAIL_COLOR_PATH.is_file():
        print(f"Error: lunar detail color texture not found at {DETAIL_COLOR_PATH}")
        return

    detail = Image.open(DETAIL_COLOR_PATH).convert("RGB")

    previews = list(OUTPUTS_DIR.glob("*preview*.png"))
    print(f"Found {len(previews)} preview images to process in {OUTPUTS_DIR}")

    for p in previews:
        if "_backup" in p.name or "_test" in p.name:
            continue

        try:
            orig = Image.open(p).convert("RGBA")
            w, h = orig.size
            arr = np.array(orig, dtype=np.float32) / 255.0

            # Background color is at the corner (0, 0)
            bg = arr[0, 0, :3]
            diff = np.max(np.abs(arr[:, :, :3] - bg), axis=-1)
            mask = (diff > 0.02).astype(np.float32)

            # Gaussian blur for anti-aliased edge transition
            mask_blur = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
            smooth_mask = np.array(mask_blur, dtype=np.float32)[:, :, np.newaxis] / 255.0

            # Tile the lunar detail texture
            tiled = Image.new("RGB", (w, h))
            for x in range(0, w, detail.width):
                for y in range(0, h, detail.height):
                    tiled.paste(detail, (x, y))
            d_arr = np.array(tiled, dtype=np.float32) / 255.0

            # Shading normalization from the clay render
            # Clay diffuse base is ~0.44 in Blender.
            lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
            shading = (lum / 0.44)[:, :, np.newaxis]
            shading = np.clip(shading, 0.05, 2.3)

            # Apply texture modulated by 3D geometric relief and shadows
            textured = np.clip(d_arr * shading * 1.06, 0.0, 1.0)

            # Deep space stylish backdrop
            space_bg = arr[:, :, :3] * 0.15
            final_rgb = smooth_mask * textured + (1.0 - smooth_mask) * space_bg

            out_img = Image.fromarray((np.clip(final_rgb, 0.0, 1.0) * 255).astype(np.uint8), mode="RGB").convert("RGBA")
            out_img.save(p, compress_level=1)
            print(f"  ✓ Textured: {p.name} ({w}x{h}, {os.path.getsize(p)} bytes)")

        except Exception as e:
            print(f"  ✗ Failed on {p.name}: {e}")

if __name__ == "__main__":
    texture_preview_images()
