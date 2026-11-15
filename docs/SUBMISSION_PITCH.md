# CLPS Lunar Browser — submission pitch

**Tagline:** “CLPS Lunar Browser: Navigating the Extreme Topography and Shadows of the Lunar South Pole.”

[Source repository](https://github.com/rishi-798/NASA_SPACE_APPS) · [Hosted Render demo](https://brahmos-lunar-browser.onrender.com) · [Analysis methodology](ANALYSIS.md)

The hosted deployment can lag `main`; verify the demo before recording. This document supplies the requested 30-second pitch and seven-slide outline. It does not assert that these formats are mandatory for the current competition; check the selected challenge’s submission requirements on the [official Space Apps site](https://www.spaceappschallenge.org/).

## 30-second video script

Approximately 67 words; rehearse at a natural pace.

> At the Moon’s south pole, low sunlight turns crater rims into long shadows, threatening solar power and hiding Earth from view. CLPS Lunar Browser connects mission history to an interactive lunar map. Choose a landing point and time to compare sunlight, Earth visibility, and measured terrain horizons using NASA data and JPL SPICE. Explore cold-trap reference areas, enter the lander’s view, and export a briefing with traceable sources.

### Recording storyboard

| Time | Screen | Narration cue |
| --- | --- | --- |
| 0–6 s | South-polar terrain and low Sun | The problem: light, terrain, and Earth visibility |
| 6–12 s | Missions → IM-2 → Explore on Moon | One click connects the mission to its location and epoch |
| 12–20 s | Analyze conditions; horizon and visibility window | SPICE geometry plus measured LOLA horizon where available |
| 20–26 s | Toggle PSR reference areas; enter completed lander view | Visual exploration and honest scientific context |
| 26–30 s | Dossier preview and repository URL | Export a source-audited briefing; open source |

Record analysis in advance if a new horizon needs generation. Do not edit a flat-horizon result to imply measured terrain.

## Seven-slide submission deck outline

| Slide | Headline | Content / visual | Speaker point |
| --- | --- | --- | --- |
| 1 | Navigate the lunar south pole | Tagline; team; repository and demo links | A shared exploration interface for students, researchers, and mission enthusiasts |
| 2 | A small Sun angle creates a large planning problem | NASA polar-shadow visualization; terrain silhouette | Near the pole the Sun grazes the horizon. Illustrative geometry: a 350 m obstruction at 1° casts ~20 km of shadow (`350 / tan(1°)`); this is an example, not a site measurement. Ridges can also obstruct the Earth line of sight. |
| 3 | Mission → location → observation | Mission card, deep link, selected coordinate/time | Published date-only epochs use a labeled midnight reference. Unknown dates use a labeled demo epoch. Flybys and cancelled plans are explicitly contextual. |
| 4 | Calculations you can inspect | SPICE → local Sun/Earth vectors → terrain horizon → sampled windows | MOON_ME frame, DE440-family ephemeris, 30-minute samples; 720-bin LOLA horizons where available. Distinguish profile-backed, flat, and degraded outputs. |
| 5 | Explore terrain and cold traps | Measured local mesh, existing 1.8 m eye-level mode, six cyan crater reference areas | SLDEM/LOLA and imagery inform available local scenes. Reference crater footprints locate cold-trap context; they are not mapped ice, exact PSR masks, or subsurface thermometry. |
| 6 | A portable planning record | Trip parameters, weather, charts, horizon, kernel hashes in dossier | Earth weather is a bounded Meteomatics forecast, separate from the lunar epoch. Print / Save as PDF exports the audit; unavailable inputs stay explicit. |
| 7 | Open science, next steps, and team | NASA data table; roles; source/demo QR codes if desired | Next: validated PSR masks, thermal layers, visibility convergence checks, and user testing. This prototype does not certify a landing or close a radio link budget. |

## Real-world bottleneck and scientific scope

The Sun stays close to the horizon near the lunar poles. Terrain can therefore produce very long shadows, while topographic obstructions may interrupt a direct view of Earth. Local conditions depend on coordinates, epoch, observer height, terrain resolution, and horizon search radius. See NASA’s [polar shadows explanation](https://science.nasa.gov/resource/shadows-near-the-moons-south-pole/) and [Earth/Sun geometry visualization](https://science.nasa.gov/resource/earth-and-sun-from-the-moons-south-pole/).

A single 24-hour run is not evidence of permanent shadow. The cyan overlay is generated from USGS crater centres and diameters and is deliberately labeled as approximate. Surface-ice observations associated with annual maximum temperatures below ~110 K do not establish a selected point’s subsurface temperature or top-meter ice concentration: [Li et al., 2018](https://doi.org/10.1073/pnas.1802345115).

## NASA and scientific data citation table

| Source | Used for | Access / attribution | Limit |
| --- | --- | --- | --- |
| LRO LOLA, NASA / GSFC / MIT | Polar DEMs and computed obstruction profiles | [PDS LOLA archive](https://pds-geosciences.wustl.edu/missions/lro/lola.htm); [methodology](ANALYSIS.md) | Profile bin count, resolution, observer height, and radius are reported; missing terrain is explicit |
| LROC NAC, NASA / GSFC / Arizona State University | High-resolution contextual imagery in available local scenes | [LROC archive](https://pds.lroc.asu.edu/); scene catalogue records retain product references | An image is not a calibrated elevation mesh |
| SLDEM2015, LOLA / SELENE Terrain Camera | Measured local elevation meshes where catalogued | [SLDEM2015 archive](https://pgda.gsfc.nasa.gov/products/54) and per-model provenance | Coverage and resolution vary; no invented detail |
| JPL NAIF SPICE kernels | Sun/Earth geometry, lunar orientation, UTC conversion | [NAIF generic kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/); [kernel setup](../backend/kernels/README.md) | `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_220930.tf`, `naif0012.tls`, `pck00011.tpc`; runtime manifest SHA-256 values appear in dossier |
| NASA Scientific Visualization Studio, CGI Moon Kit | Global lunar reference imagery / visual context | [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) | Global reference textures do not replace local topographic validation |
| USGS / IAU Gazetteer of Planetary Nomenclature | Centres and diameters for six reference crater areas | [Versioned reference data](../data/psr_reference_craters.json), including one source link per crater | Circular footprints are not PSR outlines or ice detections |
| Li et al., PNAS, 2018 | Interpretation of lunar polar surface-ice evidence | [DOI: 10.1073/pnas.1802345115](https://doi.org/10.1073/pnas.1802345115) | Literature context, not a local volatile abundance estimate |
| Meteomatics | Earth launch-pad wind, temperature, precipitation; optional cloud cover | [API documentation](https://www.meteomatics.com/en/api/getting-started/) | Provider credentials stay on server; subscription and forecast coverage limit availability; no lunar weather inference |

## Team roles and disclosures

The repository currently credits **Rishi** for the interactive Moon map and **Suhas** for the visibility backend. Before submission, the team should confirm the final contributor list and assign ownership for terrain integration, validation, presentation, and demo operation. Do not invent names or assign unconfirmed contributions.

- Project source: [rishi-798/NASA_SPACE_APPS](https://github.com/rishi-798/NASA_SPACE_APPS).
- Dependencies: React, TypeScript, Vite, CesiumJS, Three.js, FastAPI, SPICEypy, NumPy, Rasterio/GDAL, and Requests; retain their upstream notices and repository lockfiles. Review the repository license and third-party asset terms before redistributing a packaged submission.
- NASA data and imagery remain credited to the producing instruments and institutions. This independent Space Apps project is not an official NASA product or endorsement.
- Codex assisted with implementation, tests, and drafting this submission outline. The team must review the scientific interpretation and record any additional AI usage. Early atmospheric homepage illustrations were AI-generated and have been removed from the current homepage.
- No API credentials, private team contact details, or unpublished provider data should appear in the pitch recording or source repository.

## Demo rehearsal

1. Open `/missions`; click IM-2’s **Explore on Moon** action. Confirm the selected destination and published date reference.
2. Run the 24-hour analysis and show the terrain status alongside the Sun/Earth timeline.
3. Enable **Show Cold Traps & Water Ice (PSRs)**. Click a reference crater and explain what the overlay represents.
4. Demonstrate the already completed surface mode at a catalogued local mesh; scrub the time slider.
5. Open the dossier from Explorer, then show Trip’s dossier with the selected pad, launcher, and optional liftoff UTC. Choose **Print / Save as PDF**.
6. End on source links, data credits, current limitations, and the next validation milestone.
