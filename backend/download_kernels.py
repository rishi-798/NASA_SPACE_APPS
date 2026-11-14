"""Install the official NAIF kernels required by this project's calculations.

    python -m backend.download_kernels

Writes backend/kernels/manifest.json with each file's source URL, size and
SHA-256 so the API can verify integrity and report exact provenance.
"""

import json
import ssl
from datetime import datetime, timezone
from urllib.request import urlopen

from backend.spice_kernels import MANIFEST_NAME, kernel_directory, load_spice_kernels, sha256_file


BASE = "https://naif.jpl.nasa.gov/pub/naif/"
KERNEL_URLS = {
    "naif0012.tls": BASE + "generic_kernels/lsk/naif0012.tls",
    "de440s.bsp": BASE + "generic_kernels/spk/planets/de440s.bsp",
    "pck00011.tpc": BASE + "generic_kernels/pck/pck00011.tpc",
    "moon_pa_de440_200625.bpc": BASE + "generic_kernels/pck/moon_pa_de440_200625.bpc",
    "moon_de440_220930.tf": BASE + "pds/pds4/clps/clps_spice/spice_kernels/fk/moon_de440_220930.tf",
}


def _ssl_context():
    """Use certifi's CA bundle when present (python.org macOS builds ship without one)."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def main():
    directory = kernel_directory()
    directory.mkdir(parents=True, exist_ok=True)
    manifest_path = directory / MANIFEST_NAME
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
    for name, url in KERNEL_URLS.items():
        destination = directory / name
        if destination.is_file():
            print(f"Already installed: {name}", flush=True)
        else:
            print(f"Downloading {name} from NAIF...", flush=True)
            temporary = directory / (name + ".part")
            try:
                with urlopen(url, timeout=120, context=_ssl_context()) as response, temporary.open("wb") as output:
                    while chunk := response.read(1024 * 1024):
                        output.write(chunk)
                temporary.replace(destination)
            finally:
                temporary.unlink(missing_ok=True)
        digest = sha256_file(destination)
        if manifest.get(name, {}).get("sha256") != digest:
            manifest[name] = {
                "source_url": url,
                "bytes": destination.stat().st_size,
                "sha256": digest,
                "recorded_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    load_spice_kernels()
    print("All SPICE kernels loaded and recorded in kernels/manifest.json.")


if __name__ == "__main__":
    main()
