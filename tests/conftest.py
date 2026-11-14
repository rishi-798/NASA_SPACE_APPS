"""Shared fixtures for the new analysis/comparison tests.

SYNTHETIC FIXTURES: profiles produced by ``synthetic_profile`` carry
``"synthetic": true`` and live only in pytest temp directories. The production
loader refuses them unless ALLOW_SYNTHETIC_TERRAIN=1, which only tests set.
"""
import json
import shutil
from pathlib import Path

import pytest

from backend import analysis
from backend.spice_kernels import KERNEL_FILES, kernel_directory
from backend.terrain import horizon

KERNELS_AVAILABLE = all((kernel_directory() / name).is_file() for name in KERNEL_FILES)
needs_kernels = pytest.mark.skipif(not KERNELS_AVAILABLE, reason="run python -m backend.download_kernels")
REAL_PROFILES = Path(horizon.__file__).resolve().parent / "profiles"
ATHENA = {"id": "athena-im2", "latitude": -84.79, "longitude": 29.20}


def synthetic_profile(horizon_deg: float, step: float = 0.5) -> dict:
    """SYNTHETIC constant-horizon profile for Athena's coordinates. Test use only."""
    return {
        "synthetic": True,
        "site_id": ATHENA["id"], "latitude": ATHENA["latitude"], "longitude": ATHENA["longitude"],
        "source": "https://example.invalid/SYNTHETIC-TEST-FIXTURE", "source_frame": "MOON_ME_DE421",
        "datum_radius_m": 1737400.0, "max_distance_m": 40000.0, "min_distance_m": 160,
        "azimuth_step": step, "observer_height_m": 2.0, "pixel_resolution_m": 80.0,
        "horizon": [float(horizon_deg)] * int(360 / step),
    }


@pytest.fixture(autouse=True)
def _fresh_cache():
    analysis.CACHE.clear()
    yield
    analysis.CACHE.clear()


@pytest.fixture
def profile_dir(tmp_path, monkeypatch):
    """A temp copy of the real profile directory that tests may delete/corrupt/replace."""
    directory = tmp_path / "profiles"
    shutil.copytree(REAL_PROFILES, directory)
    monkeypatch.setattr(horizon, "PROFILE_DIR", directory)
    return directory


def write_athena_profile(directory: Path, content) -> None:
    path = directory / "athena-im2.json"
    path.write_bytes(content if isinstance(content, bytes) else json.dumps(content).encode())
