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
  navigationGrid?: NavigationGrid;
};

export type NavigationGrid = {
  startColumn: number;
  startRow: number;
  columns: string[];
  rows: string[];
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
  setSatelliteImageEnabled(enabled: boolean): void;
  setOverlayOpacity(opacity: number): void;
  setGridEnabled(enabled: boolean): void;
  setGridOpacity(opacity: number): void;
};

type NavigationGridLabels = {
  setEnabled(enabled: boolean): void;
};

const gridSpacingMeters = 25;

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

  let baseOverlay: L.ImageOverlay | null = null;

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
  const navigationLabels = createNavigationGridLabels(map, pack, gridStepPixels);

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
    setSatelliteImageEnabled(enabled) {
      if (enabled) {
        if (!baseOverlay) {
          baseOverlay = L.imageOverlay(baseUrl, imageBounds, {
            interactive: false,
            className: "base-image"
          });
        }

        if (!map.hasLayer(baseOverlay)) {
          baseOverlay.addTo(map);
          baseOverlay.bringToBack();
        }

        return;
      }

      if (baseOverlay) {
        baseOverlay.removeFrom(map);
        baseOverlay = null;
      }
    },
    setOverlayOpacity(opacity) {
      overlay?.setOpacity(clamp(opacity, 0, 1));
    },
    setGridEnabled(enabled) {
      if (enabled && !map.hasLayer(gridLayer)) {
        gridLayer.addTo(map);
        navigationLabels?.setEnabled(true);
        return;
      }

      if (!enabled && map.hasLayer(gridLayer)) {
        gridLayer.removeFrom(map);
        navigationLabels?.setEnabled(false);
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
    opacity: 1,
    className: "map-grid-line",
    pane: "grid"
  });
}

function createNavigationGridLabels(
  map: L.Map,
  pack: MapPack,
  gridStepPixels: number
): NavigationGridLabels | null {
  const navigationGrid = pack.navigationGrid;
  if (!navigationGrid) {
    return null;
  }

  const layer = document.createElement("div");
  layer.className = "nav-grid-label-layer";
  layer.hidden = true;
  map.getContainer().appendChild(layer);

  const columnLabels = navigationGrid.columns.map((label, index) => {
    const element = createNavigationColumnLabel(label);
    const column = navigationGrid.startColumn + index;
    layer.appendChild(element);

    return { column, element };
  });

  const rowLabels = navigationGrid.rows.map((label, index) => {
    const element = createNavigationRowLabel(label);
    const row = navigationGrid.startRow + index;
    layer.appendChild(element);

    return { row, element };
  });

  const regionLeft = (navigationGrid.startColumn - 1) * gridStepPixels;
  const regionRight = regionLeft + navigationGrid.columns.length * gridStepPixels;
  const regionTop = pack.height - (navigationGrid.startRow - 1) * gridStepPixels;
  const regionBottom = regionTop - navigationGrid.rows.length * gridStepPixels;

  let enabled = false;

  const updateLabels = () => {
    if (!enabled) {
      return;
    }

    const size = map.getSize();
    const regionX = getVisibleRange(getContainerX(map, regionLeft), getContainerX(map, regionRight), size.x);
    const regionY = getVisibleRange(getContainerY(map, regionTop), getContainerY(map, regionBottom), size.y);
    const regionVisible = regionX !== null && regionY !== null;

    columnLabels.forEach(({ column, element }) => {
      const cellLeft = (column - 1) * gridStepPixels;
      const cellRight = column * gridStepPixels;
      const visibleX = getVisibleRange(getContainerX(map, cellLeft), getContainerX(map, cellRight), size.x);

      if (!regionVisible || !visibleX) {
        element.hidden = true;
        return;
      }

      element.hidden = false;
      element.style.left = `${(visibleX.start + visibleX.end) / 2}px`;
    });

    rowLabels.forEach(({ row, element }) => {
      const cellTop = pack.height - (row - 1) * gridStepPixels;
      const cellBottom = cellTop - gridStepPixels;
      const visibleY = getVisibleRange(getContainerY(map, cellTop), getContainerY(map, cellBottom), size.y);

      if (!regionVisible || !visibleY) {
        element.hidden = true;
        return;
      }

      element.hidden = false;
      element.style.top = `${(visibleY.start + visibleY.end) / 2}px`;
    });
  };

  map.on("move zoom resize viewreset", updateLabels);

  return {
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      layer.hidden = !enabled;

      if (enabled) {
        updateLabels();
        return;
      }

      columnLabels.forEach(({ element }) => {
        element.hidden = true;
      });
      rowLabels.forEach(({ element }) => {
        element.hidden = true;
      });
    }
  };
}

function createNavigationColumnLabel(label: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "nav-grid-column-label";
  element.dataset.navGridColumn = label;

  const firstLetter = document.createElement("span");
  firstLetter.className = "nav-grid-label-first";
  firstLetter.textContent = label.charAt(0);

  const rest = document.createElement("span");
  rest.className = "nav-grid-label-rest";
  rest.textContent = label.slice(1);

  element.append(firstLetter, rest);
  return element;
}

function createNavigationRowLabel(label: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "nav-grid-row-label";
  element.dataset.navGridRow = label;
  element.textContent = label;

  return element;
}

function getContainerX(map: L.Map, x: number): number {
  return map.latLngToContainerPoint([0, x]).x;
}

function getContainerY(map: L.Map, y: number): number {
  return map.latLngToContainerPoint([y, 0]).y;
}

function getVisibleRange(
  first: number,
  second: number,
  size: number
): { start: number; end: number } | null {
  const start = clamp(Math.min(first, second), 0, size);
  const end = clamp(Math.max(first, second), 0, size);

  if (end <= start) {
    return null;
  }

  return { start, end };
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
