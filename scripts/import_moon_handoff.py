"""Import only catalogue and metadata from the supplied no-Blender handoff.

Does not download rasters or interpret upstream completion flags as local files.
"""
import argparse
from io import BytesIO
from pathlib import Path
import shutil
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
DATA_FILES = (
    "site04_1km_grid.csv", "moon-dataset.json", "moon-catalogue-counts.json",
    "moon-catalogue-schema.json", "historical-mission-sites.json",
    "blender-grid-registry.json", "terrain-source-registry.json", "RASTER_FILES.json",
)


def copy_member(archive, name, destination):
    if destination.exists():
        raise FileExistsError(f"Preserving existing file: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with archive.open(name) as source, destination.open("xb") as output:
        shutil.copyfileobj(source, output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    with ZipFile(args.archive) as outer:
        member = next(name for name in outer.namelist() if name.endswith("/Team handoff - no Blender.zip"))
        with ZipFile(BytesIO(outer.read(member))) as handoff:
            for name in DATA_FILES:
                copy_member(handoff, name, ROOT / "data" / "lunar" / name)
            # Preserve small shared metadata in the code handoff, not the large CSV.
            for name in DATA_FILES[1:]:
                copy_member(handoff, name, ROOT / "metadata" / "handoff-20261011" / name)
        for name in ("START_HERE.md", "MOON_DATASET.md", "Terrain integration progress.md", "Moon dataset verification.json"):
            member = next(item for item in outer.namelist() if item.endswith("/" + name))
            copy_member(outer, member, ROOT / "docs" / "handoff-20261011" / name)
    print("Imported supplied catalogue and metadata; original rasters and Blender scene are not included.")


if __name__ == "__main__":
    main()
