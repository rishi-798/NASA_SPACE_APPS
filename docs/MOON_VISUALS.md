# Moon display enhancements

The original Cesium ion Moon asset 2684829 and its imagery/geometry remain unchanged.

- A Cesium star-map skybox provides decorative space context. Its orientation uses Cesium Earth conventions; it is not a lunar star-position/navigation calculation.
- Explorer date/time is sent to the existing SPICE visibility service. At lunar latitude/longitude zero, up/east/north map to fixed X/Y/Z; the negated Sun direction feeds Cesium directional lighting. Parallel sunlight ignores the tiny solar parallax across the lunar radius.
- Camera orbit no longer rotates the sunlight. The trip map defaults to 2026-10-03 18:00 UTC until a mission timestamp is passed.
- A matte diffuse shader derives normals from actual rendered triangle positions and uses the calculated directional light. This handles ion tiles without stored normals, which Cesium PBR would otherwise leave unlit. No artificial terrain noise, displacement or replacement color imagery is added.
- Screen-space error is reduced from 8 to 2 pixels; dynamic error relaxation is disabled. This streams finer existing tiles and can increase bandwidth/GPU memory.
- Close-view shadow maps use 2048 pixels and a 150 km range. Shadows are visualization approximations, dependent on loaded geometry; scientific horizon/visibility calculations stay in the backend.
- Missing SPICE calculations are explicitly identified as illustrative lighting. Original ion fallback behavior remains.

Validation: production build, ESLint and the existing nine frontend tests. Browser verification checks shader compilation, dates, orbit and the loaded terrain. Source resolution and imagery lighting baked into the original asset limit the final result.
