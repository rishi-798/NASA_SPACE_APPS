import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Color,
  Ellipsoid,
  type Entity,
  LabelStyle,
  type Viewer,
} from "cesium";

export const MOON = Ellipsoid.MOON;
export const RADIUS = MOON.maximumRadius;

export const lunarPosition = (longitude: number, latitude: number, height = 0) =>
  Cartesian3.fromDegrees(longitude, latitude, height, MOON);

export function createMoonGuides(viewer: Viewer) {
  const grid: Entity[] = [];
  const axis: Entity[] = [];

  const line = (positions: Cartesian3[], color: string, width: number, group: Entity[]) => {
    group.push(viewer.entities.add({
      polyline: {
        positions,
        width,
        material: Color.fromCssColorString(color),
        arcType: ArcType.NONE,
      },
    }));
  };

  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const points: Cartesian3[] = [];
    for (let longitude = -180; longitude <= 180; longitude += 2) {
      points.push(lunarPosition(longitude, latitude, 6000));
    }
    line(points, latitude === 0 ? "#91d4beaa" : "#c0ccd43b", latitude === 0 ? 1.6 : 1, grid);
  }

  for (let longitude = -180; longitude < 180; longitude += 30) {
    const points: Cartesian3[] = [];
    for (let latitude = -90; latitude <= 90; latitude += 2) {
      points.push(lunarPosition(longitude, latitude, 6000));
    }
    line(points, longitude === 0 ? "#dec19ca0" : "#c0ccd43b", longitude === 0 ? 1.6 : 1, grid);
  }

  line(
    [new Cartesian3(0, 0, -RADIUS * 1.28), new Cartesian3(0, 0, RADIUS * 1.28)],
    "#a9dccc",
    2,
    axis,
  );

  for (const [sign, label] of [[1, "N · 90°"], [-1, "S · 90°"]] as const) {
    axis.push(viewer.entities.add({
      position: new Cartesian3(0, 0, sign * RADIUS * 1.3),
      label: {
        text: label,
        font: "12px monospace",
        fillColor: Color.fromCssColorString("#cae7df"),
        outlineColor: Color.fromCssColorString("#091216"),
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cartesian2(0, sign * -12),
      },
    }));
  }

  return { grid, axis };
}
