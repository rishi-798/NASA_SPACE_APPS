# Production Infrastructure & Deployment (`infra/`)

This directory houses the containerization, reverse proxying, and deployment verification harness for Google Cloud Run and containerized environments.

---

### Components

* **`nginx.conf`**: High-performance Nginx reverse-proxy configuration routing ingress requests between static client assets and FastAPI API workers.
* **`serve.py`**: Production container entrypoint. Spawns the Uvicorn FastAPI backend, performs readiness checks against `/health`, and launches Nginx once the service is operational.
* **`check_container.py`**: Automated container verification executed during image build. Validates all frontend SPA routes, SPICE kernel loading, and source elevation manifests.
* **`cloudbuild.yaml`**: Google Cloud Build pipeline specification for building, testing, and pushing container images to Google Artifact Registry.
