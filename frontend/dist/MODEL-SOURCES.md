# 3D model sources

## Earth launch-site globe textures

- Solar System Scope / INOVE: https://www.solarsystemscope.com/textures/
- Licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
- Local 2K, 4K and 8K day, night, cloud, normal and specular textures are in
  `earth/`. Browser conversions and source hashes are recorded in
  `earth/sources.json`. See `docs/EARTH_VIEW.md` for presentation details.

## nasa-moon.glb

- Credit: NASA's Goddard Space Flight Center.
- Source: https://svs.gsfc.nasa.gov/14959/
- Original download: https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/moon_small.glb
- Downloaded September 25, 2026; stored locally so the map does not depend on a remote embed.
- NASA describes this variant as a lunar color map wrapped onto a sphere without topography. Lighting in this app is illustrative, not a computed Sun position.
- This replaces the unavailable legacy embed at https://solarsystem.nasa.gov/gltf_embed/2366/ ; it is not asserted to be the identical legacy asset.
- The app rotates the model into lunar coordinates and scales its maximum radius to Cesium's Moon radius. Coordinate picking uses that reference sphere rather than terrain intersections. Imagery alignment is approximate and needs control-point validation before scientific use.

## moon-lroc-2k.jpg

- NASA's Goddard Space Flight Center, CGI Moon Kit: https://svs.gsfc.nasa.gov/4720/
- Download: https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg
- Used for the illustrative mission overview and the landing overview image.
  This is not detailed terrain for the selected coordinate.

## nasa-earth-clouds.glb

- Credit: NASA's Scientific Visualization Studio.
- Source: https://science.nasa.gov/resource/earth-with-clouds-3d-model/
- NASA Earth model with clouds, bundled locally for the Trip scene. The globe is scaled for the scene's visual composition; it is not a map or a geodetic surface for launch-site picking.

## nasa-sun.glb

- Credit: NASA.
- Source: https://science.nasa.gov/learn/heat/resource/sun-3d-model/
- Bundled locally as a visual Sun model. Its appearance does not determine the lighting: sunlight direction and the visible disc's apparent size are driven by the backend's Sun position and distance calculation.

## deep-star-map-4k.jpg

- Credit: NASA's Scientific Visualization Studio, "A 3D Map of 1.7 Billion Stars."
- Source: https://svs.gsfc.nasa.gov/4851/
- The source star map is converted to a 4096 × 2048 JPEG for use as the scene background. Additional procedural stars provide subtle depth; they are decorative and are not an astronomical star catalogue.
- The Trip scene compresses the visual spacing between Earth, Moon, and the Sun so the whole system fits on screen. The Sun's direction, distance metadata, and apparent angular size are calculated from backend ephemeris data.

## saturn-v.glb

- Credit: NASA / Michael D. Carbajal.
- Source: https://science.nasa.gov/3d-resources/saturn-v/
- Official download: https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/model/saturn-v/Saturn%20V.glb
- Downloaded October 10, 2026. Rendered locally in the trip planner with orbit controls.
- The model is scaled for presentation, not engineering measurement. Other rocket
  entries do not reuse this model or claim to have a verified model available.

## Cesium Moon terrain

- Rishi's supplied viewer references Cesium ion asset 2684829.
- Requires network access and suitable ion permissions. The bundled reference
  globe is the fallback; it is not the detailed Blender landing surface.

## sls-block-1.glb

- NASA / Marshall Space Flight Center, official printable SLS Block 1 geometry:
  https://science.nasa.gov/3d-resources/space-launch-system-sls-block-1/
- Downloaded October 11, 2026. Source STL SHA-256:
  `d3af75412a54f1d15d644cce56e895fe6813452b49dc0558b4b2ddfb484844ac`.
- Converted with `scripts/convert_sls_model.mjs`: 274,432 original triangles,
  no geometry simplification, a neutral material and no invented NASA markings
  or textures. Display scale is illustrative, not an engineering measurement.
- The separate official digital SLS download contains a `.blend` file. It is
  not silently treated as a textured GLB; further conversion is still needed.

## ares-i-a.glb and ares-i-b.glb

- NASA official digital models, downloaded October 11, 2026 from:
  https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Ares%201%20(A)
  https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Ares%201%20(B)
- Original GLBs retained, including their Draco-compressed geometry. The app
  serves its decoder locally, from Three.js's bundled Draco distribution.
- Ares I belongs to the canceled Constellation programme. These variants are
  displayed as historical concepts, not flown lunar launch configurations.
