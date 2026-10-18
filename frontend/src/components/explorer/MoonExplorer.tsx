import { Crosshair, Plus, Selection, Subtract } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { MoonMap, type MoonControls, type MoonLocation } from "../../MoonMap";
import { formatCoordinate } from "../../lib/format";
import type { LandingSite } from "../../types";
import { featuredMoonSites, moonMapSites } from "../../data/moonMapSites";

type MoonExplorerProps = {
  observationTime: string | null;
  selectedSite: LandingSite;
  pickedLocation: MoonLocation | null;
  onLocationSelect: (location: MoonLocation | null) => void;
  onSiteSelect: (id: string) => void;
};

export function MoonExplorer({ selectedSite, pickedLocation, onLocationSelect, onSiteSelect, observationTime }: MoonExplorerProps) {
  const [showGrid, setShowGrid] = useState(false);
  const [showAxis, setShowAxis] = useState(false);
  const controlsRef = useRef<MoonControls | null>(null);
  const selectedLocation = pickedLocation ?? {
    latitude: selectedSite.latitude,
    longitude: selectedSite.longitude,
  };

  return (
    <section className="moon-explorer moon-explorer-3d" aria-label="Interactive 3D lunar explorer">
      <div className="moon-meta moon-meta-top">
        <span>VISUALIZATION / LUNAR 3D TERRAIN</span>
        <span>RISHI / CESIUM</span>
      </div>

      <div className="moon-stage moon-stage-3d" data-moon-stage>
        <MoonMap
          onLocationSelect={onLocationSelect}
          onSiteSelect={onSiteSelect}
          selectedLocation={selectedLocation}
          showGrid={showGrid}
          showAxis={showAxis}
          controlsRef={controlsRef}
          observationTime={observationTime}
        />
      </div>

      <div className="moon-selection-readout" aria-live="polite">
        <span>{pickedLocation ? pickedLocation.name ?? "SELECTED COORDINATE" : selectedSite.mission}</span>
        <strong>
          {formatCoordinate(selectedLocation.latitude, "lat")} / {formatCoordinate(selectedLocation.longitude, "lon")}
        </strong>
      </div>

      <div className="moon-guide-controls" aria-label="Lunar map guides">
        <button
          type="button"
          aria-pressed={showGrid}
          onClick={() => setShowGrid((visible) => !visible)}
        >
          GRID
        </button>
        <button
          type="button"
          aria-pressed={showAxis}
          onClick={() => setShowAxis((visible) => !visible)}
        >
          AXIS
        </button>
      </div>

      <select
        className="moon-site-picker"
        aria-label="Fly to landing site"
        value=""
        onChange={(event) => controlsRef.current?.flyToSite(event.target.value)}
      >
        <option value="" disabled>Explore landing sites…</option>
        <optgroup label="Featured missions">
          {featuredMoonSites.map((site) => (
            <option key={site.id} value={site.id}>{site.name} · {site.mission}</option>
          ))}
        </optgroup>
        <optgroup label="Cesium landing sites">
          {moonMapSites.filter((site) => !featuredMoonSites.some((featured) => featured.id === site.id)).map((site) => (
            <option key={site.id} value={site.id}>{site.name}</option>
          ))}
        </optgroup>
      </select>

      <div className="moon-toolrail" aria-label="Map tools">
        <button type="button" aria-label="Zoom in" onClick={() => controlsRef.current?.zoom(1)}>
          <Plus />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => controlsRef.current?.zoom(-1)}>
          <Subtract />
        </button>
        <button
          type="button"
          aria-label="Reset to near side"
          onClick={() => {
            onLocationSelect(null);
            controlsRef.current?.setView("near");
          }}
        >
          <Crosshair />
        </button>
      </div>

      <div className="moon-footnote">
        <Selection aria-hidden="true" />
        <span>DRAG TO ORBIT · SCROLL TO ZOOM · CLICK TO SELECT</span>
      </div>
      <a
        className="moon-credit"
        href="https://sandcastle.cesium.com/standalone.html?id=moon"
        target="_blank"
        rel="noreferrer"
      >
        TERRAIN · NASA / USGS · CESIUM
      </a>
    </section>
  );
}
