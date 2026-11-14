FROM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY data/ /build/data/
COPY metadata/ /build/metadata/
COPY scripts/prerender.mjs /build/scripts/prerender.mjs
RUN npm run build

FROM python:3.12-slim-bookworm AS app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080 \
    LUNAR_DATASET_DIR=/app/data/lunar-cloud \
    LUNAR_COG_RELEASE_FILE=/app/data/cloud-release.json \
    GDAL_CACHEMAX=32 \
    CPL_VSIL_CURL_CACHE_SIZE=8388608 \
    GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR \
    GDAL_HTTP_TIMEOUT=20 \
    GDAL_HTTP_MAX_RETRY=2 \
    OPENBLAS_NUM_THREADS=1
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY terrain/ ./terrain/
COPY scripts/ ./scripts/
COPY data/ ./data/
COPY metadata/ ./metadata/
COPY --from=frontend /build/frontend/dist/ ./frontend/dist/
RUN python -m scripts.prepare_cloud_runtime && python -m backend.download_kernels
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
