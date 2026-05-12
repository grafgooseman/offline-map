import L from "leaflet";
import type { OverlayAlignment } from "./overlayAlignment";

export type MapPack = {
  id: string;
  name: string;
  mode: "image-pixel";
  baseImage: string;
  overlayImage: string;
  width: number;
  height: number;
  pixelSizeMeters: number;
  projection: string;
  defaultOverlay: OverlayAlignment;
};

type AlignmentChanged = (alignment: OverlayAlignment) => void;

type OverlayState = {
  setAlignment(alignment: OverlayAlignment): void;
};

export function createMap(
  elementId: string,
  pack: MapPack,
  initialAlignment: OverlayAlignment,
  onAlignmentChanged: AlignmentChanged
): OverlayState {
  const map = L.map(elementId, {
    crs: L.CRS.Simple,
    minZoom: -4,
    maxZoom: 4,
    zoomSnap: 0.25,
    attributionControl: false
  });

  const bounds = L.latLngBounds([0, 0], [pack.height, pack.width]);
  const baseUrl = `/map-packs/${pack.id}/${pack.baseImage}`;
  const overlayUrl = `/map-packs/${pack.id}/${pack.overlayImage}`;

  L.imageOverlay(baseUrl, bounds, {
    interactive: false,
    className: "base-image"
  }).addTo(map);

  map.fitBounds(bounds);
  map.setMaxBounds(bounds.pad(0.25));

  const overlay = new TransformImageOverlay(overlayUrl, initialAlignment, onAlignmentChanged);
  overlay.addTo(map);

  return {
    setAlignment(alignment) {
      overlay.setAlignment(alignment);
    }
  };
}

class TransformImageOverlay extends L.Layer {
  private image?: HTMLImageElement;
  private readonly url: string;
  private alignment: OverlayAlignment;
  private readonly onAlignmentChanged: AlignmentChanged;
  private dragging = false;
  private dragStart?: L.Point;
  private startAlignment?: OverlayAlignment;

  constructor(url: string, alignment: OverlayAlignment, onAlignmentChanged: AlignmentChanged) {
    super();
    this.url = url;
    this.alignment = alignment;
    this.onAlignmentChanged = onAlignmentChanged;
  }

  onAdd(map: L.Map): this {
    this._map = map;
    this.image = L.DomUtil.create("img", "compound-overlay");
    this.image.src = this.url;
    this.image.alt = "Compound overlay";
    this.image.draggable = false;

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

  setAlignment(alignment: OverlayAlignment): void {
    this.alignment = alignment;
    this.updatePosition();
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.image) {
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
    if (!this.image || !this._map) {
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
