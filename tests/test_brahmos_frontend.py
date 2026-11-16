"""Exercise the same static-file handler used by the public Render service."""
import tempfile
import unittest
from pathlib import Path

from starlette.applications import Starlette
from starlette.routing import Mount
from starlette.testclient import TestClient

from backend.frontend import SPAStaticFiles


class BrahmosFrontendTests(unittest.TestCase):
    def test_root_redirect_and_deep_links_preserve_the_requested_tool(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'brahmos').mkdir()
            (root / 'brahmos' / 'index.html').write_text('cinematic home')
            (root / 'index.html').write_text('react application')
            app = Starlette(routes=[Mount('/', SPAStaticFiles(directory=directory, html=True))])
            with TestClient(app) as client:
                response = client.get('/?return=1', follow_redirects=False)
                self.assertEqual(response.status_code, 302)
                self.assertEqual(response.headers['location'], '/brahmos/index.html?return=1')
                self.assertEqual(client.get('/brahmos/index.html').text, 'cinematic home')
                for path in ['/trip', '/explorer', '/missions', '/planner', '/workspace.html?view=trip']:
                    response = client.get(path, follow_redirects=False)
                    self.assertEqual(response.status_code, 200, path)
                    self.assertEqual(response.text, 'react application', path)
                    self.assertNotIn('location', response.headers, path)
                self.assertEqual(client.get('/brahmos/missing.js').status_code, 404)
                self.assertEqual(client.get('/api/missing').status_code, 404)


if __name__ == '__main__':
    unittest.main()
