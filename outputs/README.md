# Regional Lunar Terrain Assets & Scientific Models

This directory contains measured lunar terrain models, candidate 3D exports, coordinate metadata, and visual previews generated from high-resolution NASA SLDEM2015 and LOLA64-SVS datasets.

All assets are built strictly with measured elevation data and scientific materials; no decorative synthetic geometry, procedural noise, or unverified rocks were added.

---

## 1. Directory Structure & Contents

### Regional Landing Site Packages (10 km Radius)
Each region package includes a native Blender scene (`.blend`), a Z-up candidate model (`.glb`), coordinate/source metadata (`.json`), and a rendered preview (`.png`).

| Region / Site | Key Mission / Features | Files |
|---|---|---|
| **Apollo 11** | Sea of Tranquility landing site | `Apollo 11 - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |
| **Apollo 12** | Ocean of Storms, Surveyor 3 marker | `Apollo 12 - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |
| **Apollo 14** | Fra Mauro highlands context | `Apollo 14 - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |
| **Apollo 15** | Hadley-Apennine context | `Apollo 15 - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |
| **Apollo 16** | Descartes highlands, lunar rover marker | `Apollo 16 - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |
| **Apollo 17** | Taurus-Littrow valley, lunar rover marker | `Apollo 17 - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |
| **Luna 21** | Le Monnier crater | `Luna 21 - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |
| **Lunokhod 1 / Luna 17** | Mare Imbrium exploration | `Lunokhod 1 region - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |
| **Lunokhod 2** | Le Monnier traverse context | `Lunokhod 2 - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |
| **Surveyor 1** | Ocean of Storms initial landing | `Surveyor 1 - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |
| **Surveyor 5** | Mare Tranquillitatis | `Surveyor 5 - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |
| **Surveyor 6** | Sinus Medii | `Surveyor 6 - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |
| **Surveyor 7** | Tycho crater rim highlands | `Surveyor 7 - Measured terrain.blend`, `.glb`, `metadata.json`, `preview.png` |

---

### Major Impact Crater Overviews
Broad geological overview terrain models derived from the LOLA64-SVS baseline (~474 m resolution) with a 10 km conservative margin:

- **Tycho** (`Tycho - Overview terrain.blend`, `Tycho - Overview terrain candidate.glb`, metadata, preview)
- **Copernicus** (`Copernicus - Overview terrain.blend`, `Copernicus - Overview terrain candidate.glb`, metadata, preview)
- **Clavius** (`Clavius - Overview terrain.blend`, `Clavius - Overview terrain candidate.glb`, metadata, preview)

---

### Site04 Measured Terrain Blocks (All 256 Grids)
The high-resolution Site04 polar stereographic terrain scene is partitioned into four modular, independently loadable Blender blocks (64 measured grid meshes each). All 256 grid meshes match the original source geometry vertex-for-vertex:

- `Site04 - Grid block A.blend` (Grids A1–H8)
- `Site04 - Grid block B.blend` (Grids A9–H16)
- `Site04 - Grid block C.blend` (Grids I1–P8)
- `Site04 - Grid block D.blend` (Grids I9–P16)
- Manifest & Verification: `Site04 regional block manifest.json`, `Site04 grid block verification.json`

> **Note on File Limits**: Partitioning into Blocks A–D ensures compatibility with standard Git repository size constraints (< 100 MB per file) while allowing clients to stream or render only the active quadrant needed in memory. The monolithic archive is preserved on Google Drive.

---

### Preserved Legacy Measured Scenes
Standalone extracted Blender scenes containing original source boundaries and packed imagery:
- `Apollo 11 - Legacy measured terrain.blend`
- `Apollo 14 - Legacy measured terrain.blend`
- `Apollo 15 - Legacy measured terrain.blend`
- `Lunokhod 1 - Legacy measured terrain.blend`
- `Lunokhod 2 - Legacy measured terrain.blend`
- `G7 - Terrain only.blend`
- Manifest: `Legacy measured terrain scene manifest.json`

---

## 2. Reproducibility & Pipeline Automation

The automated pipeline scripts that extracted, built, and verified all 3D assets and coordinate bounds are located in [`scripts/blender/`](../scripts/blender/):

- `split_site04_blocks.py`: Splits the 256-grid polar stereographic master into modular blocks A–D with 100% vertex parity check.
- `build_apollo12.py`, `build_lander_assets.py`, `build_fallback_regions.py`: Extracts regional DEM windows from SLDEM2015 and generates Blender meshes and GLB candidate files.
- `build_crater_overviews.py`: Builds Tycho, Copernicus, and Clavius broad envelope meshes.
- `audit_crater_footprints.py`: Validates crater bounding coordinates against USGS Gazetteer and LROC Copernican rim shapefiles.
- `verify_apollo12.py`, `verify_crater_overviews.py`, `verify_site04_blocks.py`: Re-opens exported files in headless Blender to confirm geometry hashes, normal orientation, and material preservation.

---

## 3. Remote Storage & Drive Archive

- **Regional terrain additions Drive folder**: [Google Drive Folder](https://drive.google.com/drive/folders/1fg5q9CP0LnPM6cUUP8iYCwp9ir-7_e6c)
- **Technical Documentation**:
  - [`Regional terrain additions README - 2026-11-14.md`](./Regional%20terrain%20additions%20README%20-%202026-11-14.md)
  - [`Regional terrain build progress - 2026-11-14.md`](./Regional%20terrain%20build%20progress%20-%202026-11-14.md)
