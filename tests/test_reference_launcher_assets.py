"""The reference exports retain the distinguishing launcher configurations."""
import json
import struct
from pathlib import Path

import pytest

PUBLIC = Path(__file__).resolve().parents[1] / 'frontend' / 'public'


@pytest.mark.parametrize(('filename', 'component', 'count'), [
    ('lvm3-reference.glb', 'S200 solid booster', 2),
    ('h-iia-202-reference.glb', 'SRB-A solid booster', 2),
    ('long-march-3b-reference.glb', 'Liquid booster', 4),
    ('proton-k-reference.glb', 'First stage outboard fuel tank', 6),
])
def test_launcher_export_has_expected_configuration(filename, component, count):
    data = (PUBLIC / filename).read_bytes()
    magic, version, total = struct.unpack_from('<4sII', data)
    length, chunk_type = struct.unpack_from('<I4s', data, 12)
    assert (magic, version, total, chunk_type) == (b'glTF', 2, len(data), b'JSON')
    model = json.loads(data[20:20 + length])
    names = [node.get('name', '') for node in model['nodes']]
    assert sum(name == component or name.startswith(component + '.') for name in names) == count
    assert model['meshes'] and model['materials']
