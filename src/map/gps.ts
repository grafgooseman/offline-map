import proj4 from "proj4";
import type { GpsMapPosition, GpsPosition, MapPack } from "./mapPack";

export function createGpsProjector(pack: MapPack): (position: GpsPosition) => GpsMapPosition {
  const reference = pack.georeference;
  if (
    !reference?.projection ||
    !Number.isFinite(reference.westEastingMeters) ||
    !Number.isFinite(reference.southNorthingMeters) ||
    !Number.isFinite(pack.pixelSizeMeters) || pack.pixelSizeMeters <= 0 ||
    !Number.isFinite(pack.width) || pack.width <= 0 ||
    !Number.isFinite(pack.height) || pack.height <= 0
  ) {
    throw new Error("Map GPS georeference missing or invalid");
  }

  // This projection is bundled locally. No network request is needed for GPS.
  const transform = proj4("EPSG:4326", reference.projection);

  return (position) => {
    if (
      !Number.isFinite(position.latitude) || Math.abs(position.latitude) > 90 ||
      !Number.isFinite(position.longitude) || Math.abs(position.longitude) > 180 ||
      !Number.isFinite(position.accuracyMeters) || position.accuracyMeters < 0
    ) {
      throw new Error("Invalid GPS position");
    }

    // Proj4 takes [longitude, latitude]; Leaflet takes [northing, easting].
    const [easting, northing] = transform.forward([position.longitude, position.latitude]);
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
      throw new Error("GPS position could not be projected");
    }
    const x = (easting - reference.westEastingMeters) / pack.pixelSizeMeters;
    const y = (northing - reference.southNorthingMeters) / pack.pixelSizeMeters;

    // CRS.Simple Y increases upward from the SOUTH edge, unlike image rows.
    // Allow a fraction of a pixel for floating-point error at the tile edges.
    const tolerance = 0.01;
    return {
      point: [y, x],
      easting,
      northing,
      inside: x >= -tolerance && y >= -tolerance &&
        x <= pack.width + tolerance && y <= pack.height + tolerance
    };
  };
}
