# CLPS Lunar Mission Browser: implemented stage

## Files and coverage

`Moon Model.blend` is the same main project. `Site04 - All 256 grids` contains every cell in the original 16×16 regional area. This remains a roughly 16 km regional patch, not full-Moon coverage. The scientific 5 m height texture is retained. Near the active scene camera, source-resolution geometry and approved cosmetic detail are evaluated; overview geometry uses roughly 20 m spacing. Cosmetic dust and rocks are fictional and must not enter calculations. The previous G7 and nine-cell pilot scenes remain available.

NASA Moon Kit broad polar albedo is mapped to this entire scene using the source south-polar projection. Source imagery pixels are preserved in a small crop; no synthetic texture resolution is claimed. NASA's polar colour is a lower-resolution LOLA albedo fill, and the kit is optimized for appearance, not measurements.

The expanded catalogue is complete and has 379,987 rows: 379,726 global parent grids, all 256 original regional grids with their original fields preserved, and five historical scene rows. Global parents have 100 addressable children each, approximately 1 km wide. Original full-resolution rasters accompany the CSV; the CSV stores grid summaries and source identities rather than billions of individual elevations. `moon-dataset.json` is the dataset manifest and `moon-grid-index.sqlite` provides backend lookup. The final `moon-dataset-complete.json` marker confirms that detailed source summaries, validation and source hashes have finished. All 42 source files have SHA-256 checksums; 12,837,631,592 detailed global-tier pixels were accounted for once, matching an independent count. The saved CSV's detailed statistics were independently checked in eight regions, with 40 additional coarse baseline checks.

The full-Moon baseline is NASA's reformatted LOLA 64-pixels-per-degree map. Detailed global summaries use all 32 native SLDEM2015 512-pixels-per-degree tiles between 60°S and 60°N and both 60 m LOLA polar caps. These are separate source tiers, not averaged measurements. Local 2–5 m sources retain priority where available. NASA colour, procedural dust and rocks are visual layers only.

Existing Blender terrain objects now carry the same canonical IDs used by the backend: `SITE04-A1` through `SITE04-P16`, plus five `MISSION-*` IDs. The identity change preserved terrain vertex hashes. New global scenes must use the returned child ID; catalogue coverage does not imply that global Blender scenes already exist. Setup and the coordinate contract are documented in `clps-lunar-browser/docs/MOON_DATASET.md`.

Historical Blender scenes contain measured source meshes, shared cosmetic styling, original-resolution Moon Kit colour crops, separate fictional rocks, and 20-second camera orbit animation. Each also has a separate measured-terrain scene without modifiers:

| Site | Elevation product | Native sampling |
|---|---|---|
| Apollo 11 | LROC stereo DTM tied to LOLA | 2 m |
| Apollo 14 | LROC stereo DTM tied to LOLA | 2 m |
| Apollo 15 | LROC stereo DTM tied to LOLA | 2 m |
| Lunokhod 2 final rover location | LROC Lunokhod2_2 stereo DTM tied to LOLA | 5 m |
| Lunokhod 1 final rover location | SLDEM2015 raw LOLA–Kaguya crop | ~59 m north–south, ~46 m east–west |

Sample spacing is not positional or vertical accuracy. Source quality/uncertainty must be displayed separately. The Lunokhod 1 scene has coarse measured relief; its decorative detail does not represent a fine scientific DEM.

## Existing frontend changes

The actual frontend is on the repository's `moon-map-start` branch. Changes are made in the local `moon-terrain-integration` branch of the clone under `clps-lunar-browser`. No code has been pushed or deployed. The main branch's newer backend was not replaced or merged into this older frontend branch.

The existing React/Cesium app now loads ion Moon asset 2684829, requests 2-pixel screen-space error and native display resolution, defaults guide overlays off, uses terrain depth for picking, and supports mission names and decimal latitude/longitude search. A clearly identified smooth NASA fallback remains if ion loading fails. Terrain resolution and image resolution remain bounded by the source. A production deployment should use the team's scoped public ion token in `.env.local`; the SDK's evaluation token worked in this preview.

## Validation

All 256 cells were sampled against the original regional DEM; checked error below 0.2 mm. A close G7 evaluation checked 40,401 source sample points with effectively zero height error. Original G7 geometry hash is unchanged. Saved historical meshes were reopened and every source sample checked, with zero differences in local relative height. Packed colour textures and camera animations were checked. These checks prove pipeline preservation, not absolute scientific accuracy or manual visual inspection of all 256 cells.

Frontend build/lint and adapter tests are recorded separately. Chrome preview loaded streamed Moon tiles and verified Apollo 14 selection and negative latitude/longitude search. Preview screenshot: `Lunar viewer preview.png`. Backend tests passed: 33 passed, 15 existing ephemeris tests skipped because their SPICE kernels are unavailable. Detailed catalogue verification is saved in `Moon dataset verification.json`.

GitHub work was canceled at the user's request. No changes were pushed and no pull request was opened. Local changes remain available.

## Remaining integration

1. Bake Blender procedural shaders and export browser-ready assets with measured terrain and separate cosmetic geometry. `.blend` files and Blender-specific node trees do not run directly in Cesium.
2. Convert source projected mesh coordinates to a validated physical lunar local frame. Preserve reference radius, elevation offsets and Moon-fixed frame; compare overlap heights before introducing transitions.
3. Connect the confirmed site/time to backend ephemerides, then apply consistent Sun direction, Earth direction, shadows, horizon and timeline state. Current authoring and global viewer lighting are illustrative. Camera animations are view tours, not time-accurate illumination.
4. Load local tiles on demand; add asset placement with terrain contact and site bounds. Arbitrary coordinates must report available data resolution and coverage. There is no full-Moon, fine-resolution Blender terrain library in this build.
5. Improve fine terrain for Lunokhod 1 when a suitable validated product is available. Do not substitute guessed craters or rocks for missing measured terrain.

## Sources

[Site04 LOLA](https://pgda.gsfc.nasa.gov/products/78), [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), [Cesium Moon](https://cesium.com/platform/cesium-ion/content/cesium-moon/), [LROC Apollo 11](https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_APOLLO11), [Apollo 14](https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_APOLLO14), [Apollo 15](https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_APOLLO15), [Lunokhod 2 DTM](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_LUNOKHOD2_2), [SLDEM native tile label](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/sldem2015/tiles/float_img/sldem2015_512_30n_60n_315_360_float.lbl), [LROC measured historical coordinates](https://lroc.im-ldi.com/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf).
