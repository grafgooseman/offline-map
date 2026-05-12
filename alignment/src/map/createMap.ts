import L from "leaflet";
import type { OverlayAlignment } from "./overlayAlignment";

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

type AlignmentChanged = (alignment: OverlayAlignment) => void;

type MapState = {
  setAlignment(alignment: OverlayAlignment): void;
  setOverlayImage(url: string, alt: string): void;
  setGpsPosition(position: GpsPosition): void;
};

export function createMap(
  elementId: string,
  pack: MapPack,
  initialAlignment: OverlayAlignment,
  onAlignmentChanged: AlignmentChanged
): MapState {
  const map = L.map(elementId, {
    crs: L.CRS.Simple,
    minZoom: -4,
    maxZoom: 4,
    zoomSnap: 0.25,
    attributionControl: false
  });

  const imageBounds = L.latLngBounds([0, 0], [pack.height, pack.width]);
  const baseUrl = `${import.meta.env.BASE_URL}map-packs/${pack.id}/${pack.baseImage}`;

  L.imageOverlay(baseUrl, imageBounds, {
    interactive: false,
    className: "base-image"
  }).addTo(map);

  map.fitBounds(imageBounds);
  map.setMaxBounds(imageBounds.pad(0.25));

  const overlay = new TransformImageOverlay(initialAlignment, onAlignmentChanged);
  overlay.addTo(map);

  const positionMarker = L.circleMarker([0, 0], {
    className: "gps-position",
    radius: 8,
    weight: 3,
    color: "#ffffff",
    fillColor: "#1f8fff",
    fillOpacity: 1
  });

  const accuracyCircle = L.circle([0, 0], {
    className: "gps-accuracy",
    radius: 0,
    weight: 1,
    color: "#1f8fff",
    fillColor: "#1f8fff",
    fillOpacity: 0.16
  });

  return {
    setAlignment(alignment) {
      overlay.setAlignment(alignment);
    },
    setOverlayImage(url, alt) {
      overlay.setImage(url, alt);
    },
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

      map.panTo(point, { animate: true });
    }
  };
}

class TransformImageOverlay extends L.Layer {
  private image?: HTMLImageElement;
  private alignment: OverlayAlignment;
  private readonly onAlignmentChanged: AlignmentChanged;
  private dragging = false;
  private dragStart?: L.Point;
  private startAlignment?: OverlayAlignment;

  constructor(alignment: OverlayAlignment, onAlignmentChanged: AlignmentChanged) {
    super();
    this.alignment = alignment;
    this.onAlignmentChanged = onAlignmentChanged;
  }

  onAdd(map: L.Map): this {
    this._map = map;
    this.image = L.DomUtil.create("img", "compound-overlay");
    this.image.alt = "Image overlay";
    this.image.draggable = false;
    this.image.hidden = true;

    this.image.addEventListener("pointerdown", this.handlePointerDown);
    document.addEventListener("pointermove", this.handlePointerMove);
    document.addEventListener("pointerup", this.handlePointerUp);
    map.on("zoom viewreset move", this.updatePosition, this);

    map.getPanes().overlayPane.appendChild(this.image);
    this.updatePosition();
    return this;
  }

  onRemove(map: L.Map): this {
    if (this.image) {
      this.image.removeEventListener("pointerdown", this.handlePointerDown);
      this.image.remove();
    }

    document.removeEventListener("pointermove", this.handlePointerMove);
    document.removeEventListener("pointerup", this.handlePointerUp);
    map.off("zoom viewreset move", this.updatePosition, this);
    return this;
  }

  setImage(url: string, alt: string): void {
    if (!this.image) {
      return;
    }

    this.image.src = url;
    this.image.alt = alt;
    this.image.hidden = false;
    this.updatePosition();
  }

  setAlignment(alignment: OverlayAlignment): void {
    this.alignment = alignment;
    this.updatePosition();
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.image || this.image.hidden) {
      return;
    }

    event.preventDefault();
    this.dragging = true;
    this.dragStart = L.point(event.clientX, event.clientY);
    this.startAlignment = { ...this.alignment };
    this.image.setPointerCapture(event.pointerId);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragging || !this.dragStart || !this.startAlignment || !this._map) {
      return;
    }

    const current = L.point(event.clientX, event.clientY);
    const startCenter = this._map.latLngToLayerPoint([this.startAlignment.y, this.startAlignment.x]);
    const nextCenter = this._map.layerPointToLatLng(startCenter.add(current.subtract(this.dragStart)));

    this.alignment = {
      ...this.alignment,
      x: nextCenter.lng,
      y: nextCenter.lat
    };
    this.updatePosition();
    this.onAlignmentChanged(this.alignment);
  };

  private handlePointerUp = (): void => {
    this.dragging = false;
  };

  private updatePosition(): void {
    if (!this.image || !this._map || this.image.hidden) {
      return;
    }

    const halfWidth = (this.alignment.width * this.alignment.scale) / 2;
    const halfHeight = (this.alignment.height * this.alignment.scale) / 2;
    const firstCorner = this._map.latLngToLayerPoint([
      this.alignment.y - halfHeight,
      this.alignment.x - halfWidth
    ]);
    const secondCorner = this._map.latLngToLayerPoint([
      this.alignment.y + halfHeight,
      this.alignment.x + halfWidth
    ]);
    const topLeft = L.point(
      Math.min(firstCorner.x, secondCorner.x),
      Math.min(firstCorner.y, secondCorner.y)
    );
    const size = L.point(
      Math.abs(secondCorner.x - firstCorner.x),
      Math.abs(secondCorner.y - firstCorner.y)
    );

    this.image.style.width = `${size.x}px`;
    this.image.style.height = `${size.y}px`;
    this.image.style.opacity = String(this.alignment.opacity);
    this.image.style.transformOrigin = "center";
    this.image.style.transform = `translate3d(${topLeft.x}px, ${topLeft.y}px, 0) rotate(${this.alignment.rotation}deg)`;
  }
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
