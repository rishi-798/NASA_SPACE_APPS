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
