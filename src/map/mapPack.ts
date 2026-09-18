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
  georeference?: {
    projection: string;
    westEastingMeters: number;
    southNorthingMeters: number;
  };
  // Geographic envelope for reference only; never interpolate GPS against it.
  gpsBounds?: { north: number; south: number; east: number; west: number };
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

export type GpsMapPosition = {
  point: [number, number];
  easting: number;
  northing: number;
  inside: boolean;
};
