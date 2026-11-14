import json

import pytest

from terrain import streaming


def test_release_file_overrides_mutable_environment_url(monkeypatch, tmp_path):
    pinned = 'https://huggingface.co/datasets/example/moon/resolve/verified-commit'
    release = tmp_path / 'release.json'
    release.write_text(json.dumps({'base_url': pinned}))
    monkeypatch.setenv('LUNAR_COG_RELEASE_FILE', str(release))
    monkeypatch.setenv('LUNAR_COG_BASE_URL', 'https://huggingface.co/datasets/example/moon/resolve/main')
    assert streaming.base_url() == pinned
    source = {'path': 'original.tif', 'cloud_path': 'cogs/test.tif'}
    assert streaming.raster_path(source, tmp_path) == pinned + '/cogs/test.tif'
    assert streaming.ready(source, tmp_path)


def test_streaming_rejects_untrusted_host(monkeypatch):
    monkeypatch.delenv('LUNAR_COG_RELEASE_FILE', raising=False)
    monkeypatch.setenv('LUNAR_COG_BASE_URL', 'https://example.com/terrain')
    with pytest.raises(ValueError, match='Hugging Face'):
        streaming.base_url()
