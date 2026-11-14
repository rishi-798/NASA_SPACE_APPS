"""SPICE kernel loading, integrity and provenance.

The CSPICE kernel pool is process-global and not thread-safe: every SPICE call
in this project runs under ``SPICE_LOCK``. Kernels are loaded lazily on first
use (unchanged behaviour) and can be verified against ``kernels/manifest.json``
(written by ``python -m backend.download_kernels``).
"""
import hashlib
import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

import spiceypy
from spiceypy.utils.exceptions import SpiceyError


log = logging.getLogger("backend.spice")

SPICE_LOCK = RLock()
KERNEL_FILES = (
    "naif0012.tls",
    "de440s.bsp",
    "pck00011.tpc",
    "moon_pa_de440_200625.bpc",
    "moon_de440_220930.tf",
)
KERNEL_ROLES = {
    "naif0012.tls": "Leap seconds (UTC to TDB)",
    "de440s.bsp": "DE440 short planetary ephemeris: Sun, Earth, Moon positions",
    "pck00011.tpc": "Body constants incl. Moon radii (1737.4 km sphere)",
    "moon_pa_de440_200625.bpc": "High-accuracy DE440 lunar orientation (MOON_PA_DE440)",
    "moon_de440_220930.tf": "Lunar frames: MOON_ME = MOON_ME_DE440_ME421",
}
MANIFEST_NAME = "manifest.json"
MOON_PA_DE440_FRAME_ID = 31008
_loaded_paths: set[Path] = set()
_verified: dict[Path, tuple[int, int]] = {}


def spice_code(exc: Exception) -> str:
    """Only the short SPICE error code, e.g. SPICE(SPKINSUFFDATA); never free text that may hold paths."""
    match = re.search(r"SPICE\([A-Z0-9_]+\)", str(getattr(exc, "short", "")) or "")
    return match.group(0) if match else "SPICE error"


class KernelError(RuntimeError):
    """Kernels missing, corrupt or unloadable. Messages are safe to show users (no local paths)."""


def kernel_directory() -> Path:
    configured = os.environ.get("SPICE_KERNELS_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parent / "kernels"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_manifest(directory: Path | None = None) -> dict:
    path = (directory or kernel_directory()) / MANIFEST_NAME
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise KernelError("kernels/manifest.json is unreadable; re-run python -m backend.download_kernels") from exc


def _verify(path: Path, manifest: dict) -> None:
    """Check a kernel against the manifest SHA-256 once per (mtime, size)."""
    stat = path.stat()
    stamp = (stat.st_mtime_ns, stat.st_size)
    if _verified.get(path) == stamp:
        return
    expected = manifest.get(path.name, {}).get("sha256")
    if expected and sha256_file(path) != expected:
        log.error("Kernel %s does not match manifest SHA-256", path)
        raise KernelError(
            f"SPICE kernel {path.name} does not match its recorded SHA-256 (corrupt or replaced). "
            "Re-run python -m backend.download_kernels."
        )
    _verified[path] = stamp


def load_spice_kernels() -> None:
    directory = kernel_directory()
    paths = [directory / filename for filename in KERNEL_FILES]
    missing = [path.name for path in paths if not path.is_file()]
    if missing:
        names = ", ".join(missing)
        log.error("Missing SPICE kernels in %s: %s", directory, names)
        raise KernelError(
            f"Missing SPICE kernels: {names}. Run python -m backend.download_kernels "
            "(see backend/kernels/README.md)."
        )

    with SPICE_LOCK:
        manifest = read_manifest(directory)
        for path in paths:
            resolved_path = path.resolve()
            _verify(resolved_path, manifest)
            if resolved_path in _loaded_paths:
                continue
            try:
                spiceypy.furnsh(str(resolved_path))
            except SpiceyError as exc:
                log.error("Could not load kernel %s: %s", resolved_path, exc)
                raise KernelError(f"Could not load SPICE kernel {path.name} ({spice_code(exc)}).") from exc
            _loaded_paths.add(resolved_path)


def _et_to_utc(et: float) -> datetime:
    text = spiceypy.et2utc(et, "ISOC", 0)
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


_coverage_cache: dict[tuple, tuple[datetime, datetime]] = {}


def coverage() -> tuple[datetime, datetime]:
    """UTC interval covered by the ephemeris (Sun, Earth, Moon) AND lunar orientation, minus 1 day margins."""
    load_spice_kernels()
    directory = kernel_directory()
    spk, bpc = directory / "de440s.bsp", directory / "moon_pa_de440_200625.bpc"
    key = (str(spk), spk.stat().st_mtime_ns, str(bpc), bpc.stat().st_mtime_ns)
    if key in _coverage_cache:
        return _coverage_cache[key]
    with SPICE_LOCK:
        low, high = float("-inf"), float("inf")
        for body in (10, 399, 301):
            window = spiceypy.spkcov(str(spk), body)
            low = max(low, spiceypy.wnfetd(window, 0)[0])
            high = min(high, spiceypy.wnfetd(window, spiceypy.wncard(window) - 1)[1])
        window = spiceypy.pckcov(str(bpc), MOON_PA_DE440_FRAME_ID)
        low = max(low, spiceypy.wnfetd(window, 0)[0])
        high = min(high, spiceypy.wnfetd(window, spiceypy.wncard(window) - 1)[1])
        result = (_et_to_utc(low + 86400), _et_to_utc(high - 86400))
    _coverage_cache[key] = result
    return result


def kernel_provenance() -> dict:
    """Filenames, roles, sizes, hashes and source URLs. Never exposes local paths."""
    directory = kernel_directory()
    try:
        manifest = read_manifest(directory)
    except KernelError:
        manifest = {}
    files = []
    for name in KERNEL_FILES:
        path = directory / name
        entry = manifest.get(name, {})
        files.append({
            "filename": name,
            "role": KERNEL_ROLES[name],
            "present": path.is_file(),
            "bytes": path.stat().st_size if path.is_file() else None,
            "sha256": entry.get("sha256"),
            "source_url": entry.get("source_url"),
            "integrity": "verified against manifest" if entry.get("sha256") else "no manifest entry (unverified)",
        })
    return {
        "files": files,
        "spiceypy_version": spiceypy.__version__,
        "cspice_toolkit": spiceypy.tkvrsn("TOOLKIT"),
    }


def kernel_fingerprint() -> str:
    """Changes whenever any kernel file changes; used in cache keys."""
    directory = kernel_directory()
    parts = []
    for name in KERNEL_FILES:
        path = directory / name
        stat = path.stat() if path.is_file() else None
        parts.append(f"{name}:{stat.st_size if stat else '-'}:{stat.st_mtime_ns if stat else '-'}")
    return hashlib.sha256("|".join([str(directory)] + parts).encode()).hexdigest()[:16]


def kernel_status() -> dict:
    """Can calculations run right now? Loads kernels and performs one real SPICE query."""
    try:
        load_spice_kernels()
        with SPICE_LOCK:
            et = spiceypy.utc2et("2026-01-01T00:00:00")
            spiceypy.pxform("MOON_ME", "J2000", et)
            spiceypy.spkpos("SUN", et, "J2000", "NONE", "MOON")
        start, end = coverage()
        return {"available": True, "reason": None,
                "coverage_start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "coverage_end": end.strftime("%Y-%m-%dT%H:%M:%SZ")}
    except KernelError as exc:
        return {"available": False, "reason": str(exc), "coverage_start": None, "coverage_end": None}
    except SpiceyError as exc:
        log.exception("SPICE self-check failed")
        return {"available": False, "reason": f"SPICE self-check failed ({spice_code(exc)}).",
                "coverage_start": None, "coverage_end": None}
