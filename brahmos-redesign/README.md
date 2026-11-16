# BRAHMOS redesign preview

Extract the ZIP and open `index.html` in Chrome or Edge. The rocket intro appears on a fresh landing visit, uses Shader R at ignition, and completes automatically. Scroll or select **Open Explorer** to reach the lunar wheel. Select **BRAHMOS** in the wheel to return to the landing view.

See [HANDOFF.md](HANDOFF.md) for the project history, file map, data methods, motion ownership, and verification steps.

The navbar and footer use the same order on every page. **About**, **Analyze a site**, **Plan a trip**, **Flight phases**, **Missions**. The dashboards and their cross-links are local to the archive. Source citations open their respective publishers.


## Cabin artwork

This public copy includes a CSS porthole frame. Developers with their own licensed HorizonX Tharsis export can restore the original look by placing `cabin-desktop.webp` and `cabin-mobile.webp` in `media/`. The pictures are picked up automatically. [HorizonX terms](https://horizonx.so/terms)

## Data and calculations

The supplied NASA Space Apps archive is the reference for the project data. It supplies two CLPS sites, five historical lunar sites, eight launch pads, fourteen launch vehicles, six reference flight phases, eight mission records, and the Athena LOLA horizon. The pages use original markup and styling.

- **Analyze a site** calculates geometric Sun and Earth angles, duration-weighted visibility, and longest hidden intervals for a named site or custom coordinate. Athena uses the supplied 720-bin LOLA horizon. Other points use a flat horizon.
- **Plan a trip** shows launch pad and vehicle catalogue information. It calculates a preliminary Earth-centered Lambert transfer for 24–240 hours and a 160–2,000 km parking orbit. The endpoint is 1,000 km above the Moon’s Earth-facing side. The selected landing site is for a separate visibility calculation. The path chart shows the solved trajectory projected into the transfer plane, with horizontal and vertical extents fitted to the chart.
- **Flight phases** shows educational reference stages with timings, speeds, altitudes, milestones, equations, and telemetry from the snapshot.
- **Missions** shows the original record dates, status, spacecraft, payloads, and sources. The archive includes documented outcomes and dated events for Athena and Odysseus. Records with coordinates open in local analysis.

`flight-data.js` reads locally bundled hourly JPL DE440 ephemeris samples for 2024–2030. The samples use the supplied NAIF kernels and lunar mean Earth/polar axis frame. The preview interpolates between samples. It runs independently of a Python service or the original site. These models assess geometry and educational transfer scenarios. Flight certification and on-demand terrain analysis require separate tools.

## Glass, motion, and audio

The glass adapts the **Components** board’s Button and rounded Frame 68 from HorizonX Liquid Glass v1.0.2. The 304° edge lighting and 14.1 px inner highlight are CSS. One native video is reused for the active hover or keyboard-focused surface. The two progress fills use the halo artwork. Reduced motion uses the halo still on interaction and a short stationary launch screen.

The landing transition uses GSAP ScrollTrigger and Lenis with native touch scrolling. Moon geometry loads after entry settles. It redraws on changes in gaze or drag. The workspace pages use native scrolling and lightweight stills. Analyze a site shows the Moon. Plan a trip and Flight phases show Earth. Missions uses a plain space background.

**Enable mission control** starts the voice guide and opens captions with mute, replay, and language controls. Bundled English audio works without system voices. Spanish, French, Hindi, and Chinese use the corresponding browser voice when available, with the active audio language indicated in the panel. The guide uses local storage for preferences. For a shared origin across pages, serve this folder over HTTP with `python -m http.server 8080` and open [localhost:8080](http://localhost:8080/).

## Asset credits

- HorizonX Tharsis Mars Porthole Hero v1.0.0, Liquid Glass v1.0.2, Crest Water Hero v1.0.1, and the Public Transport Manager v1.0.1 layout reference.
- NASA Goddard Scientific Visualization Studio [Earthrise in 4K](https://svs.gsfc.nasa.gov/4593/), [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), and [Moon Phase and Libration](https://svs.gsfc.nasa.gov/5415/).
- Earth texture and cloud maps from the supplied project archive. Launch rocket from its [NASA Saturn V model](https://science.nasa.gov/3d-resources/saturn-v/).
- The supplied `moonfortapball.obj` and `halo-drift-5s-60fps.mp4`.
- Geist and Geist Mono. See `media/GEIST-LICENSE.txt`.
- GSAP and ScrollTrigger under the [GSAP standard license](https://gsap.com/standard-license/) and Lenis under the included MIT notice.
