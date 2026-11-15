# Regional terrain additions

These files are combined with Dip’s dated `Snapshot 2026-11-14 - Complete Blender Project` in a separate subfolder. The four-part RAR archive, its portable-copy audit, the snapshot manifest, and Dip’s saved `Moon Model.blend` are untouched.

## Snapshot comparison

- Dip’s portable `Moon Model.blend` opens with the same 17 scenes as the source copy available to this task.
- Scene object lists, scene properties, material names, image names, and counts match.
- All 268 mesh datablocks have identical vertex coordinates and polygon topology in both copies; no mesh data was added, removed, or changed by the snapshot operation.
- Dip’s snapshot adds the dated four-volume archive, `Snapshot manifest.json`, a portable resource audit, updated region/catalogue metadata, and collaboration/source notes. The audit reports no missing packed images or linked libraries.

## Contents

- [Apollo 12](https://drive.google.com/drive/folders/13Vy8YxtnREr30VZBEWCvIgF0vIlknroj), [Apollo 16](https://drive.google.com/drive/folders/1OzH8-BPK2WC-FvfbrFiasx8uR9ziyomv), [Apollo 17](https://drive.google.com/drive/folders/13_cyzCmWHIJPx9Ceb7Y51F1SCtkdtlID): separate 10 km radius measured SLDEM2015 regions. Apollo 12 includes a Surveyor 3 site marker; Apollo 16 and 17 include rover markers.
- [Surveyor 1](https://drive.google.com/drive/folders/1ljsEXH9JY0Wb1PCvID5a6SY55S551gv3), [Surveyor 5](https://drive.google.com/drive/folders/1DCjseya3B_e3f1cHJsDMSzBDRAJEkqNM), [Surveyor 6](https://drive.google.com/drive/folders/13EIEhHIZnEApJmPeiC5cBXsgsUaFl3a1), [Surveyor 7](https://drive.google.com/drive/folders/1_ADqCF7tMTvWbtU_YEVnI0rywWnsKs7U): separate 10 km radius measured SLDEM2015 regions.
- [Lunokhod 1 / Luna 17](https://drive.google.com/drive/folders/1tjROq4Q0HM_Wmk0ngsVNFB3tx1dIuUrw): shared 10 km measured region. The API selects a separate higher-priority Lunokhod 1 crop at its center; that crop has not been overlaid across the region mesh.
- [Luna 21](https://drive.google.com/drive/folders/1iwy_22Vambz7Uw0kmRI06hVbm21Qyekw): separate 10 km radius measured SLDEM2015 region.
- [Apollo 11](https://drive.google.com/drive/folders/14YA2fEGON3v3e6s3JeIyzEPn6o8Ophsc), [Apollo 14](https://drive.google.com/drive/folders/1yWvkRIY5J97m1EAQkh37eTLVF9b1xyRa) and [Apollo 15](https://drive.google.com/drive/folders/1yGraUPPaa8FmHgIBOEXbVokyFfAn3zvL): separate 10 km radius global SLDEM2015 context regions. At each center the live terrain API selects a mission-specific higher-priority source, which is not composited across the region mesh; see each metadata file for source/control deltas.
- [Lunokhod 2](https://drive.google.com/drive/folders/1WICI4tZok0gvstQzKl7HscaKUsrC9NL5): separate 10 km radius global SLDEM2015 context region. The center API selects the mission-specific 5 m source, which is not composited across the mesh.
- [Tycho](https://drive.google.com/drive/folders/1K0Y-pN3MbQfefD2WlcPOO1GNi4_jnjdD), [Copernicus](https://drive.google.com/drive/folders/1BKRvZT3QieuSTUE45nWvAjVHM0mp0ohJ), and [Clavius](https://drive.google.com/drive/folders/1QsZGsVCokADK1a_6He7YItG2T9OdXtH4): provisional broad crater overview terrain, with each mesh covering a conservative rectangular envelope derived from published feature bounds and expanded by 10 km. These use the same pinned global LOLA64-SVS baseline (~474 m north/south sampling) for consistent broad context; higher-priority local sources are not blended in.
- [Legacy measured scenes](https://drive.google.com/drive/folders/1kWV9gnuPcHzbHbCNughU_m3Sw3E-6Qsv): standalone Apollo 11, 14, 15 and Lunokhod 1, 2 measured-only scenes, plus G7 terrain-only. These retain original scene coverage and are not 10 km expansions.
- [Site04 blocks](https://drive.google.com/drive/folders/1nKyE1jMD2OPRnmUxaxIQY3aH-h2OZmOT): four standalone Blender files, 64 original measured terrain grids each. All 256 grid mesh geometries match the original scene exactly. The presentation-only Earth/Sun objects and star-map imagery are excluded from these scientific blocks.

Each regional folder contains its Blender file, a Z-up GLB candidate, metadata and a preview. All new regional assets remain marked `production_ready: false` until Moon-fixed viewer placement, browser loading/performance, and Sun/Earth ephemeris lighting are validated.

## Crater outline audit and remaining integration

USGS Gazetteer bounds define the conservative overview envelopes. Digitized LROC Copernican rim polygons cross-check Tycho and Copernicus; their bounding boxes are close to the Gazetteer bounds, but this is not a control-network or ME/DE421 registration test. Clavius uses a nearby fitted ellipse from the Robbins crater catalog, not a rim polygon. The 10 km expansion is a conservative coordinate-envelope margin, not an exact geodesic buffer. See [crater footprint source audit]([crater footprint source audit](https://drive.google.com/file/d/1taSgHSi5p1LOr663LyrZRzpLLxGwgzAo/view?usp=drivesdk) and [Blender/GLB export verification](https://drive.google.com/file/d/1HWgy3pmaomOSrVF7RV7kvi4spnPUqPOZ/view?usp=drivesdk).

These crater assets are overview candidates, not close-up high-resolution terrain. Boundary registration, exact geodesic buffers, local high-resolution tile mosaics, Moon-fixed browser placement, browser loading/performance, and Sun/Earth ephemeris lighting still need validation. All assets remain `production_ready: false`.

The Apollo 11, 14 and 15 and Lunokhod 2 packages above use global SLDEM2015 context terrain. The mission-specific higher-priority products remain preserved in the master and the legacy folder; they are not represented as blended into these context meshes.
