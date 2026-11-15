"""Fail the container build if production routes, kernels or manifest are missing."""
from pathlib import Path
import json
import subprocess
from fastapi.testclient import TestClient
from backend.app import app
from backend.spice_kernels import load_spice_kernels
from backend.calculations.sun_earth import calculate_visibility

config = Path('/tmp/nginx-check.conf')
config.write_text(Path('/app/nginx.conf').read_text().replace('__INGRESS_PORT__', '8080'))
subprocess.run(['nginx', '-t', '-c', str(config)], check=True)
client = TestClient(app)
for route in ('/', '/explorer', '/trip', '/discover', '/health', '/api/discover/status'):
    assert client.get(route).status_code == 200, route
assert client.get('/assets/missing.js').status_code == 404
assert list(Path('/app/frontend/dist/assets').glob('DiscoverPage*-*.js'))
manifest = json.loads(Path('/app/data/lunar-cloud/moon-dataset.json').read_text())
assert sum(source.get('role') == 'elevation' for source in manifest['sources']) == 41
load_spice_kernels()
position = calculate_visibility(0, 0, '2026-11-14T12:00:00Z')
assert 0 <= position['sun']['azimuth'] < 360
print('Container verified: nginx, lunar/discovery routes, 41 sources and real SPICE calculation.', flush=True)
