import { useEffect, useRef, useState } from "react";
import { Cartesian2, Cartesian3, Color, ConstantProperty, Math as CesiumMath, ScreenSpaceEventHandler, ScreenSpaceEventType, TileMapServiceImageryProvider, Viewer } from "cesium";
import { launchSites } from "../../data/tripCatalogue";
import "cesium/Build/Cesium/Widgets/widgets.css";

export function EarthGlobe({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const scene = useRef<Viewer | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!root.current) return;
    let viewer: Viewer;
    try {
      viewer = new Viewer(root.current, { baseLayer: false, baseLayerPicker: false, geocoder: false,
        homeButton: false, sceneModePicker: false, navigationHelpButton: false, animation: false,
        timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
        skyBox: false, skyAtmosphere: false, requestRenderMode: true, scene3DOnly: true });
    } catch {
      // External WebGL availability, not derived React state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(true); return;
    }
    scene.current = viewer;
    viewer.scene.backgroundColor = Color.fromCssColorString("#08090c");
    viewer.scene.globe.baseColor = Color.fromCssColorString("#284758");
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(-40, 20, 18000000) });
    let disposed = false;
    void TileMapServiceImageryProvider.fromUrl("/cesium/Assets/Textures/NaturalEarthII").then((provider) => {
      if (!disposed) { viewer.imageryLayers.addImageryProvider(provider); viewer.scene.requestRender(); }
    }).catch(() => { if (!disposed) setError(true); });
    launchSites.forEach((site) => viewer.entities.add({ id: site.id, position: Cartesian3.fromDegrees(site.longitude, site.latitude, 5000),
      point: { pixelSize: 10, color: Color.fromCssColorString("#ff8b52"), outlineColor: Color.BLACK, outlineWidth: 2 },
      label: { show: false, text: site.pad, font: "12px sans-serif", pixelOffset: new Cartesian2(0, -22), showBackground: true,
        backgroundColor: Color.fromCssColorString("#101115dd") } }));
    const clicks = new ScreenSpaceEventHandler(viewer.scene.canvas);
    clicks.setInputAction((event: { position: Cartesian2 }) => {
      const id = viewer.scene.pick(event.position)?.id?.id;
      if (typeof id === "string" && launchSites.some((site) => site.id === id)) onSelect(id);
    }, ScreenSpaceEventType.LEFT_CLICK);
    viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    return () => { disposed = true; scene.current = null; clicks.destroy(); viewer.destroy(); };
  }, [onSelect]);
  useEffect(() => {
    const viewer = scene.current;
    const site = launchSites.find((item) => item.id === selectedId);
    if (!viewer || !site) return;
    viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(site.longitude, site.latitude, 14000000),
      orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.2 });
    viewer.entities.values.forEach((entity) => {
      if (entity.point) entity.point.pixelSize = new ConstantProperty(entity.id === selectedId ? 16 : 10);
      if (entity.label) entity.label.show = new ConstantProperty(entity.id === selectedId);
    });
    viewer.scene.requestRender();
  }, [selectedId]);
  return <div className="trip-earth-wrap"><div ref={root} className="trip-earth" aria-label="Earth globe. Drag to rotate, scroll to zoom, and click a launch pin." />
    {error && <p className="trip-globe-error" role="status">Globe imagery unavailable. You can still choose a departure from the list.</p>}
    <p className="trip-globe-hint">Drag to rotate. Scroll to zoom. Select a launch pin.</p></div>;
}
