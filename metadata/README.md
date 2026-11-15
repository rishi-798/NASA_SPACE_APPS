# Lunar Metadata, Schemas & Coordinate Alignment

This directory stores coordinate reference systems (CRS), schema definitions, historical landing coordinates, and scientific provenance registries.

---

### Core Metadata Files

* **`moon-catalogue-schema.json`**: Full JSON schema for the 57-column lunar catalogue index (379,987 grid records covering the entire Moon).
* **`moon-catalogue-counts.json`**: Grid cell density counts partitioned by latitude band and terrain resolution.
* **`historical-mission-sites.json`**: Ground-truth coordinates, crater identifiers, and reference epochs for historic Apollo, Surveyor, Luna, and Lunokhod missions.
* **`terrain-source-registry.json`**: Scientific data source definitions, map projections, resolutions, and PDS links for LOLA and SLDEM2015 rasters.
* **`alignment/`**: Transformation matrices mapping Blender/GLB local meshes into the Moon Mean Earth / Polar Axis (MOON_ME) fixed reference frame.
* **`handoff-20261011/`**: Immutable handoff provenance manifests preserving vertex integrity.
