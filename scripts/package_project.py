"""Package the current site + backend without machine-specific dependencies."""

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent.parent
EXCLUDED = {"node_modules", "__pycache__", ".pytest_cache", ".git", ".venv", ".prerender"}
FOLDERS = ("backend", "frontend", "data", "docs", "tests", "scripts", "terrain", "metadata")
FILES = ("README.md", "START-NASA-APP.cmd", "requirements.txt", "requirements-lock.txt", ".gitignore")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="NASA-APP.zip", help="ZIP filename in the project root")
    filename = parser.parse_args().output
    if Path(filename).name != filename or not filename.lower().endswith(".zip"):
        raise SystemExit("Output must be a ZIP filename, not a directory or path.")
    destination = ROOT / filename
    if destination.exists():
        raise SystemExit(f"{filename} already exists. Choose another output name to preserve it.")
    with ZipFile(destination, "w", compression=ZIP_DEFLATED, compresslevel=6) as archive:
        for name in FILES:
            archive.write(ROOT / name, "NASA-APP/" + name)
        for folder in FOLDERS:
            for path in sorted((ROOT / folder).rglob("*")):
                relative = path.relative_to(ROOT)
                if not path.is_file() or any(part in EXCLUDED for part in relative.parts):
                    continue
                if path.name.endswith((".part", ".pyc")) or path.name == ".env" or path.name.startswith(".env.") and path.name != ".env.example":
                    continue
                archive.write(path, "NASA-APP/" + relative.as_posix())
    with ZipFile(destination) as archive:
        bad = archive.testzip()
        if bad:
            raise SystemExit(f"Corrupt ZIP member: {bad}")
        entries = archive.namelist()
        for required in ("NASA-APP/backend/app.py", "NASA-APP/frontend/dist/index.html", "NASA-APP/frontend/dist/home.html", "NASA-APP/START-NASA-APP.cmd",
                         "NASA-APP/frontend/dist/ares-i-a.glb", "NASA-APP/frontend/dist/ares-i-b.glb", "NASA-APP/frontend/dist/sls-block-1.glb",
                         "NASA-APP/frontend/dist/draco/draco_decoder.wasm", "NASA-APP/frontend/dist/draco/draco_wasm_wrapper.js",
                         "NASA-APP/data/lunar/moon-dataset.json", "NASA-APP/data/lunar/site04_1km_grid.csv", "NASA-APP/data/lunar/moon-grid-index.sqlite"):
            assert required in entries, f"Missing {required}"
        print(f"Created {destination}: {len(entries)} files, {destination.stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
