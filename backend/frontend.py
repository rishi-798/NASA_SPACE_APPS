"""Serve the existing frontend build and its known React Router pages."""

import mimetypes
from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.responses import FileResponse, JSONResponse
from starlette.staticfiles import StaticFiles


# Pre-recorded voice lines: some systems map .m4a to "audio/mp4a-latm", which Safari may refuse.
mimetypes.add_type("audio/mp4", ".m4a")
mimetypes.add_type("audio/mpeg", ".mp3")

DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
PAGES = {".", "explorer", "missions", "timeline", "about", "trip", "discover", "landing", "planner", "phases", "game"}


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        path = path.replace("\\", "/")
        if path == "api" or path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        if not Path(self.directory).is_dir():
            return JSONResponse(
                {"detail": "Frontend not built. Run npm ci and npm run build in frontend/."},
                status_code=503,
            )
        home = Path(self.directory) / "home.html"
        if path in (".", "", "/") and home.is_file():
            return FileResponse(home, headers={"Cache-Control": "no-cache"})
        try:
            response = await super().get_response(path, scope)
            if response.status_code == 200:
                if path.startswith("assets/"):
                    # Vite output filenames include a content hash.
                    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
                elif path.startswith("cesium/") or path.endswith((".webp", ".png", ".jpg", ".glb", ".svg")):
                    response.headers["Cache-Control"] = "public, max-age=86400"
                else:
                    response.headers["Cache-Control"] = "no-cache"
            return response
        except HTTPException as exc:
            if exc.status_code == 404 and path.rstrip("/") in PAGES:
                return FileResponse(Path(self.directory) / "index.html", headers={"Cache-Control": "no-cache"})
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    async def check_config(self):
        # The API also runs before the frontend build exists (Vite development).
        self.config_checked = True
