import { useEffect, useRef, useState, type RefObject } from "react";
import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  Color,
  ConstantPositionProperty,
  DirectionalLight,
  HeadingPitchRange,
  HeightReference,
  HorizontalOrigin,
  IonResource,
  LabelStyle,
  JulianDate,
  Matrix4,
  Transforms,
  Math as CesiumMath,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  VerticalOrigin,
  type Entity,
} from "cesium";
import { createMoonGuides, lunarPosition, MOON } from "./moonGuides";
import { featuredMoonSites, moonMapSites, MOON_TERRAIN_ASSET_ID } from "./data/moonMapSites";
import type { VisibilityResponse } from "./types";
import "cesium/Build/Cesium/Widgets/widgets.css";

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
  flyToSite: (id: string) => void;
}

interface MoonMapProps {
  conditions: VisibilityResponse | null;
  onLocationSelect: (location: MoonLocation) => void;
  onSiteSelect: (id: string) => void;
  selectedLocation: MoonLocation | null;
  showGrid: boolean;
  showAxis: boolean;
  controlsRef: RefObject<MoonControls | null>;
}

interface SceneState {
  viewer: Viewer;
  guides: ReturnType<typeof createMoonGuides>;
  point: Entity;
  solarDirection: Cartesian3 | null;
}

export function MoonMap({
  conditions,
  onLocationSelect,
  onSiteSelect,
  selectedLocation,
  showGrid,
  showAxis,
  controlsRef,
}: MoonMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

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
        skyBox: false,
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

    viewer.scene.backgroundColor = Color.fromCssColorString("#0a1014");
    viewer.scene.fog.enabled = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;
    viewer.resolutionScale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    viewer.scene.postProcessStages.fxaa.enabled = true;

    const light = new DirectionalLight({
      direction: new Cartesian3(-1, 0, 0),
      intensity: 2,
    });
    viewer.scene.light = light;

    const removeLightListener = viewer.scene.preRender.addEventListener(() => {
      if (sceneRef.current?.solarDirection) {
        Cartesian3.clone(sceneRef.current.solarDirection, light.direction);
        return;
      }
      const direction = Cartesian3.clone(viewer.camera.directionWC);
      Cartesian3.add(
        direction,
        Cartesian3.multiplyByScalar(viewer.camera.rightWC, 0.45, new Cartesian3()),
        direction,
      );
      Cartesian3.add(
        direction,
        Cartesian3.multiplyByScalar(viewer.camera.upWC, -0.35, new Cartesian3()),
        direction,
      );
      Cartesian3.normalize(direction, light.direction);
    });

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
    sceneRef.current = { viewer, guides, point, solarDirection: null };

    const setView = (name: ViewName = "near", animate = true) => {
      const [longitude, latitude] = VIEWS[name] ?? VIEWS.near;
      const options = {
        destination: lunarPosition(longitude, latitude, 5400000),
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

    const flyToSite = (id: string) => {
      const site = moonMapSites.find((candidate) => candidate.id === id);
      if (!site) return;
      if ("analysisSiteId" in site && site.analysisSiteId) {
        onSiteSelect(site.analysisSiteId);
      } else {
        onLocationSelect({ latitude: site.latitude, longitude: site.longitude, name: site.name });
      }
      viewer.camera.cancelFlight();
      viewer.camera.flyToBoundingSphere(
        new BoundingSphere(lunarPosition(site.longitude, site.latitude), 1),
        {
          offset: new HeadingPitchRange(0, -CesiumMath.PI_OVER_TWO, 70000),
          duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.8,
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

    let terrainReady = false;
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
      // Read the rendered terrain depth, so a crater click uses its actual surface.
      const position = viewer.scene.pickPositionSupported
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

    async function loadTerrain() {
      try {
        const accessToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN?.trim();
        const resource = await IonResource.fromAssetId(MOON_TERRAIN_ASSET_ID,
          accessToken ? { accessToken } : undefined,
        );
        if (cancelled) return;
        const terrain = await Cesium3DTileset.fromUrl(resource, {
          enableCollision: true,
          maximumScreenSpaceError: 8,
        });

        if (cancelled) {
          terrain.destroy();
          return;
        }

        viewer.scene.primitives.add(terrain);
        terrain.initialTilesLoaded.addEventListener(() => {
          if (!cancelled) {
            terrainReady = true;
            setStatus("ready");
            viewer.scene.requestRender();
          }
        });
        terrain.tileFailed.addEventListener((error) => {
          console.error("A lunar terrain tile failed to load", error);
          if (!cancelled && !terrainReady) setStatus("error");
        });
        viewer.scene.requestRender();
      } catch (error) {
        console.error("Could not load Cesium Moon terrain", error);
        if (!cancelled) setStatus("error");
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
      removeLightListener();
      viewer.destroy();
    };
  }, [controlsRef, onLocationSelect, onSiteSelect]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.guides.grid.forEach((entity) => { entity.show = showGrid; });
    scene.guides.axis.forEach((entity) => { entity.show = showAxis; });
    scene.viewer.scene.requestRender();
  }, [showGrid, showAxis]);

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

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (conditions) {
      // Presentation transform only: the backend's azimuth/elevation is authoritative.
      // Cesium light points toward the surface, opposite the observer-to-Sun vector.
      const az = CesiumMath.toRadians(conditions.sun.azimuth);
      const el = CesiumMath.toRadians(conditions.sun.elevation);
      const local = new Cartesian3(Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el));
      const frame = Transforms.eastNorthUpToFixedFrame(lunarPosition(conditions.longitude, conditions.latitude), MOON);
      const world = Matrix4.multiplyByPointAsVector(frame, local, new Cartesian3());
      scene.solarDirection = Cartesian3.negate(Cartesian3.normalize(world, world), world);
      scene.viewer.clock.currentTime = JulianDate.fromIso8601(conditions.time);
    } else scene.solarDirection = null;
    scene.viewer.scene.requestRender();
  }, [conditions]);

  return (
    <>
      <div
        ref={containerRef}
        className="moon-map"
        aria-label="Interactive 3D Moon. Drag to rotate, scroll to zoom, and click to select coordinates."
      />
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
