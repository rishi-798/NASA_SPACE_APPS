# Combined lunar and discovery service — 2026-11-14.
FROM node:24-bookworm-slim AS web
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY brahmos-redesign/ /build/brahmos-redesign/
COPY data/ /build/data/
COPY metadata/ /build/metadata/
COPY scripts/prerender.mjs /build/scripts/prerender.mjs
RUN npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PORT=8080 \
    LUNAR_DATASET_DIR=/app/data/lunar-cloud \
    LUNAR_COG_RELEASE_FILE=/app/data/cloud-release.json \
    GDAL_CACHEMAX=32 CPL_VSIL_CURL_CACHE_SIZE=8388608 \
    GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR GDAL_HTTP_TIMEOUT=20 \
    GDAL_HTTP_MAX_RETRY=2 OPENBLAS_NUM_THREADS=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends nginx libexpat1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements-linux-lock.txt ./
RUN pip install --no-cache-dir -r requirements-linux-lock.txt && pip check
COPY backend/ ./backend/
COPY terrain/ ./terrain/
COPY data/ ./data/
COPY metadata/ ./metadata/
COPY scripts/prepare_cloud_runtime.py ./scripts/prepare_cloud_runtime.py
COPY infra/ ./infra/
COPY infra/nginx.conf ./nginx.conf
COPY --from=web /build/frontend/dist/ ./frontend/dist/
RUN python -m scripts.prepare_cloud_runtime && python -m backend.download_kernels
EXPOSE 8080
CMD ["python", "/app/infra/serve.py"]
