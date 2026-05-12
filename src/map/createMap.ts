import L from "leaflet";

export type GpsBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type MapPack = {
  id: string;
  name: string;
  mode: "image-pixel";
  baseImage: string;
  overlayImage?: string;
  width: number;
  height: number;
  pixelSizeMeters: number;
  projection: string;
  gpsBounds: GpsBounds | null;
  tiles?: Array<{
    file: string;
    westEastingMeters: number;
    southNorthingMeters: number;
  }>;
};

export type GpsPosition = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export type CompassHeading = {
  degrees: number;
};

type MapState = {
  setGpsPosition(position: GpsPosition): void;
  setCompassHeading(heading: CompassHeading | null): void;
  setOverlayOpacity(opacity: number): void;
  setGridEnabled(enabled: boolean): void;
  setGridOpacity(opacity: number): void;
};

const gridSpacingMeters = 10;

export function createMap(elementId: string, pack: MapPack): MapState {
  const map = L.map(elementId, {
    crs: L.CRS.Simple,
    minZoom: -5,
    maxZoom: 5,
    zoomSnap: 0.1,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90,
    inertia: true,
    inertiaDeceleration: 2600,
    inertiaMaxSpeed: 2200,
    touchZoom: true,
    bounceAtZoomLimits: false,
    attributionControl: false
  });

  const imageBounds = L.latLngBounds([0, 0], [pack.height, pack.width]);
  const mapPackBaseUrl = `${import.meta.env.BASE_URL}map-packs/${pack.id}/`;
  const baseUrl = `${mapPackBaseUrl}${pack.baseImage}`;

  L.imageOverlay(baseUrl, imageBounds, {
    interactive: false,
    className: "base-image"
  }).addTo(map);

  const overlay = pack.overlayImage
    ? L.imageOverlay(`${mapPackBaseUrl}${pack.overlayImage}`, imageBounds, {
        interactive: false,
        className: "baked-overlay",
        opacity: 1
      }).addTo(map)
    : null;

  const gridPane = map.createPane("grid");
  gridPane.style.zIndex = "425";
  gridPane.style.pointerEvents = "none";

  const gridLayer = L.layerGroup([], { pane: "grid" });
  const gridLines: L.Polyline[] = [];
  const gridStepPixels = gridSpacingMeters / pack.pixelSizeMeters;
  for (let x = 0; x <= pack.width; x += gridStepPixels) {
    gridLines.push(createGridLine([[0, x], [pack.height, x]]));
  }

  for (let y = 0; y <= pack.height; y += gridStepPixels) {
    gridLines.push(createGridLine([[y, 0], [y, pack.width]]));
  }

  gridLines.forEach((line) => line.addTo(gridLayer));

  map.fitBounds(imageBounds);
  map.setMaxBounds(imageBounds.pad(0.35));

  const positionMarker = L.marker([0, 0], {
    icon: L.divIcon({
      className: "gps-position-icon",
      html: `
        <div class="gps-position">
          <span class="gps-position__heading" aria-hidden="true"></span>
          <span class="gps-position__dot" aria-hidden="true"></span>
        </div>
      `,
      iconAnchor: [22, 22],
      iconSize: [44, 44]
    }),
    interactive: false,
    keyboard: false
  });

  const accuracyCircle = L.circle([0, 0], {
    className: "gps-accuracy",
    radius: 0,
    weight: 1,
    color: "#1f8fff",
    fillColor: "#1f8fff",
    fillOpacity: 0.16
  });

  let compassHeading: CompassHeading | null = null;

  return {
    setGpsPosition(position) {
      if (!pack.gpsBounds) {
        return;
      }

      const point = gpsToImagePoint(position, pack);
      accuracyCircle.setLatLng(point);
      accuracyCircle.setRadius(position.accuracyMeters / pack.pixelSizeMeters);
      positionMarker.setLatLng(point);

      if (!map.hasLayer(accuracyCircle)) {
        accuracyCircle.addTo(map);
      }

      if (!map.hasLayer(positionMarker)) {
        positionMarker.addTo(map);
      }

      applyCompassHeading(positionMarker, compassHeading);
    },
    setCompassHeading(heading) {
      compassHeading = heading ? { degrees: normalizeDegrees(heading.degrees) } : null;
      applyCompassHeading(positionMarker, compassHeading);
    },
    setOverlayOpacity(opacity) {
      overlay?.setOpacity(clamp(opacity, 0, 1));
    },
    setGridEnabled(enabled) {
      if (enabled && !map.hasLayer(gridLayer)) {
        gridLayer.addTo(map);
        return;
      }

      if (!enabled && map.hasLayer(gridLayer)) {
        gridLayer.removeFrom(map);
      }
    },
    setGridOpacity(opacity) {
      const nextOpacity = clamp(opacity, 0, 1);
      gridLines.forEach((line) => {
        line.setStyle({ opacity: nextOpacity });
      });
    }
  };
}

function createGridLine(points: L.LatLngExpression[]): L.Polyline {
  return L.polyline(points, {
    interactive: false,
    color: "#ffffff",
    weight: 1,
    opacity: 0.35,
    className: "map-grid-line",
    pane: "grid"
  });
}

function applyCompassHeading(marker: L.Marker, heading: CompassHeading | null): void {
  const element = marker.getElement();
  const position = element?.querySelector<HTMLElement>(".gps-position");
  if (!position) {
    return;
  }

  if (!heading) {
    position.classList.remove("gps-position--has-heading");
    position.style.removeProperty("--gps-heading");
    return;
  }

  position.classList.add("gps-position--has-heading");
  position.style.setProperty("--gps-heading", `${normalizeDegrees(heading.degrees)}deg`);
}

function gpsToImagePoint(position: GpsPosition, pack: MapPack): L.LatLngExpression {
  const bounds = pack.gpsBounds;
  if (!bounds) {
    return [0, 0];
  }

  const x = ((position.longitude - bounds.west) / (bounds.east - bounds.west)) * pack.width;
  const y = ((bounds.north - position.latitude) / (bounds.north - bounds.south)) * pack.height;

  return [y, x];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}
