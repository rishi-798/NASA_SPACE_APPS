# Keeping the deployed interface current

A healthy `/health` response only proves that the Python server is running. It does not prove that its frontend matches GitHub `main`.

## Render owner checklist

For the existing `brahmos-lunar-browser` service:

1. Use branch `main` and Node `24.13.0` (`NODE_VERSION`).
2. Set the build command to the current command in `render.yaml`:

   ```sh
   pip install -r requirements-linux-lock.txt && python -m scripts.prepare_cloud_runtime && python -m backend.download_kernels && (cd frontend && npm ci --no-audit --no-fund && npm run build)
   ```

   Do not append `|| true`: a failed frontend build must fail the deployment instead of silently serving an older build.
3. Use **Manual Deploy → Clear build cache & deploy**.
4. Verify `/build-info.json` reports the deployed commit (`source_commit`) and build time. A missing marker indicates a build from before this diagnostic was added. Local builds without a CI commit environment variable report `null` rather than guessing a commit.
5. Verify the homepage says **Plan a trip**, navigation has no Timeline entry, and the generated hero/landscape illustrations are absent. Terrain information ends with its regional height range; the Observer plane and Epic/Orbital Overview controls are absent from Trip and analysis.

A repository YAML edit does not by itself change a manually configured service's dashboard settings. The service owner must apply the build settings or sync the Blueprint before deployment. Keep existing backend credentials and terrain environment variables intact.

## Browser caching

HTML navigation now tries the network before using a saved offline page. Activating the new service worker removes the old application cache. Previously visited routes and the application shell remain available offline, but server errors and release metadata are never disguised as a cached successful deployment.

References: [Render deploys](https://render.com/docs/deploys), [Node versions](https://render.com/docs/node-version).
