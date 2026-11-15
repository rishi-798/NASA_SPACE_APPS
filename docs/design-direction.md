> Historical design notes: the AI-generated hero and landscape illustrations described below have been removed from the current homepage. The NASA lunar color map remains.

# Combined lunar website design

The redesign combines three user-provided references, viewed in the browser:

- https://futuristic-space-74.aura.build/: floating capsule navigation, large planetary hero, asymmetric project grid.
- https://auralis.aura.build/: oversized editorial type, rounded imagery, pale pill buttons with orange circular arrows, expandable detail rows.
- https://vesper-space.aura.build/: expansive dark space atmosphere, restrained motion and narrative pacing.

This is a unified implementation in the existing React project, not three embedded websites. Reference brand names, promotional copy, fictional metrics, hotel content and observatory claims are not imported.

## Audit and preservation

Before the redesign, the root redirected directly to the operational explorer. The shell had a full-width bar, decorative grids, small technical typography and no introduction to the collaborators' projects. Explorer, Missions, Timeline and About were already connected to shared site data. The mission dataset contains no complete or dated mission records.

The original frontend is preserved in `NASA-APP-original-frontend.zip` in the project root. The earlier full `NASA-APP.zip` is also retained. The backend, local NASA Moon assets and scientific calculations are not replaced. All four existing route paths and navigation labels remain. The root now introduces Rishi's Moon map and Suhas's visibility engine before leading into the same operational workspace.

## Design system

- Mode: visual overhaul, preserving functionality and information architecture.
- Design variance 8, motion intensity 6, visual density 3 on the landing page. Operational panels remain denser for readable analysis.
- Dark charcoal theme throughout; warm orange interaction accent; off-white headlines and readable cool-gray body text.
- Existing locally hosted Outfit Variable and IBM Plex Mono retained.
- Radius system: 20 px image/project panels, 8 px instrument inputs, fully rounded navigation and primary controls.
- GSAP entry and viewport reveals communicate hierarchy. Subtle hero parallax communicates orbital depth. Reduced-motion users see static content. No continuous scroll handlers or artificial loading sequences.
- The heavy Cesium explorer is route-lazy-loaded, keeping the landing page separate from the scientific visualization bundle.

## Image assets

Built-in image-generation mode was used for atmospheric illustrations, not scientific data. The original NASA lunar mosaic and 3D model remain the authoritative visualization assets. Generated imagery is not represented as a photograph of Athena or Odysseus.

Hero prompt: Create a cinematic lunar photography-style artwork for the hero of a sophisticated NASA Space Apps lunar exploration website. Wide horizontal composition, approximately 16:9. A huge detailed cratered Moon occupies the right half, illuminated upper-right crescent and rugged gray surface emerging from deep shadow, restrained warm copper-orange sunlight edge. Left 45 percent almost-black empty space with subtle stars for overlaid white headlines. Physically believable orbital view. No text, logos, UI, borders, grids, spacecraft or Earth. Atmospheric artwork, not scientific data.

Terrain prompt: Wide horizontal cinematic lunar landscape, photography-style conceptual illustration. Low view above rugged gray regolith, intricate craters and distant ridgelines, grazing sunlight from upper right, subtly warm rim illumination and long shadows. Black sky, no atmosphere. Restrained charcoal and silver-gray palette. No astronauts, spacecraft, Earth, buildings, flags, text, maps or UI. Not a photograph of a particular landing site.

Assets: `frontend/public/lunar-hero.png`, `frontend/public/lunar-terrain.png`, both 1672 x 941. The terrain image carries an explicit conceptual-illustration caption in the page. The scientific limitations and NASA credits are retained on About. The featured map card uses the existing NASA CGI Moon Kit `moon-lroc-2k.jpg` color map, not a simulated map or a photograph of a landing site.

Delivery versions are WebP, with responsive widths for the map and terrain. The generated PNG masters and NASA JPEG remain unchanged. `scripts/optimize_images.py` performs build-time encoding. The hero is 115 KB instead of 2.0 MB; the 640 px terrain is 66 KB instead of 3.2 MB. The root route preloads its hero; other routes do not download it unnecessarily. GZip handles text responses, hashed Vite assets have immutable caching, and unversioned public media has one-day caching.

The home page is pre-rendered at build time and hydrated by React. Its initial text and hero do not wait for JavaScript. Existing analysis routes are served with the normal client shell, avoiding a home-page flash when opening the explorer directly. The generated Node pre-render bundle is not shipped in the ZIP; `frontend/dist/home.html` is the static delivery artifact.
