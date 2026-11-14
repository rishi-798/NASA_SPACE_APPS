# CLPS Lunar Browser & Mission Architect

For the updated analysis API, methodology, setup, and validation, see [Analysis documentation](docs/ANALYSIS.md).
### NASA Space Apps Challenge

[![NASA Space Apps](https://img.shields.io/badge/NASA%20Space%20Apps-2026-blue.svg)](https://www.spaceappschallenge.org/)
[![NAIF SPICE](https://img.shields.io/badge/JPL%20NAIF%20SPICE-Integrated-orange.svg)](https://naif.jpl.nasa.gov/naif/)
[![LOLA Topography](https://img.shields.io/badge/LRO%20LOLA-Topography%20720--bin-green.svg)](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/)
[![Build & Tests](https://img.shields.io/badge/Tests-94%20Passed%20(85%20py%20%2B%209%20node)-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)]()

> An integrated scientific platform for NASA's **Commercial Lunar Payload Services (CLPS)** and **Artemis** missions, combining real-time JPL NAIF SPICE celestial mechanics, LOLA topographic horizon profiling, 3D orbital trajectory visualization, and lunar surface landing analysis.

---

## 🌌 The Challenge & Vision

Landing and operating payloads near the **lunar South Pole** presents extreme physical and operational bottlenecks:
* **Grazing Solar Angles**: The Sun skims the horizon at 1°–3° elevation, causing crater rims to cast shadows extending dozens of kilometers.
* **Low Earth Visibility**: Direct-to-Earth (DTE) communication lines-of-sight are frequently occulted by undulating topography, creating extended communications blackouts.
* **Extreme Thermal Cycling**: Landers without radioisotope heater units (RHUs) rely entirely on uninterrupted solar arrays to prevent fatal component freezing.

**CLPS Lunar Browser** solves this by providing scientists, mission planners, and the public with an open, high-fidelity platform to simulate and verify landing conditions across arbitrary lunar coordinates and planned CLPS landing zones before spacecraft touchdown.

---

## 🚀 Key Innovations & Features

### 1. Real-Time JPL NAIF SPICE Visibility Engine
* Computes exact geometric Sun and Earth azimuth and elevation vectors in the official Moon Mean Earth/Polar Axis reference frame (`MOON_ME`).
* Loads official JPL kernels (`de440s.bsp`, `naif0012.tls`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `moon_de440_220930.tf`) to handle planetary body positions, physical librations, and time conversions (UTC to Ephemeris Time / TDB).
* Produces 24-hour mission window forecasts with 30-minute intervals, calculating:
  * Total sunlight percentage.
  * Earth line-of-sight communications availability.
  * Longest continuous darkness interval (minutes).
  * Longest continuous communication blackout window (minutes).

### 2. Terrain-Aware LOLA Horizon Raytracing
* Models realistic local obstruction for complex south polar terrain using a 720-bin radial profile derived from the **Lunar Orbiter Laser Altimeter (LOLA)** aboard NASA's Lunar Reconnaissance Orbiter (LRO).
* Evaluates line-of-sight obstruction from an instrument height of 2 meters, distinguishing between nominal geometric visibility and actual physical terrain occultation.

### 3. Interactive 3D Mission Architect (`/trip`)
* **Step 1: Departure**: Select departure launch complex on an interactive 3D Earth globe (Kennedy Space Center LC-39A/B, Cape Canaveral SLC-41, Satish Dhawan, Tanegashima, Baikonur).
* **Step 2: Launcher Selection**: Inspect 3D meshes of official NASA launch vehicles (Saturn V, Space Launch System Block 1, Ares I variants) with astrodynamic delta-v parameters (~3,150 m/s TLI, ~1,850 m/s descent).
* **Step 3: Lunar Destination**: Orbit an interactive 3D Moon sphere with landing site pins, searchable destination database, and coordinate entry.
* **Step 4: Landing Viability**: Run instant SPICE ephemeris calculations and evaluate local solar illumination and Earth communications windows.

### 4. 3D Cesium Lunar Explorer (`/explorer`)
* High-performance 3D lunar surface navigation powered by CesiumJS and Three.js.
* Real-time SPICE-driven dynamic lighting based on selected observation timestamp.
* Interactive coordinate grid overlay, compass indicators, and featured landing beacons (Apollo, Lunokhod, IM-1 Odysseus, IM-2 Athena).

### 5. CLPS & Artemis Mission Manifest & Chronology (`/missions` & `/timeline`)
* Multi-year flight roadmap spanning 2024 through 2028.
* Complete data sheets for 8 official missions:
  * **IM-1 Odysseus** (Intuitive Machines · Malapert A)
  * **IM-2 Athena** (PRIME-1 Regolith Ice Drill · Mons Mouton)
  * **Blue Ghost 1** (Firefly Aerospace · Mare Crisium)
  * **Griffin Mission 1** (Astrobotic · Nobile Crater Rim)
  * **IM-3** (CADRE Autonomous Mini-Rovers · Reiner Gamma Swirl)
  * **Artemis II** (Crewed Lunar Flyby · NASA SLS & Orion)
  * **Artemis III** (First Human Landing at Lunar South Pole)
  * **Draper APEX 1.0** (Farside Seismic Suite · Schrödinger Basin)

### 6. Media Discovery & Cloud Deployment (`/discover`)
* Real-time APOD (Astronomy Picture of the Day) feed, Mars Curiosity & Perseverance rover camera imagery, and NASA Media Library search.
* Containerized Docker & Google Cloud Run deployment configuration documented in [`docs/CLOUD_RUN_2026-11-14.md`](docs/CLOUD_RUN_2026-11-14.md).

---

## 📡 NASA Open Data Integration

| NASA Data Product | Agency / Mission | Role in Project |
|---|---|---|
| **NAIF SPICE Ephemeris Kernels** | NASA JPL / NAIF | Planetary positions (`de440s`), lunar librations (`moon_pa_de440`), and UTC leap seconds (`naif0012.tls`) |
| **LOLA Topographic Data** | NASA LRO / GSFC | 720-bin radial terrain horizon elevation mask for polar obstruction analysis |
| **LROC Digital Terrain Models** | NASA LRO / ASU | Precision landing coordinates for Apollo 11, 14, 15 and Lunokhod sites |
| **CGI Moon Kit Color Map** | NASA SVS | High-resolution lunar surface color and albedo mapping |
| **NASA 3D Resources** | NASA HQ / MSFC | Verified 3D GLB models of Saturn V, Space Launch System (SLS), and Ares I |
| **CLPS Public Data Sheets** | NASA SMD | Payload manifests (TRIDENT, MSolo, ROLSES, NDL, CADRE) and landing schedules |

---

## 🏗️ Architecture & Technology Stack

```
                     ┌─────────────────────────────────────────┐
                     │          Vite + React Frontend          │
                     │  (TypeScript, CesiumJS, Three.js, GSAP) │
                     └────────────────────┬────────────────────┘
                                          │ HTTP / JSON API
                     ┌────────────────────▼────────────────────┐
                     │           FastAPI REST Server           │
                     │         (Python 3.11+, Uvicorn)         │
                     └───────┬─────────────────────────┬───────┘
                             │                         │
             ┌───────────────▼────────┐       ┌────────▼───────────────┐
             │     SpiceyPy Engine    │       │  SQLite Regional Grid  │
             │   (NAIF SPICE Kernels) │       │ (379,987 Index Points) │
             └────────────────────────┘       └────────────────────────┘
```

* **Backend**: Python 3.11+, FastAPI, Uvicorn, SpiceyPy (C-SPICE bindings), NumPy, PyProj, SQLite, Starlette GZip.
* **Frontend**: React 19, TypeScript, Vite, CesiumJS 1.145, Three.js, GSAP 3.15, Tailwind CSS, Phosphor Icons.
* **Pre-rendering**: Node.js SSR pre-render pipeline delivering instant static landing HTML.

---

## ⚡ Quick Start Guide (Windows)

### Option 1: 1-Click Launch (Recommended)
Double-click **`START-NASA-APP.cmd`** in the project root.
* Sets up the local Python virtual environment `.venv`.
* Validates dependencies and prepares the SQLite catalogue index.
* Verifies all NAIF SPICE kernels.
* Starts the server at **http://127.0.0.1:8000**.

### Option 2: Manual Developer Setup (PowerShell)
```powershell
# 1. Backend environment setup
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts/prepare_moon_catalogue.py
.\.venv\Scripts\python.exe -m backend.download_kernels

# 2. Frontend development build (optional if pre-built)
cd frontend
npm ci
npm run build
cd ..

# 3. Start API and client
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```
Open **http://127.0.0.1:8000** in your browser.

---

## 🧪 Testing & Verification

The project includes an exhaustive automated testing suite spanning physics calculations, API contracts, and user interactions:

```powershell
# Run backend tests (85 unit & integration tests)
.\.venv\Scripts\python.exe -m pytest -q

# Run frontend tests (9 mission state & adapter tests)
cd frontend
npm test
npm run lint
```
**Current status**: 94/94 tests passing with zero errors.

---

## ⚖️ Hackathon Disclosures & AI Transparency

* **NASA Open Data**: All planetary kernels, lunar imagery, and landing site specifications are sourced directly from NASA JPL, NASA SVS, NASA PDS Geosciences, and the LRO mission.
* **Independent Project**: This project was developed for the NASA International Space Apps Challenge. It is an independent research and visualization tool, not an official NASA flight-certified operational system.
* **Generative AI Disclosure**: As per NASA Space Apps rules regarding the use of AI tools:
  * Generative AI was utilized for atmospheric concept illustrations (the home page hero background and artistic landscape rendering; these are explicitly labeled as conceptual illustrations, not scientific data).
  * Generative AI was used for code optimization, refactoring, and test suite automation.
  * All scientific ephemeris calculations, coordinate transformations, and horizon profiles are computed deterministically using NASA's NAIF SPICE C library and real LOLA topography data.
