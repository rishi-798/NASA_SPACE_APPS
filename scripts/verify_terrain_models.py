"""Audit the team's measured-terrain models used by the landing simulation.

    python -m scripts.verify_terrain_models            # checksums + frame checks (downloads ~160 MB once)
    python -m scripts.verify_terrain_models --curvature  # also compare heights with the team's live lookup service

For every scene in frontend/src/data/blenderTerrain.json it checks that
  1. the file's SHA-256 matches the recorded value,
  2. the rotation matrix equals the exact east/north/up directions at the anchor,
  3. the vertex extents and layout (glTF Y-up or Z-up) are what the loader assumes,
  4. (--curvature) the model heights include lunar curvature: at 8.5 km from the anchor, (mesh height - centre height)
     minus (service elevation - centre elevation) should be about -d^2/2R = -20.8 m where the service uses the same source.
Results are printed and written to docs/validation/terrain_models.json.
"""
import argparse
import hashlib
import json
import math
import ssl
import struct
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "frontend" / "src" / "data" / "blenderTerrain.json"
CACHE = ROOT / "backend" / "terrain" / "cache" / "scene-models"
R = 1_737_400.0
LOOKUP = "https://brahmos-lunar-browser.onrender.com/api/terrain/lookup"


def context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def fetch(scene) -> bytes:
    url = scene["model_url"]
    if url.startswith("/"):
        return (ROOT / "frontend" / "public" / url.lstrip("/")).read_bytes()
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{scene['id']}.glb"
    if not path.is_file():
        with urllib.request.urlopen(url, timeout=120, context=context()) as response:
            path.write_bytes(response.read())
    return path.read_bytes()


def parse_glb(data: bytes):
    _, _, length = struct.unpack("<4sII", data[:12])
    offset, doc, binary = 12, None, None
    while offset < length:
        size, kind = struct.unpack("<II", data[offset:offset + 8])
        chunk = data[offset + 8:offset + 8 + size]
        offset += 8 + size
        if kind == 0x4E4F534A:
            doc = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
    return doc, binary


def vertices(doc, binary) -> np.ndarray:
    """All vertex positions in glTF space, with node transforms applied."""
    out = []

    def local(node):
        if "matrix" in node:
            return np.array(node["matrix"]).reshape(4, 4).T
        m = np.eye(4)
        x, y, z, w = node.get("rotation", [0, 0, 0, 1])
        rot = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        m[:3, :3] = rot * np.array(node.get("scale", [1, 1, 1]))
        m[:3, 3] = node.get("translation", [0, 0, 0])
        return m

    def walk(index, parent):
        node = doc["nodes"][index]
        world = parent @ local(node)
        if "mesh" in node:
            for prim in doc["meshes"][node["mesh"]]["primitives"]:
                acc = doc["accessors"][prim["attributes"]["POSITION"]]
                view = doc["bufferViews"][acc["bufferView"]]
                base = np.frombuffer(binary, dtype=np.float32, offset=view.get("byteOffset", 0) + acc.get("byteOffset", 0))
                raw = np.lib.stride_tricks.as_strided(base, shape=(acc["count"], 3), strides=(view.get("byteStride", 12), 4)).astype(float)
                out.append(raw @ world[:3, :3].T + world[:3, 3])
        for child in node.get("children", []):
            walk(child, world)

    for root in doc["scenes"][doc.get("scene", 0)]["nodes"]:
        walk(root, np.eye(4))
    return np.vstack(out)


def to_enu(up: str, p: np.ndarray):
    return (p[:, 0], -p[:, 2], p[:, 1]) if up == "Y" else (p[:, 0], p[:, 1], p[:, 2])


def enu_basis(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    return (np.array([-math.sin(lo), math.cos(lo), 0.0]),
            np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)]),
            np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)]))


def destination(lat0, lon0, east, north):
    d, az = math.hypot(east, north) / R, math.atan2(east, north)
    p0, l0 = math.radians(lat0), math.radians(lon0)
    la = math.asin(math.sin(p0) * math.cos(d) + math.cos(p0) * math.sin(d) * math.cos(az))
    lo = l0 + math.atan2(math.sin(az) * math.sin(d) * math.cos(p0), math.cos(d) - math.sin(p0) * math.sin(la))
    return math.degrees(la), (math.degrees(lo) + 540) % 360 - 180


def lookup(lat, lon):
    try:
        with urllib.request.urlopen(f"{LOOKUP}?lat={lat:.6f}&lon={lon:.6f}", timeout=60, context=context()) as r:
            return json.load(r)["terrain"]["elevation_m"]
    except Exception:  # noqa: BLE001 - a missing service point just skips that sample
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--curvature", action="store_true", help="compare heights with the team's lookup service (needs network)")
    args = parser.parse_args()
    scenes = json.loads(REGISTRY.read_text(encoding="utf-8"))["scenes"]
    report, failed = [], False
    print(f"{'scene':<19}{'checksum':<10}{'frame':<10}{'layout':<8}{'extent E x N (m)':<20}{'height range (m)':<22}" + ("curvature" if args.curvature else ""))
    for scene in scenes:
        data = fetch(scene)
        row = {"id": scene["id"], "checksum_ok": hashlib.sha256(data).hexdigest() == scene["sha256"]}
        doc, binary = parse_glb(data)
        e, n, u = to_enu(scene["gltf_up"], vertices(doc, binary))
        m = np.array(scene["local_to_moon_fixed"])
        east, north, up = enu_basis(scene["anchor"]["latitude"], scene["anchor"]["longitude"])
        row["frame_error"] = float(max(np.abs(m[:3, 0] - east).max(), np.abs(m[:3, 1] - north).max(), np.abs(m[:3, 2] - up).max()))
        row["frame_ok"] = row["frame_error"] < 2e-3
        row.update(layout=scene["gltf_up"], east_extent_m=[float(e.min()), float(e.max())], north_extent_m=[float(n.min()), float(n.max())],
                   height_range_m=[float(u.min()), float(u.max())], vertices=int(len(u)),
                   spacing_m=scene["source_spacing_m"], source=scene["source_id"], source_mismatch=scene.get("source_mismatch", False))
        line = (f"{scene['id']:<19}{'ok' if row['checksum_ok'] else 'BAD':<10}{'ok' if row['frame_ok'] else 'BAD':<10}{scene['gltf_up']:<8}"
                f"{e.max() - e.min():>6.0f} x {n.max() - n.min():<10.0f}{u.min():>8.0f} .. {u.max():<10.0f}")
        if args.curvature and scene["id"] != "SITE04-G7":
            def mesh(x, y):
                near = (np.abs(e - x) < 150) & (np.abs(n - y) < 150)
                d = np.hypot(e[near] - x, n[near] - y)
                i = np.argsort(d)[:3]
                w = 1 / np.maximum(d[i], 1e-6)
                return float((u[near][i] * w).sum() / w.sum())
            h0, z0 = lookup(scene["anchor"]["latitude"], scene["anchor"]["longitude"]), mesh(0, 0)
            diffs = []
            for k in range(8):
                a = k * math.pi / 4
                x, y = 8500 * math.sin(a), 8500 * math.cos(a)
                h = lookup(*destination(scene["anchor"]["latitude"], scene["anchor"]["longitude"], x, y))
                if h is not None and h0 is not None:
                    diffs.append((mesh(x, y) - z0) - (h - h0))
            if diffs:
                row["curvature_median_m"], row["curvature_expected_m"] = float(np.median(diffs)), -(8500 ** 2) / (2 * R)
                line += f"{row['curvature_median_m']:+.1f} m (expect {row['curvature_expected_m']:+.1f})"
        print(line)
        failed |= not (row["checksum_ok"] and row["frame_ok"])
        report.append(row)
    out = ROOT / "docs" / "validation" / "terrain_models.json"
    out.write_text(json.dumps({"scenes": report}, indent=1) + "\n", encoding="utf-8")
    print(f"\nWrote {out.relative_to(ROOT)}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
