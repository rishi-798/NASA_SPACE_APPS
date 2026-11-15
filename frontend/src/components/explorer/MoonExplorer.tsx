import { Crosshair, Plus, Selection, Subtract } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { MoonMap, type MoonControls, type MoonLocation } from "../../MoonMap";
import { formatCoordinate } from "../../lib/format";
import type { LandingSite } from "../../types";

type MoonExplorerProps = {
  selectedSite: LandingSite;
  pickedLocation: MoonLocation | null;
  onLocationSelect: (location: MoonLocation | null) => void;
};

export function MoonExplorer({ selectedSite, pickedLocation, onLocationSelect }: MoonExplorerProps) {
  const [showGrid, setShowGrid] = useState(true);
  const [showAxis, setShowAxis] = useState(true);
  const controlsRef = useRef<MoonControls | null>(null);
  const selectedLocation = pickedLocation ?? {
    latitude: selectedSite.latitude,
    longitude: selectedSite.longitude,
  };

  return (
    <section className="moon-explorer moon-explorer-3d" aria-label="Interactive 3D lunar explorer">
      <div className="moon-meta moon-meta-top">
        <span>VISUALIZATION / NASA 3D MODEL</span>
        <span>RISHI / CESIUM</span>
      </div>

      <div className="moon-stage moon-stage-3d" data-moon-stage>
        <MoonMap
          onLocationSelect={onLocationSelect}
          selectedLocation={selectedLocation}
          showGrid={showGrid}
          showAxis={showAxis}
          controlsRef={controlsRef}
        />
      </div>

      <div className="moon-selection-readout" aria-live="polite">
        <span>{pickedLocation ? "SELECTED COORDINATE" : selectedSite.mission}</span>
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
        href="https://svs.gsfc.nasa.gov/14959/"
        target="_blank"
        rel="noreferrer"
      >
        MODEL · NASA GODDARD
      </a>
    </section>
  );
}
