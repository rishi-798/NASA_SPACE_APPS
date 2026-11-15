import os, subprocess, sys
from pathlib import Path

root = Path(r"C:\Users\suhas\.gemini\antigravity\scratch\NASA-APP")
blender_exe = r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
recon_script = root / "scripts" / "blender" / "render_batch_recon.py"
outputs = root / "outputs"

targets = [
    ("Apollo 11 - Measured terrain.blend", "Apollo 11 measured terrain preview.png"),
    ("Apollo 12 - Measured terrain.blend", "Apollo 12 measured terrain preview.png"),
    ("Apollo 14 - Measured terrain.blend", "Apollo 14 measured terrain preview.png"),
    ("Apollo 16 - Measured terrain.blend", "Apollo 16 measured terrain preview.png"),
    ("Apollo 17 - Measured terrain.blend", "Apollo 17 measured terrain preview.png"),
    ("Athena - Measured terrain.blend", "Athena measured terrain preview.png"),
    ("Luna 21 - Measured terrain.blend", "Luna 21 measured terrain preview.png"),
    ("Lunokhod 1 region - Measured terrain.blend", "Lunokhod 1 region measured terrain preview.png"),
    ("Lunokhod 2 - Measured terrain.blend", "Lunokhod 2 measured terrain preview.png"),
    ("Odysseus - Measured terrain.blend", "Odysseus measured terrain preview.png"),
    ("Surveyor 1 - Measured terrain.blend", "Surveyor 1 measured terrain preview.png"),
    ("Surveyor 5 - Measured terrain.blend", "Surveyor 5 measured terrain preview.png"),
    ("Surveyor 6 - Measured terrain.blend", "Surveyor 6 measured terrain preview.png"),
    ("Surveyor 7 - Measured terrain.blend", "Surveyor 7 measured terrain preview.png"),
]

for blend_name, png_name in targets:
    blend_path = outputs / blend_name
    png_path = outputs / png_name
    if not blend_path.is_file():
        print(f"Skipping {blend_name} (file not found)", flush=True)
        continue
    print(f"=== Rendering {blend_name} -> {png_name} ===", flush=True)
    env = os.environ.copy()
    env["RENDER_OUTPUT_PATH"] = str(png_path)
    cmd = [blender_exe, "--factory-startup", "--background", str(blend_path), "--python", str(recon_script)]
    try:
        res = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=90)
        if res.returncode == 0:
            print(f"DONE: {png_name} ({png_path.stat().st_size} bytes)", flush=True)
        else:
            print(f"FAILED {blend_name}: {res.stderr[-300:]}", flush=True)
    except subprocess.TimeoutExpired:
        print(f"TIMEOUT rendering {blend_name}", flush=True)
print("ALL BATCH RECON RENDERS COMPLETE!", flush=True)
