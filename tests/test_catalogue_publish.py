import gzip
import hashlib
import pytest
from scripts.prepare_moon_catalogue import prepare, restore_csv


def test_restore_verifies_and_preserves_original_bytes(tmp_path):
    original = b"grid_id,grid_type\nMOON-TEST,parent\n"
    compressed = tmp_path / "catalogue.gz"
    compressed.write_bytes(gzip.compress(original))
    destination = tmp_path / "catalogue.csv"
    restore_csv(compressed, destination, hashlib.sha256(original).hexdigest(), len(original))
    assert destination.read_bytes() == original
    assert not destination.with_suffix('.csv.part').exists()
    with pytest.raises(FileExistsError):
        restore_csv(compressed, destination)
    assert destination.read_bytes() == original


def test_invalid_catalogue_never_becomes_usable_csv(tmp_path):
    compressed = tmp_path / "catalogue.gz"
    compressed.write_bytes(gzip.compress(b"wrong"))
    destination = tmp_path / "catalogue.csv"
    with pytest.raises(ValueError, match="checksum/size mismatch"):
        restore_csv(compressed, destination, "0" * 64, 5)
    assert not destination.exists()


def test_existing_index_is_preserved(monkeypatch, tmp_path):
    monkeypatch.delenv('LUNAR_DATASET_DIR', raising=False)
    dataset = tmp_path / 'data' / 'lunar'
    dataset.mkdir(parents=True)
    index = dataset / 'moon-grid-index.sqlite'
    index.write_bytes(b'existing user index')
    prepare(tmp_path)
    assert index.read_bytes() == b'existing user index'
    assert not (dataset / 'site04_1km_grid.csv').exists()


def test_external_dataset_is_never_modified(monkeypatch, tmp_path):
    monkeypatch.setenv('LUNAR_DATASET_DIR', str(tmp_path / 'external'))
    prepare(tmp_path)
    assert list(tmp_path.iterdir()) == []
