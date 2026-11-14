"""Restore the bundled compressed CSV and build its local, Git-ignored index.

No raster downloads, terrain synthesis, or external dataset modification.
"""
import argparse
import gzip
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CSV_SHA256 = "2dbd8270497b998f42ab8bbbb8f7a7898de6b470229d8834eb68c3683c2bbc4f"
CSV_BYTES = 264208878
METADATA = (
    "moon-dataset.json", "moon-catalogue-counts.json", "moon-catalogue-schema.json",
    "historical-mission-sites.json", "blender-grid-registry.json",
    "terrain-source-registry.json", "RASTER_FILES.json",
)


def restore_csv(source, destination, expected_hash=CSV_SHA256, expected_bytes=CSV_BYTES):
    """Verify the original content before publishing a new CSV; never overwrite."""
    if destination.exists():
        raise FileExistsError(f"Preserving existing CSV: {destination}")
    temporary = destination.with_suffix(".csv.part")
    digest = hashlib.sha256()
    size = 0
    with gzip.open(source, "rb") as compressed, temporary.open("xb") as output:
        while chunk := compressed.read(1024 * 1024):
            size += len(chunk)
            if size > expected_bytes:
                raise ValueError("Catalogue exceeds its expected original size")
            digest.update(chunk)
            output.write(chunk)
    if size != expected_bytes or digest.hexdigest() != expected_hash:
        raise ValueError(f"Catalogue checksum/size mismatch; inspect {temporary}")
    # Path.rename on Windows refuses an existing destination.
    if destination.exists():
        raise FileExistsError(f"Preserving existing CSV: {destination}")
    temporary.rename(destination)


def prepare(root=ROOT):
    if os.environ.get("LUNAR_DATASET_DIR"):
        print("External LUNAR_DATASET_DIR selected; preserving it unchanged.")
        return
    dataset = root / "data" / "lunar"
    if (dataset / "moon-grid-index.sqlite").is_file():
        print("Existing Moon catalogue index retained.")
        return
    dataset.mkdir(parents=True, exist_ok=True)
    for name in METADATA:
        destination = dataset / name
        if not destination.exists():
            with (root / "metadata" / "handoff-20261011" / name).open("rb") as source, destination.open("xb") as output:
                shutil.copyfileobj(source, output)
    csv_path = dataset / "site04_1km_grid.csv"
    if not csv_path.exists():
        print("Restoring supplied Moon catalogue CSV (264 MB)…", flush=True)
        restore_csv(root / "data" / "catalogue" / "site04_1km_grid.csv.gz", csv_path)
    print("Building local Moon catalogue index (about 1.6 GB)…", flush=True)
    subprocess.run([sys.executable, str(root / "scripts" / "build_moon_index.py"),
                    "--dataset-dir", str(dataset)], check=True)


def pack(root=ROOT):
    source = root / "data" / "lunar" / "site04_1km_grid.csv"
    with source.open("rb") as original:
        source_hash = hashlib.file_digest(original, "sha256").hexdigest()
    if source.stat().st_size != CSV_BYTES or source_hash != CSV_SHA256:
        raise ValueError("Original handoff CSV checksum/size mismatch")
    destination = root / "data" / "catalogue" / "site04_1km_grid.csv.gz"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with source.open("rb") as original, destination.open("xb") as output:
        with gzip.GzipFile(filename="site04_1km_grid.csv", mode="wb", fileobj=output, compresslevel=6, mtime=0) as compressed:
            shutil.copyfileobj(original, compressed)
    if destination.stat().st_size >= 100 * 1024 * 1024:
        raise ValueError("Compressed catalogue exceeds the GitHub file-size limit")
    print(f"Packed {destination}: {destination.stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pack", action="store_true", help="Create a new compressed copy for publishing")
    args = parser.parse_args()
    pack() if args.pack else prepare()
