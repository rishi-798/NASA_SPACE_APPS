# Rocket viewer audit and material revision — 2026-11-15

## Audit before changes

All 14 catalogue entries resolve to a distinct GLB. Loading successfully does not establish engineering accuracy.

| Asset | Existing state | Planned treatment / remaining limit |
|---|---|---|
| Saturn V | NASA mesh, 8 embedded images, recognizable stage/paint layout | Preserve geometry and painted imagery; restrained roughness and gallery reflections. Specific Apollo flight not established. |
| SLS Block 1 | 19.9 MB printable mesh, one neutral material, no UVs or images | Preserve complete NASA printable geometry; assign spatial foam/paint/engine finishes, clean shared vertices and compress with Draco. Not a flight-specific reconstruction. |
| Ares I A | NASA concept mesh; all nine materials identical gray; perpendicular duplicate source components | Keep concept silhouette; remove detached duplicates in exported asset; neutral white coating, restrained metal and dark nozzle. NASA's A/B labels do not establish the exact design year. Do not add I-X roll stripes or B's orange tank. |
| Ares I B | NASA colored historical concept, original material partitions | Retain concept geometry/colors; roughness only. Do not present as flown Ares I-X. |
| Proton-K/D | Simplified project model; six outboard fuel tanks, not six detachable strap-on boosters | Material pass only; engine/internal upper-stage detail remains approximate. |
| Long March 3B/E | Simplified four-booster 3B reference | Preserve geometry; explicitly distinguish this from a verified enhanced 3B/E model. |
| LVM3 | Simplified L110/C25 plus two S200s | Preserve overall configuration; surface pass; flight-specific markings not verified. |
| H-IIA 202 | Simplified two-booster, 4 m fairing reference | Preserve configuration, orange insulation and paint; surface pass. |
| Falcon 9 Block 5 | Community model, no image textures | Preserve Block 5 silhouette; material pass; no mission-specific soot/decals invented. |
| Vulcan VC2S | Community short-fairing/two-booster model | Preserve exact booster count/fairing; material pass; mission-specific livery not represented. |
| Long March 5 CZ-5 | Community four-booster model | User confirmed this is “marsh 5”; preserve CZ-5, do not substitute CZ-5B. Material pass. |
| Ariane 6 A64 | Community four-booster model | Preserve A64 configuration; material pass, not a specific flight's livery. |
| Atlas V 401 | Community 4 m fairing / zero SRB / single Centaur engine model | Preserve variant; material pass. |
| Jupiter-C / Juno I | NASA historical Explorer asset | Preserve original imagery and configuration; roughness only. NASA uses both names for Explorer's modified Jupiter-C. |

## Primary references

- NASA original Ares A: https://science.nasa.gov/3d-resources/ares-1-a/
- NASA Ares I stage description: https://ntrs.nasa.gov/citations/20100032022
- NASA SLS digital source: https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Space%20Launch%20System%20Block%201
- NASA Block 1 component geometry/dimensions: https://www.nasa.gov/wp-content/uploads/2021/12/sls_reference_guide_2022_web_0.pdf
- NASA orange core/LVSA decision: https://www.nasa.gov/news-release/nasa-completes-critical-design-review-for-space-launch-system/
- NASA Saturn V: https://science.nasa.gov/3d-resources/saturn-v/
- NASA Proton reference (endpoint unavailable during audit): https://sma.nasa.gov/LaunchVehicle/assets/proton-kd.pdf
- CNSA CZ-3B component diameters/four boosters: https://www.cnsa.gov.cn/n6758824/n6759008/n6759011/c6794048/content.html
- Manufacturer 3B/3B-E length distinction: https://cn.cgwic.com/Launchservice/LM3B.html
- ISRO LVM3-M4: https://www.isro.gov.in/media_isro/pdf/Missions/LVM3/LVM3M4_Chandrayaan3_brochure.pdf
- JAXA H-IIA 202: https://www.jaxa.jp/countdown/f15/overview/h2a_e.html
- SpaceX Falcon 9: https://www.spacex.com/vehicles/falcon-9/
- ULA Vulcan: https://www.ulalaunch.com/rockets/vulcan-centaur
- ULA Atlas V: https://www.ulalaunch.com/rockets/atlas-v
- CNSA Long March 5: https://www.cnsa.gov.cn/english/n6465652/n6465653/c6810502/content.html
- ESA A64: https://www.esa.int/ESA_Multimedia/Images/2026/02/First_Ariane_6_with_four_boosters_on_the_launch_pad
- NASA Explorer/Juno I: https://science.nasa.gov/mission/explorer-1/about/

## Methods

Principled BSDF maps paint, foam and metal to glTF PBR base color, metallic and roughness. NASA SLS printable geometry is retained in full. The separate digital source failed visual export verification and was rejected. Draco compression reduces browser cost. Smooth cylinder walls retain hard caps/edges. Existing image UVs are retained; untextured meshes receive a cylindrical UV only for a tiny, deterministic roughness data texture. It varies roughness by less than 5%; no noisy bump, weathering or invented lettering. This texture is baked offline into PNG data and embedded in GLB, rather than expecting procedural shader nodes to survive export.

The gallery uses Three.js RoomEnvironment filtered by PMREM for broad, restrained highlights against the unchanged space background, plus its existing key/fill/rim lights. This is a display studio, not computed solar illumination. ACES/sRGB retain white-surface detail. Environment render targets and model resources are disposed on selection changes. `?rocketReview=full` freezes automatic rotation for comparison; `?rocketReview=close` uses a fixed upper-stage close view. Normal interaction remains available.

Blender/glTF reference: https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html
Three.js reflection reference: https://threejs.org/docs/pages/RoomEnvironment.html

## Verification

All 14 GLBs passed Blender import/bounds checks. Production build passes after merging current main. Matched SLS browser comparison confirms full body, boosters and orange/white material regions. SLS source is printable geometry including its base; this is not a flight-specific digital twin. Live deployment checks follow. Approximate models remain approximate; this is not an engineering reconstruction or verified flight-specific marking set.
