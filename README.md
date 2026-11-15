# 🌕 NASA CLPS Lunar Browser & Mission Architect

[![NASA Space Apps](https://img.shields.io/badge/NASA%20Space%20Apps-2026-blue.svg)](https://www.spaceappschallenge.org/)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-brightgreen.svg)](https://brahmos-lunar-browser.onrender.com)
[![JPL NAIF SPICE](https://img.shields.io/badge/JPL%20NAIF%20SPICE-Integrated-orange.svg)](https://naif.jpl.nasa.gov/)
[![Build & Tests](https://github.com/rishi-798/NASA_SPACE_APPS/actions/workflows/verify.yml/badge.svg)](https://github.com/rishi-798/NASA_SPACE_APPS/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-lightgrey.svg)](LICENSE)

> An integrated scientific platform for NASA's **Commercial Lunar Payload Services (CLPS)** and **Artemis** programs. Combines real-time **JPL NAIF SPICE** celestial mechanics, **LOLA** topographic horizon profiling, 3D Earth–Moon orbital trajectory simulation, and high-fidelity lunar landing reconnaissance.

---

### 🚀 Key Modules

| Module | Route | Highlights |
|---|---|---|
| **3D Moon Explorer** | `/explorer` | 1:1 photorealistic surface mesh, dynamic solar shadow casting, and Earth line-of-sight tracking. |
| **Earth–Moon Trip Planner** | `/trip` | Bounded Lambert trajectory solver, 3D Earth departure globe with city lights, and launcher delta-v specs. |
| **Flight Phase Planner** | `/planner` | Multi-phase flight timeline (ascent → TLI → lunar descent) and printable Flight Readiness Dossiers. |
| **CLPS Chronology** | `/missions` · `/timeline` | Interactive flight roadmap across 8 official missions spanning 2024 through 2028. |
| **Offline Asteroid Defense** | `/game` | ServiceWorker-cached retro arcade defense game playable during loss of signal or offline operations. |

---

### ⚡ Quick Start

#### Option 1: 1-Click Launch (Windows)
Double-click **`START-NASA-APP.cmd`** in the repository root.  
It automatically provisions `.venv`, validates SPICE kernels, builds the SQLite grid, and launches **http://127.0.0.1:8000**.

#### Option 2: Cross-Platform CLI
```bash
# 1. Setup Python environment and kernels
python -m venv .venv
source .venv/bin/activate  # Windows: .\.venv\Scripts\activate
pip install -r requirements.txt
python scripts/prepare_moon_catalogue.py

# 2. Build frontend and run
cd frontend && npm install && npm run build && cd ..
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

---

### 🧪 Automated Test Suite

```bash
# Run backend tests (312 pytest suites)
pytest -q

# Run frontend tests (111 node suites)
cd frontend && npm test
```

---

### 📡 NASA Open Data & Tech Stack

* **Celestial Mechanics**: NASA JPL NAIF SPICE (`de440s`, `naif0012`, `moon_pa_de440`) via `SpiceyPy`.
* **Topography & Elevation**: NASA LRO LOLA (720-bin horizon profiling) and LROC Digital Terrain Models.
* **3D Visualizations**: Three.js, CesiumJS, and WebGL with NASA SVS CGI Moon Kit and verified 3D assets.
* **Core Stack**: Python 3.11+ / FastAPI / Uvicorn · React 19 / TypeScript / Vite / Tailwind CSS.

---

### 📚 Documentation Deep Dives

* [Pitch & Presentation Slides](docs/SUBMISSION_PITCH.md)
* [Analysis Methodology & SPICE Validation](docs/ANALYSIS.md)
* [Earth–Moon Trajectory & Lambert Solver](docs/TRANSLUNAR_TRANSFER.md)
* [Meteomatics Weather Gateway](docs/METEOMATICS.md)
* [3D Terrain Architecture & Regolith PBR](docs/LANDER_SURFACE_VIEW.md)
* [Cloud Run & Docker Deployment](docs/CLOUD_RUN.md)
* [Lunar Dataset Specification](docs/MOON_DATASET.md)
