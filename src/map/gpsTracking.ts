import type { GpsMapPosition, GpsPosition } from "./mapPack";

export const gpsStaleAfterMs = 30_000;

type TrackingCallbacks = {
  setPosition(position: GpsPosition | null): GpsMapPosition | null;
  setStatus(message: string): void;
  report?(position: GeolocationPosition, projected: GpsMapPosition): void;
};

export function createGpsTracker(callbacks: TrackingCallbacks) {
  let lastTimestamp: number | null = null;

  const fail = (message: string) => {
    lastTimestamp = null;
    callbacks.setPosition(null);
    callbacks.setStatus(message);
  };

  return {
    fail,
    receive(position: GeolocationPosition, now = Date.now()) {
      if (!Number.isFinite(position.timestamp) || now - position.timestamp > gpsStaleAfterMs) {
        fail("GPS signal stale — waiting for a fresh position");
        return;
      }
      try {
        const projected = callbacks.setPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy
        });
        if (!projected) {
          fail("Map GPS georeference missing");
          return;
        }
        lastTimestamp = position.timestamp;
        const accuracy = `GPS ±${Math.round(position.coords.accuracy)} m`;
        callbacks.setStatus(projected.inside ? accuracy : `Outside this map · ${accuracy}`);
        callbacks.report?.(position, projected);
      } catch (error) {
        fail(error instanceof Error ? error.message : "Invalid GPS position");
      }
    },
    checkFreshness(now = Date.now()) {
      if (lastTimestamp !== null && now - lastTimestamp > gpsStaleAfterMs) {
        fail("GPS signal stale — waiting for a fresh position");
      }
    }
  };
}
