"""Download the LOLA 80 S DEM once for reliable on-demand terrain horizons (189 MB).

    python -m scripts.fetch_lola_dem

Saves backend/terrain/dem/LDEM_80S_80MPP_ADJ.TIF (Git-ignored), which on-demand terrain then uses
instead of remote windowed reads. PGDA intermittently answers GDAL's tile requests with HTTP 403;
one ordinary download avoids that. Resumes an interrupted download, checks the size against the
server's Content-Length, and records the SHA-256 in dem-manifest.json.
Source: NASA GSFC PGDA, https://pgda.gsfc.nasa.gov/products/90
"""
import hashlib
import json
import ssl
import urllib.request
from datetime import datetime, timezone

from backend.terrain.on_demand import DEFAULT_LOCAL_DEM, PGDA_DEM_URL


def _context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def main():
    destination = DEFAULT_LOCAL_DEM
    destination.parent.mkdir(parents=True, exist_ok=True)
    head = urllib.request.Request(PGDA_DEM_URL, method="HEAD")
    with urllib.request.urlopen(head, timeout=60, context=_context()) as response:
        expected = int(response.headers["Content-Length"])
    if destination.is_file() and destination.stat().st_size == expected:
        print(f"Already downloaded: {destination.name} ({expected:,} bytes)")
    else:
        partial = destination.with_suffix(".TIF.part")
        start = partial.stat().st_size if partial.exists() else 0
        request = urllib.request.Request(PGDA_DEM_URL, headers={"Range": f"bytes={start}-"} if start else {})
        print(f"Downloading {PGDA_DEM_URL} ({expected / 1e6:.0f} MB){' - resuming' if start else ''}...", flush=True)
        with urllib.request.urlopen(request, timeout=120, context=_context()) as response, \
                partial.open("ab" if start and response.status == 206 else "wb") as output:
            while chunk := response.read(1 << 20):
                output.write(chunk)
        if partial.stat().st_size != expected:
            raise SystemExit(f"Incomplete download ({partial.stat().st_size:,} of {expected:,} bytes); run again to resume.")
        partial.replace(destination)
    digest = hashlib.sha256()
    with destination.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    manifest = destination.parent / "dem-manifest.json"
    manifest.write_text(json.dumps({destination.name: {
        "source_url": PGDA_DEM_URL, "bytes": expected, "sha256": digest.hexdigest(),
        "recorded_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}}, indent=2) + "\n")
    print(f"Ready: {destination} (sha256 {digest.hexdigest()[:16]}...)")


if __name__ == "__main__":
    main()
