# Trip planner Earth view

Replaces the departure globe's bundled Natural Earth II imagery with a Three.js
Earth using Solar System Scope / INOVE textures under CC BY 4.0. Attribution
and license links are visible in the view and recorded in public/earth/sources.json.
Textures are converted to browser JPEG and resized; geography is not displaced.
Desktop: 8K surface plus 4K night, cloud, normal and ocean specular maps.
Compact screens or limited GPU texture support use 2K maps.

Cloud motion, night lights, ocean reflection and a blue atmospheric rim are
illustrative visual effects, not live weather or time-specific Earth ephemerides.
Launch sites retain their existing coordinates and IDs. Sphere UV orientation
uses east-positive longitude; pins are ray-picked with the Earth blocking
far-side pins. Dragging does not select a pin. Site selection moves the camera.
Reduced-motion preferences stop cloud drift and skip camera interpolation.
The existing list remains available if WebGL or texture loading fails.

The launch-site catalogue is unchanged; this does not claim all NASA sites
are already catalogued. Lunar Cesium, scientific rasters and Blender files
are unchanged.

## Blender Guru tutorial adaptation

Reference: https://www.youtube.com/watch?v=0YZzHn0iz8U
The full transcript and final video appearance were inspected. The website uses
PBR land/ocean roughness separation, selectively reduced ocean saturation, the
tutorial-supplied NASA topography map for subtle geometry relief, raised cloud
geometry with bump and displacement, approximate cloud shadows, thin exponential
atmospheric density and a soft day/night-dependent rim, plus warm city emission
that begins after twilight. The source topography is from the tutorial's NASA
texture folder: https://drive.google.com/drive/folders/1MRwpedip8EJVlm7YZi7lvEajPPN6lBwj
The 5K image is used here as a visual height map with conservative normalized
displacement; it is not a calibrated elevation service.

Browser adaptations: fixed sphere tessellation replaces Cycles adaptive
subdivision; cloud bump/displacement replaces subsurface scattering; short
ray integration replaces the volume/compositor atmosphere. Cycles render passes,
blurred shadow-pass compositing and 16-streak lens glare are not reproduced
exactly. Earth illumination remains illustrative, not date-specific.
