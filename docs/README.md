# Documentation Index

Comprehensive guides, astrodynamic methodologies, verification reports, and deployment specifications for the CLPS Lunar Browser & Mission Architect.

---

### 🚀 Mission Architecture & Analysis

* **[Analysis Methodology & SPICE Validation](ANALYSIS.md)**: Real-time C-SPICE ephemeris mechanics, LOLA horizon obstruction calculations, coordinate transformations, and mathematical formulations.
* **[Translunar Trajectory & Transfer Planner](TRANSLUNAR_TRANSFER.md)**: Bounded Lambert orbital solver, injection delta-v, and scrubbable Earth-to-Moon flight timelines.
* **[Launch Weather Gateway (Meteomatics)](METEOMATICS.md)**: 24-hour launch pad meteorological forecast gateway and cloud-cover verification.
* **[Challenge Pitch & Presentation Outline](SUBMISSION_PITCH.md)**: 30-second executive pitch, project summary, and seven-slide presentation structure.

---

### 🏔️ 3D Terrain, Regolith & Landing Simulation

* **[3D Surface Viewer Architecture](LANDER_SURFACE_VIEW.md)**: Three.js PBR regolith shaders, micro-gravel scatter, and dynamic solar ephemeris shadow casting.
* **[Landing Physics Simulator](LANDING_SIM.md)**: Euler numerical integration, thrust-to-weight throttling, touchdown criteria, and slope hazard evaluation.
* **[Lunar Dataset Specification](MOON_DATASET.md)**: 379,987-grid catalogue index schema, source raster provenance, and elevation datums.
* **[Site04-G7 Polar Coordinate Alignment](G7_ALIGNMENT.md)**: Spatial alignment between SLDEM2015 rasters, Blender meshes, and the Moon Mean Earth frame.
* **[Cloud Terrain Streaming](CLOUD_TERRAIN.md)**: Cloud-Optimized GeoTIFF (COG) architecture hosted on HuggingFace.

---

### ⚙️ Infrastructure & Deployment

* **[Cloud Run & Docker Guide](CLOUD_RUN.md)**: Production container setup, Nginx reverse proxying, and Google Cloud Build automation.
* **[Self-Hosted Backend Setup](OWNER_HOSTED_BACKEND.md)**: Instructions for running the FastAPI service on private compute instances.
* **[REST API Reference](api.md)**: Endpoint contracts, request parameters, and response schemas.

---

### 📂 Historical Archives

* **[docs/archive/](archive/)**: Contains dated sprint notes, build logs, and legacy handoff documents.
