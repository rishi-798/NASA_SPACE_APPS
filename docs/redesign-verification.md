# Redesign verification

Verified locally on Windows, October 6, 2026.

## Build and regression checks

- `npm run build`: passed, including TypeScript, Vite client build and home-page pre-rendering.
- `npm run lint`: passed.
- `python -m pytest -q`: 50 passed. Real SPICE kernels were present; no tests skipped.
- Home HTML contains actual project content before JavaScript, compressed with GZip.
- Explorer, Missions, Timeline and About direct links receive their client shell, not the home page.
- Unknown API routes remain JSON 404 responses.
- Delivery tests cover compression preserving horizon JSON, static cache headers, and home-only pre-rendering.

The remaining build warning concerns Cesium's large explorer chunk. That chunk is route-lazy-loaded and not downloaded by the home page. The test runner also reports an existing Starlette/httpx deprecation warning, not a failed test.

## Browser checks

The home page, project links, mission selection, source-linked sites, native explanation accordions, mobile menu and Escape-to-close behavior were tested. Header/footer navigation reaches every existing route.

Checked phone widths of 320 px and 390 px, a 768 px tablet, and the default desktop viewport. Narrow headline clipping and telemetry-row crowding were corrected. Document width stays within the viewport; chronology has an intentional internal horizontal scroll area on narrow screens.

Real Athena analysis for 2026-10-03 18:00 UTC showed Sun elevation -1.5 degrees, Earth elevation +9.1 degrees, the LOLA horizon, 49 daily samples, 0% sampled sunlight and 100% sampled Earth visibility. Real Odysseus analysis showed +0.7 and +14.4 degree elevations respectively, a clearly labeled flat horizon, and 100% sampled availability for both on that UTC day. These are test observations, not hard-coded homepage values or flight-certified predictions.

No browser error or warning was reported during the final home-page hydration check. Empty, pending and loading states were inspected; scientific error handling remains covered by the backend regression tests.

## Lighthouse mobile audit

The release audit in `lighthouse-home-release.json` reported:

- Performance: 87.
- Accessibility: 100.
- Best practices: 100.
- SEO: 100.
- Largest contentful paint: 3.6 seconds under simulated mobile throttling.

The first artwork-heavy prototype scored 49 with a 22.3-second largest contentful paint. Responsive WebP delivery, text compression, route splitting, pre-rendering and removal of first-paint image animation improved actual loading. Earlier audit reports are retained for comparison. Results are local lab measurements, not guarantees for every device or hosting environment.

## Preview files

- `preview-home.jpg`: final desktop home page.
- `preview-mobile.jpg`: final phone home page.
- Design decisions, reference URLs and artwork prompts: `design-direction.md`.

The ZIP uses a single `NASA-APP` top-level folder and includes source, the built site, backend, official kernels, tests and launcher. Machine-specific environments and temporary server-render bundles are excluded. Earlier full-project and frontend recovery ZIPs remain separately in the working folder.
