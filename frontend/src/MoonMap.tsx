import { useEffect, useRef, useState, type RefObject } from "react";
import {
  BoundingSphere,
  PolygonHierarchy,
  ArcType,
  Axis,
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  CustomShader,
  LightingModel,
  SkyBox,
  Color,
  ConstantPositionProperty,
  DirectionalLight,
  DistanceDisplayCondition,
  HeadingPitchRange,
  HeightReference,
  HorizontalOrigin,
  IonResource,
  ImageBasedLighting,
  JulianDate,
  LabelStyle,
  Math as CesiumMath,
  Matrix3,
  Matrix4,
  Model,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  VerticalOrigin,
  type Entity,
} from "cesium";
import { createMoonGuides, lunarPosition, MOON, RADIUS } from "./moonGuides";
import { featuredMoonSites, moonMapSites, MOON_TERRAIN_ASSET_ID } from "./data/moonMapSites";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getMoonIonToken } from "./lib/viewerConfig";

import psrData from "../../data/psr_reference_craters.json";
import { craterOutline } from "./lib/psr";

const VIEWS = {
  near: [10, -25],
  far: [180, 12],
  south: [0, -85],
} as const;

type ViewName = keyof typeof VIEWS;

export interface MoonLocation {
  latitude: number;
  longitude: number;
  name?: string;
}

export interface MoonControls {
  setView: (name?: ViewName, animate?: boolean) => void;
  zoom: (direction: number) => void;
  flyToSite: (id: string, mode?: "aerial" | "orbit") => void;
  setAerialView: (siteId?: string) => void;
}

interface MoonMapProps {
  onLocationSelect: (location: MoonLocation) => void;
  onSiteSelect: (id: string) => void;
  selectedLocation: MoonLocation | null;
  showGrid: boolean;
  showAxis: boolean;
  showPsr?: boolean;
  focusOnMount?: boolean;
  observationTime?: string | null;
  controlsRef: RefObject<MoonControls | null>;
}

interface SceneState {
  viewer: Viewer;
  guides: ReturnType<typeof createMoonGuides>;
  point: Entity;
  light: DirectionalLight;
  psr: Entity[];
}

export function MoonMap({
  onLocationSelect,
  onSiteSelect,
  selectedLocation,
  showGrid,
  showAxis,
  showPsr = false,
  focusOnMount = false,
  controlsRef,
  observationTime = "2026-10-03T18:00:00Z",
}: MoonMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const initialLocation = useRef(focusOnMount ? selectedLocation : null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [lightingNote, setLightingNote] = useState("Calculating sunlight…");
  const [referenceOnly, setReferenceOnly] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let viewer: Viewer;
    try {
      viewer = new Viewer(containerRef.current, {
        ellipsoid: MOON,
        globe: false,
        baseLayer: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        // Default Cesium star map is decorative, not lunar astrometry.
        shadows: true,
        skyBox: SkyBox.createEarthSkyBox(),
        skyAtmosphere: false,
        requestRenderMode: true,
        scene3DOnly: true,
        shouldAnimate: false,
      });
    } catch (error) {
      console.error("Could not initialize the Moon viewer", error);
      // This state reports failure of an external WebGL system, not derived React data.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("error");
      return;
    }

    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;
    viewer.scene.backgroundColor = Color.fromCssColorString("#000000");
    viewer.scene.fog.enabled = false;
    viewer.resolutionScale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    viewer.scene.postProcessStages.fxaa.enabled = true;

    if (viewer.scene?.globe) {
      viewer.scene.globe.baseColor = Color.fromCssColorString("#1a202c");
    }
    const light = new DirectionalLight({
      direction: new Cartesian3(-1, 0, 0),
      intensity: 2,
    });
    viewer.scene.light = light;

    viewer.scene.shadowMap.maximumDistance = 150000;
    viewer.scene.shadowMap.size = 2048;
    viewer.scene.shadowMap.darkness = 0.05;

    const controller = viewer.scene.screenSpaceCameraController;
    controller.minimumZoomDistance = 100;
    controller.maximumZoomDistance = 14000000;
    controller.minimumTrackBallHeight = 0;
    controller.enableCollisionDetection = true;

    const guides = createMoonGuides(viewer);
    const point = viewer.entities.add({
      show: false,
      point: {
        color: Color.fromCssColorString("#a2ecd3"),
        pixelSize: 10,
        outlineColor: Color.fromCssColorString("#0d1819"),
        outlineWidth: 3,
        heightReference: HeightReference.CLAMP_TO_3D_TILE,
        disableDepthTestDistance: 100000,
      },
    });
    const psr = psrData.craters.map(crater => viewer.entities.add({
      id: `psr:${crater.name}`, name: `${crater.name} reference area (not a PSR boundary)`, show: false,
      polygon: {
        hierarchy: new PolygonHierarchy(craterOutline(crater).map(p => lunarPosition(p.longitude, p.latitude, 6000))),
        perPositionHeight: true, arcType: ArcType.NONE,
        material: Color.CYAN.withAlpha(0.24), outline: true, outlineColor: Color.CYAN.withAlpha(0.7),
      },
      position: lunarPosition(crater.longitude, crater.latitude, 6500),
      label: {text: crater.name, distanceDisplayCondition: new DistanceDisplayCondition(0, 2000000), font: "12px sans-serif", fillColor: Color.CYAN,
        style: LabelStyle.FILL_AND_OUTLINE, outlineWidth: 3, outlineColor: Color.BLACK,
        disableDepthTestDistance: 100000},
    }));
    sceneRef.current = { viewer, guides, point, light, psr };

    const setView = (name: ViewName = "near", animate = true) => {
      const [longitude, latitude] = VIEWS[name] ?? VIEWS.near;
      const options = {
        destination: lunarPosition(longitude, latitude, name === "south" ? 800000 : 5400000),
        orientation: {
          heading: 0,
          pitch: -CesiumMath.PI_OVER_TWO,
          roll: 0,
        },
      };

      if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        viewer.camera.flyTo({ ...options, duration: 0.9 });
      } else {
        viewer.camera.setView(options);
      }
      viewer.scene.requestRender();
    };

    const flyToSite = (id: string, mode: "aerial" | "orbit" = "aerial") => {
      const site = moonMapSites.find((candidate) => candidate.id === id);
      if (!site) return;
      if ("analysisSiteId" in site && typeof site.analysisSiteId === "string") {
        onSiteSelect(site.analysisSiteId);
      } else {
        onLocationSelect({ latitude: site.latitude, longitude: site.longitude, name: site.name });
      }
      viewer.camera.cancelFlight();
      const sitePos = lunarPosition(site.longitude, site.latitude);
      const normal = Cartesian3.normalize(sitePos, new Cartesian3());
      const sunDir = Cartesian3.normalize(
        Cartesian3.add(
          Cartesian3.multiplyByScalar(normal, 0.75, new Cartesian3()),
          new Cartesian3(0.4, 0.3, 0.5),
          new Cartesian3()
        ),
        new Cartesian3()
      );
      viewer.scene.light = new DirectionalLight({
        direction: Cartesian3.negate(sunDir, new Cartesian3()),
        intensity: 2.2,
      });

      const heading = CesiumMath.toRadians(35);
      const pitch = mode === "orbit" ? -CesiumMath.PI_OVER_TWO : -CesiumMath.toRadians(24);
      const range = mode === "orbit" ? 650000 : 18000;
      viewer.camera.flyToBoundingSphere(
        new BoundingSphere(sitePos, 1),
        {
          offset: new HeadingPitchRange(heading, pitch, range),
          duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2.0,
        },
      );
      viewer.scene.requestRender();
    };

    const setAerialView = (siteId?: string) => {
      let targetSite = siteId ? moonMapSites.find((candidate) => candidate.id === siteId) : null;
      if (!targetSite && selectedLocation) {
        targetSite = {
          id: "selected-coordinate",
          name: selectedLocation.name ?? "Selected Location",
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
        };
      }
      if (!targetSite) targetSite = moonMapSites[0];
      if (!targetSite) return;

      viewer.camera.cancelFlight();
      const targetPos = lunarPosition(targetSite.longitude, targetSite.latitude);
      const normal = Cartesian3.normalize(targetPos, new Cartesian3());
      const sunDir = Cartesian3.normalize(
        Cartesian3.add(
          Cartesian3.multiplyByScalar(normal, 0.75, new Cartesian3()),
          new Cartesian3(0.4, 0.3, 0.5),
          new Cartesian3()
        ),
        new Cartesian3()
      );
      viewer.scene.light = new DirectionalLight({
        direction: Cartesian3.negate(sunDir, new Cartesian3()),
        intensity: 2.2,
      });

      viewer.camera.flyToBoundingSphere(
        new BoundingSphere(targetPos, 1),
        {
          offset: new HeadingPitchRange(CesiumMath.toRadians(35), -CesiumMath.toRadians(24), 18000),
          duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2.0,
        },
      );
      viewer.scene.requestRender();
    };

    for (const site of moonMapSites) {
      const featured = featuredMoonSites.find((candidate) => candidate.id === site.id);
      const leftLabel = featured?.side === "left";
      viewer.entities.add({
        id: `landing:${site.id}`,
        name: site.name,
        position: lunarPosition(site.longitude, site.latitude),
        label: {
          text: featured ? `${featured.name.toUpperCase()} ↗\n${featured.mission} · EXPLORE SITE` : site.name,
          font: featured ? "600 13px sans-serif" : "13px monospace",
          fillColor: featured ? Color.fromCssColorString(featured.color) : Color.WHITE,
          outlineColor: Color.fromCssColorString("#0a1014"),
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: featured ? new Cartesian2(leftLabel ? -28 : 28, leftLabel ? -20 : 20) : new Cartesian2(0, -22),
          horizontalOrigin: featured ? (leftLabel ? HorizontalOrigin.RIGHT : HorizontalOrigin.LEFT) : HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.CENTER,
          showBackground: Boolean(featured),
          backgroundColor: Color.fromCssColorString("#0c171dee"),
          backgroundPadding: new Cartesian2(12, 9),
          scaleByDistance: new NearFarScalar(150, 1, 15000000, featured ? 0.9 : 0.6),
          heightReference: HeightReference.CLAMP_TO_3D_TILE,
          disableDepthTestDistance: 100000,
        },
        billboard: featured ? {
          image: `${import.meta.env.BASE_URL}landing-beacon.svg`,
          color: Color.fromCssColorString(featured.color),
          width: 36,
          height: 36,
          heightReference: HeightReference.CLAMP_TO_3D_TILE,
          disableDepthTestDistance: 100000,
        } : undefined,
        point: featured ? undefined : {
          pixelSize: 9,
          color: Color.fromCssColorString("analysisSiteId" in site ? "#a2ecd3" : "#f3f263"),
          outlineColor: Color.fromCssColorString("#0a1014"),
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_3D_TILE,
          disableDepthTestDistance: 100000,
        },
      });
    }

    controlsRef.current = {
      setView,
      flyToSite,
      setAerialView,
      zoom: (direction) => {
        viewer.camera.cancelFlight();
        const height = viewer.camera.positionCartographic.height;
        const canvas = viewer.scene.canvas;
        const center = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
        const surface = viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(center) : undefined;
        const range = surface ? Cartesian3.distance(viewer.camera.positionWC, surface) : Math.max(height, 100);
        const distance = Math.max(range * 0.22, 10);
        if (direction > 0) {
          viewer.camera.zoomIn(Math.min(distance, Math.max(0, range - 100)));
        } else {
          viewer.camera.zoomOut(Math.min(distance, Math.max(0, 14000000 - height)));
        }
        viewer.scene.requestRender();
      },
    };
    setView("near", false);
    if (initialLocation.current) {
      viewer.camera.setView({destination: lunarPosition(initialLocation.current.longitude, initialLocation.current.latitude, 120000),
        orientation: {heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0}});
      viewer.scene.requestRender();
    }

    let terrainReady = false;
    let usingReference = false;
    let fallbackStarted = false;
    let cancelled = false;
    const interruptFlight = () => viewer.camera.cancelFlight();
    viewer.scene.canvas.addEventListener("pointerdown", interruptFlight);
    viewer.scene.canvas.addEventListener("wheel", interruptFlight, { passive: true });
    const clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((motion: { endPosition: Cartesian2 }) => {
      const id = viewer.scene.pick(motion.endPosition)?.id?.id;
      viewer.scene.canvas.style.cursor = typeof id === "string" && id.startsWith("landing:") ? "pointer" : "grab";
    }, ScreenSpaceEventType.MOUSE_MOVE);
    clickHandler.setInputAction((click: { position: Cartesian2 }) => {
      if (!terrainReady) return;
      const picked = viewer.scene.pick(click.position);
      const id = picked?.id?.id;
      if (typeof id === "string" && id.startsWith("landing:")) {
        flyToSite(id.slice("landing:".length));
        return;
      }
      if (typeof id === "string" && id.startsWith("psr:")) {
        const crater = psrData.craters.find(c => c.name === id.slice(4));
        if (crater) onLocationSelect({latitude: crater.latitude, longitude: crater.longitude, name: crater.name});
        return;
      }
      // Read the rendered terrain depth, so a crater click uses its actual surface.
      const position = usingReference ? viewer.camera.pickEllipsoid(click.position, MOON) : viewer.scene.pickPositionSupported
        ? viewer.scene.pickPosition(click.position)
        : undefined;
      if (!position) return;
      const coordinate = MOON.cartesianToCartographic(position);
      onLocationSelect({
        latitude: CesiumMath.toDegrees(coordinate.latitude),
        longitude: CesiumMath.toDegrees(coordinate.longitude),
      });
    }, ScreenSpaceEventType.LEFT_CLICK);
    viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    async function loadReference() {
      if (cancelled || fallbackStarted) return;
      fallbackStarted = true;
      try {
        const model = await Model.fromGltfAsync({
          url: `${import.meta.env.BASE_URL}nasa-moon.glb`,
          modelMatrix: Matrix4.fromRotationTranslation(Matrix3.fromArray([0, -1, 0, 0, 0, 1, -1, 0, 0])),
          scale: RADIUS / 1.282231258940614, upAxis: Axis.Z, forwardAxis: Axis.X,
        });
        if (cancelled) { model.destroy(); return; }
        viewer.scene.primitives.add(model);
        const ready = () => {
          if (cancelled) return;
          usingReference = true;
          terrainReady = true;
          setReferenceOnly(true);
          setStatus("ready");
          viewer.scene.requestRender();
        };
        model.readyEvent.addEventListener(ready);
        model.errorEvent.addEventListener(() => { if (!cancelled) setStatus("error"); });
        if (model.ready) ready();
        viewer.scene.requestRender();
      } catch { if (!cancelled) setStatus("error"); }
    }

    async function loadTerrain() {
      try {
        const accessToken = await getMoonIonToken();
        if (cancelled) return;
        if (!accessToken) throw new Error("Cesium project token is not configured");
        const resource = await IonResource.fromAssetId(MOON_TERRAIN_ASSET_ID,
          { accessToken },
        );
        if (cancelled) return;
        const terrain = await Cesium3DTileset.fromUrl(resource, {
          enableCollision: true,
          maximumScreenSpaceError: 2,
          dynamicScreenSpaceError: false,
          imageBasedLighting: new ImageBasedLighting(),
        });

        if (cancelled) {
          terrain.destroy();
          return;
        }

        terrain.customShader = new CustomShader({
            lightingModel: LightingModel.UNLIT,
            fragmentShaderText: "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { vec3 normalEC = normalize(cross(dFdx(fsInput.attributes.positionEC), dFdy(fsInput.attributes.positionEC))); material.normalEC = normalEC; float sunlight = max(dot(normalEC, normalize(czm_lightDirectionEC)), 0.0); material.diffuse *= 0.006 + 1.2 * sunlight; }",
          });
        terrain.imageBasedLighting.imageBasedLightingFactor = new Cartesian2(0.03, 0);
        viewer.scene.primitives.add(terrain);
        const ready = () => {
          if (!cancelled) {
            terrainReady = true;
            controller.minimumZoomDistance = 100;
            setStatus("ready");
            viewer.scene.requestRender();
          }
        };
        // Let users explore as soon as a real surface tile is visible; finer tiles keep streaming.
        terrain.tileVisible.addEventListener(() => { if (!terrainReady) ready(); });
        terrain.initialTilesLoaded.addEventListener(ready);
        if (terrain.tilesLoaded) ready();
        terrain.tileFailed.addEventListener((error) => {
          console.error("A lunar terrain tile failed to load", error);
          if (!cancelled && !terrainReady) {
            viewer.scene.primitives.remove(terrain);
            void loadReference();
          }
        });
        viewer.scene.requestRender();
      } catch (error) {
        console.error("Could not load Cesium Moon terrain", error);
        if (!cancelled) void loadReference();
      }
    }

    void loadTerrain();

    return () => {
      cancelled = true;
      controlsRef.current = null;
      sceneRef.current = null;
      clickHandler.destroy();
      viewer.scene.canvas.removeEventListener("pointerdown", interruptFlight);
      viewer.scene.canvas.removeEventListener("wheel", interruptFlight);
      viewer.destroy();
    };
  }, [controlsRef, onLocationSelect, onSiteSelect]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !observationTime) return;
    const abort = new AbortController();
    const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
    // At lat/lon 0, local up/east/north correspond to lunar fixed X/Y/Z.
    // Solar parallax across the Moon is negligible for this global directional light.
    // Debounced: playback changes the time every few hundred ms; only the settled time is requested.
    const timer = window.setTimeout(() => void fetch(`${base}/api/visibility?lat=0&lon=0&time=${encodeURIComponent(observationTime)}`, {signal:abort.signal})
      .then(async response => {
        if (!response.ok) throw new Error("Sun calculation unavailable");
        const data = await response.json() as {sun:{azimuth:number;elevation:number}};
        if (abort.signal.aborted || scene.viewer.isDestroyed()) return;
        const az = CesiumMath.toRadians(data.sun.azimuth), el = CesiumMath.toRadians(data.sun.elevation);
        if (!Number.isFinite(az) || !Number.isFinite(el)) throw new Error("Invalid sunlight direction");
        scene.light.direction = new Cartesian3(-Math.sin(el), -Math.cos(el)*Math.sin(az), -Math.cos(el)*Math.cos(az));
        scene.viewer.clock.currentTime = JulianDate.fromIso8601(observationTime);
        scene.viewer.scene.requestRender();
        setLightingNote(`Sunlight for ${observationTime.replace("T", " ")}`);
      }).catch(() => { if (!abort.signal.aborted) setLightingNote("Sun calculation unavailable; lighting is illustrative."); }), 120);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [observationTime, controlsRef, onLocationSelect, onSiteSelect]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.guides.grid.forEach((entity) => { entity.show = showGrid; });
    scene.psr.forEach(entity => { entity.show = showPsr; });
    scene.guides.axis.forEach((entity) => { entity.show = showAxis; });
    scene.viewer.scene.requestRender();
  }, [showGrid, showAxis, showPsr, controlsRef, onLocationSelect, onSiteSelect]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.point.show = Boolean(selectedLocation) && !moonMapSites.some((site) =>
      site.latitude === selectedLocation?.latitude && site.longitude === selectedLocation?.longitude,
    );
    if (selectedLocation) {
      scene.point.position = new ConstantPositionProperty(
        lunarPosition(selectedLocation.longitude, selectedLocation.latitude),
      );
    }
    scene.viewer.scene.requestRender();
  }, [selectedLocation]);

  return (
    <>
      <div
        ref={containerRef}
        className="moon-map"
        aria-label="Interactive 3D Moon. Drag to rotate, scroll to zoom, and click to select coordinates."
      />
      <p className="map-lighting-note" role="status">{lightingNote}</p>
      {referenceOnly && <p className="map-reference-note" role="status">Reference globe: ion terrain unavailable. Coordinate picking uses the lunar sphere, not measured surface heights.</p>}
      {status !== "ready" && (
        <div className="map-message" role="status">
          <span className="loading-orbit" aria-hidden="true" />
          <strong>{status === "error" ? "The Moon could not load" : "Bringing the Moon into view"}</strong>
          <span>
            {status === "error"
              ? "Check your connection and Cesium ion access, then refresh to retry."
              : "Streaming lunar terrain from Cesium ion…"}
          </span>
        </div>
      )}
    </>
  );
}
