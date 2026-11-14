import pytest
from scripts.download_full_rasters import validate_inventory


def test_release_inventory_requires_complete_ordered_parts():
    valid = {'archive_bytes': 9, 'parts': [
        {'name': 'moon-rasters.zip.part001', 'bytes': 5},
        {'name': 'moon-rasters.zip.part002', 'bytes': 4},
    ]}
    validate_inventory(valid)
    with pytest.raises(ValueError, match='Incomplete'):
        validate_inventory({**valid, 'archive_bytes': 10})
    with pytest.raises(ValueError, match='sequence'):
        validate_inventory({**valid, 'parts': list(reversed(valid['parts']))})
    with pytest.raises(ValueError, match='Incomplete'):
        validate_inventory({'archive_bytes': 0, 'parts': []})
