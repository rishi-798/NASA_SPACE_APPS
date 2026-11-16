# BRAHMOS engineering handoff

Start with `index.html` and this guide. The website works after extraction with JavaScript enabled. For development, run `python -m http.server 8080` from this folder, then open `http://localhost:8080/`. Serving over HTTP gives the pages one storage origin for Mission Control preferences. There is no build step or service dependency for the supplied preview.

## Scope and decisions carried forward

- The project is **BRAHMOS**. LUNA is a separate project. A later audit brief originally named LUNA, and the owner clarified that the audit applies to BRAHMOS. The original NASA Space Apps app and its public repository supply data, methodology, and feature requirements. Interfaces in this folder are original implementations guided by the owner’s supplied design references.
- The owner initially requested a standalone cinematic hero and continued page by page. The original Tharsis porthole composition became a dark cabin around a lunar flyover. The launch intro and pacing drew inspiration from Noth.in. The orbit wheel drew on GTA-style radial selection and Ramp’s cards. The wheel’s geometry, hover text scramble, and flight placement were implemented for BRAHMOS.
- The menu and footer must begin with **About**, followed by **Analyze a site**, **Plan a trip**, **Flight phases**, and **Missions**. This supersedes a previous iteration that placed About last. Keep the Asteroid Game link removed. The landing **Open Explorer** enters the lunar wheel. About’s **Open Explorer** opens the local analysis dashboard. The wheel’s **BRAHMOS** button returns to the landing position.
- The glass reference is the actual HorizonX **Liquid Glass 1.0.2** kit. The relevant Figma components are the capsule button and rounded Frame 68, including the 5% black base, 16% light edge, 14.1 px inner highlight, and 304° specular direction. The web treatment preserves its edge and depth with CSS and the owner’s halo footage. Apple interaction guidance informed material hierarchy, without substituting a different glass style.
- The owner’s `halo-drift-5s-60fps.mp4` is the hover fill, with the matching still used where motion is reduced and for the scroll progress rail. Glass is still by default. Keyboard focus can also activate the effect. The newest `shader-r-5s-60fps.mp4` is the ignition exhaust. Dust Vortex was evaluated and is an optional source the owner can retain separately. The intro has no visible Skip intro button and completes on its own. Escape remains a keyboard exit.
- About keeps the owner’s three cards and the Crest Water Hero-inspired light behind them. The page includes the project’s purpose, three analysis questions, scientific specifications, and citations. The scientific text was reconciled against the actual archive, especially the orientation kernels, Athena-only local terrain coverage, and transfer endpoint. The larger glass footer is shared across the landing, About, and dashboard pages.
- The four dashboard layouts use the Public Transport Manager reference for a scene surrounded by floating controls and readouts. **Analyze a site** uses the Moon, **Plan a trip** and **Flight phases** use Earth, and **Missions** uses the plain space background. The original request to link to the existing live tools was superseded by the requirement to stay inside the rewrite.

## Routes and source map

| Entry | Purpose | Main files |
| --- | --- | --- |
| `index.html` | Rocket intro, lunar flyover, landing navigation, lunar wheel, About | `launch.js`, `launch.css`, `hero.js`, `hero.css`, `orbit.js`, `orbit.css`, `moon.js`, `about.js`, `about.css` |
| `index.html#about` | Direct About entry | `index.html`, `about.css`, `about.js` |
| `workspace.html?view=analyze` | Named or custom lunar coordinates, UTC window, visibility, terrain profile | `workspace.js`, `workspace.css`, `mission-data.js`, `flight-data.js` |
| `workspace.html?view=trip` | Launch pad, launcher, site, departure/arrival UTC, Lambert transfer | Same shared dashboard files |
| `workspace.html?view=phases` | Six reference phases, milestones, telemetry and equations | Same shared dashboard files |
| `workspace.html?view=missions` | Mission catalogue, sources, outcomes and dated events | Same shared dashboard files |
| Shared controls | Liquid Glass, hover footage, kinetic labels and opt-in narration | `material.css`, `glass.js`, `glyphs.js`, `mission-control.js` |

Dashboard-to-home links use `index.html?return=1#top` to avoid replaying the intro during an internal return. Direct About and browser back/forward restoration also bypass the intro. A fresh landing entry shows the rocket. Workspace-to-workspace links use the query route and keep the old BRAHMOS deployment out of the navigation. Official citation and mission source links still go to their publishers.

## Animation ownership and performance

- GSAP, ScrollTrigger, and Lenis are vendored in `vendor/`. Versions used here are GSAP and ScrollTrigger 3.15.0 and Lenis 1.3.27. The landing has one launch timeline and one scrubbed ScrollTrigger timeline. Lenis runs only on the landing and uses one GSAP ticker callback while an actual wheel or programmatic scroll is easing. Lenis notifies ScrollTrigger using its scroll event. Native touch and reduced-motion scrolling remain available. Dashboards use native scrolling.
- Launch order is the wordmark and rocket reveal, halo progress, ignition, lift-off, and crossfade to the hero. Shader R runs only through ignition, clipped under the rocket. The halo video pauses before ignition and the exhaust video releases its source when the intro ends. The existing timed choreographic labels and easing remain the reference. Reduced motion gets the stationary wordmark and rocket, with neither video animation nor forced scrolling.
- On the landing, porthole cursor movement is coalesced into one compositor-friendly transform update per frame. It keeps the existing CSS ease. The masked porthole fills the view, crossfades to the wheel, and the cards fan out on the tilted belt. The cabin no longer intercepts wheel clicks after the reveal.
- The wheel draws the supplied mesh with WebGL and keeps its cursor/drag response, orange-white rim light and card orbit. The canvas first loads after the scroll settles, and expensive Moon draws are driven by changes in gaze or drag. The orbital cards and About water already have visibility and scrolling gates. Cursor tracking and keyboard arrow navigation preserve the interaction pattern.
- The halo uses a single native video element and moves between active surfaces. The ORBIT hover fill, mobile disclosure, navbar, launch progress, footer, and Mission Control all share this material. Text scrambles retain their 620 ms nav and 285 ms card durations while scheduling visible glyph swaps at the corresponding cadence.
- On narrow dashboard routes the existing planet moves into the reserved scene area below the subtitle. This prevents body art from crossing small text. Desktop placement stays in the background scene. The audit also repaired small touch targets and long mission names/values at their existing grid boundaries.

## Data, science, and how to update it

The supplied `NASA_SPACE_APPS-main (1).zip` is the reference snapshot. The public repository is [rishi-798/NASA_SPACE_APPS](https://github.com/rishi-798/NASA_SPACE_APPS). Read its data and documentation as source material. Keep the existing scientific and product boundaries when porting the preview into the team’s application.

| Material shipped here | Source inside the original ZIP |
| --- | --- |
| Two CLPS observations, eight launch pads, eight missions | `data/landing_sites.json`, `data/launch_sites.json`, `data/missions.json` |
| Five historical lunar sites | `metadata/handoff-20261011/historical-mission-sites.json` |
| Fourteen vehicle records and six flight phases | Literal records in `frontend/src/data/tripCatalogue.ts` and `frontend/src/components/planner/missionPhaseData.ts` |
| Ada­pted voice lines, mission outcomes and dated events | `frontend/src/data/voiceLines.json`, literal records in `frontend/src/data/missionEvents.ts` |
| Athena’s terrain horizon | `backend/terrain/profiles/athena-im2.json` |
| Earth still | Orthographic render of the project’s `frontend/public/earth/2k-daymap.jpg` and `2k-clouds.jpg` data |

- `mission-data.js` is a classic script so `file://` works. It assigns `window.BRAHMOS_DATA`. When refreshing data, parse JSON directly and extract only the literal record declarations from TypeScript. The earlier packer used the TypeScript AST, resolved the single referenced catalogue source URL, and sorted dated events by timestamp. Avoid executing React page source or copying its component markup. Preserve IDs because query routes and record references use them. The documented inputs and output are sufficient to reproduce the packer without the original chat.
- `media/ephemeris-YYYY.js` files contain little-endian float32 samples at 3,600-second intervals, with the next January 1 sample present for interpolation at the end of each year. Each row has 12 fields, the first six for Moon position and velocity in Earth-centered J2000, then three for the Earth’s location and three for the Sun’s location in lunar `MOON_ME_DE440_ME421`, both relative to the lunar center. The loader fetches only the year or years requested. Supported date coverage is **2024–2030**.
- To rebuild a table, load `backend/kernels/naif0012.tls`, `de440s.bsp`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, and `moon_de440_220930.tf` into SpiceyPy. Convert UTC samples with `str2et`. Query `spkezr("MOON", et, "J2000", "NONE", "EARTH")` and lunar-frame `spkpos("EARTH" or "SUN", et, "MOON_ME_DE440_ME421", "NONE", "MOON")`. Stack in that order with NumPy `astype("<f4")`, then base64-encode. Each file assigns `window.BRAHMOS_EPHEMERIS[year] = { start, step, data }` where start and step are in milliseconds.
- Analysis subtracts a spherical 1737.4 km surface observer from each Moon-fixed geometric vector and projects into the local east/north/up frame. Athena interpolates the supplied 720-bin LOLA profile. Remaining sites, including custom coordinates, use a labelled flat horizon. Coverage uses sample-and-hold duration weighting. The final endpoint sample contributes no duration. Longer windows are bounded at 2,000 observations.
- Transfer is a short-way, zero-revolution, Earth-gravity Lambert model, using date-based DE440 boundary states. It searches the documented 100–175° departure candidates, checks outward departure, Earth and Moon clearance and endpoint closure, and draws the calculated projection. Inputs are limited to a 24–240 hour transfer and 160–2,000 km parking altitude. The lunar reference endpoint sits 1,000 km above the Moon’s Earth-facing side. The site selected in the form feeds a separate visibility analysis. A transfer is preliminary and carries no launch, capture, descent or surface safety certification. Expanded methodology is in the archive’s `docs/ANALYSIS.md` and `docs/TRANSLUNAR_TRANSFER.md`.
- The original backend is more capable. It can compute on demand with SPICE and may provide terrain, warehouse, launch weather, dossier, or simulation features. The portable preview uses bundled data and clearly bounded calculations. The safe porting path is to keep the reviewed UI and connect requested owning services deliberately.
- Mission Control is an opt-in **narrator**. It plays bundled English audio for core actions and selected phase/mission cues. Other languages use installed system voices when available, with caption and audio fallback status in the glass dialog. Preferences are stored locally. The English clips were rendered from the guide lines with Windows text-to-speech, 16 kHz mono WAV. For new cue recordings, add the line in `BRAHMOS_DATA.voice.lines`, the cue ID in `voice.localAudio`, and a matching `media/voice/[cue].wav`. Never report audio playback based only on a successful call to `speak()`.

## Verification and future work

- Test fresh landing, Escape during launch, back navigation, wheel entry using both scrolling and the CTA, the Home link, Moon pointer and drag response, hover footage, keyboard navigation, and reduced motion.
- Test analysis with Athena and Odysseus from 2026-10-12 through 2026-10-26 UTC at 30 minute cadence. Expect 673 observations. Athena duration coverage is 63.7% Sun, 67.9% Earth, 63.7% both. Odysseus is 59.2%, 100%, and 59.2%.
- Test 2026-10-12T00:00Z to 2026-10-16T00:00Z at 200 km parking altitude. Reference injection is approximately 3.142447 km/s and Moon-relative speed 0.859096 km/s. Also test a cross-year interval, invalid date order, and the maximum sampling bound.
- Test all four dashboards at 320, 390, and 1440 CSS px, their Mission Control controls, long labels, missing optional mission fields, empty records, and native input focus. Use actual audio media progress for English. System voices depend on the device. Keep a real-device test separate from Chrome CPU-throttling results.
- This branch contains the standalone preview. The public copy uses a CSS fallback for the original licensed cabin images. See the README for restoration instructions.

Keep each correction tied to a measured defect. The existing composition, data, words, navigation and cinematic motion are the baseline for the next person.
