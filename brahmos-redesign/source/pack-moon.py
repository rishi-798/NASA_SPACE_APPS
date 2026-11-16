"""Pack position/normal pairs, triangles, and lunar maps for offline WebGL use."""

from base64 import b64encode
from json import dumps
from pathlib import Path
from struct import pack
from sys import argv


def encode(values, code):
    binary = pack(f"<{len(values)}{code}", *values)
    return b64encode(binary).decode("ascii")


def jpeg_data(path):
    return "data:image/jpeg;base64," + b64encode(path.read_bytes()).decode("ascii")


mesh, texture, elevation, output = map(Path, argv[1:5])
positions, normals, faces = [], [], []

for line in mesh.read_text(encoding="utf-8").splitlines():
    kind, *data = line.split() or [""]
    if kind == "v":
        positions.append(tuple(map(float, data[:3])))
    elif kind == "vn":
        normals.append(tuple(map(float, data[:3])))
    elif kind == "f":
        parts = [point.split("/") for point in data]
        face = [(int(part[0]) - 1, int(part[2]) - 1) for part in parts]
        for index in range(1, len(face) - 1):
            faces.extend((face[0], face[index], face[index + 1]))

centers = [(min(axis) + max(axis)) / 2 for axis in zip(*positions)]
scale = 2 / max(max(axis) - min(axis) for axis in zip(*positions))
vertices, triangles, index_by_corner = [], [], {}
for corner in faces:
    if corner not in index_by_corner:
        vertex, normal = corner
        index_by_corner[corner] = len(index_by_corner)
        vertices.extend((value - center) * scale for value, center in zip(positions[vertex], centers))
        vertices.extend(normals[normal])
    triangles.append(index_by_corner[corner])

data = {
    "vertices": encode(vertices, "f"),
    "indices": encode(triangles, "H"),
    "texture": jpeg_data(texture),
    "elevation": jpeg_data(elevation),
}
output.write_text("window.brahmosMoonAsset = " + dumps(data) + ";\n", encoding="utf-8")
