import type { GpsMapPosition } from "../map/mapPack";

// Loaded only by the dev server with ?gpsDebug=1. Never uses the device location.
export function createGpsDebug() {
  let success: PositionCallback | undefined;
  let failure: PositionErrorCallback | null | undefined;
  const panel = document.createElement("details");
  panel.open = true;
  panel.style.cssText = "position:fixed;bottom:12px;left:12px;z-index:2000;background:#fff;color:#111;padding:12px;border-radius:8px;max-width:calc(100vw - 24px);max-height:60vh;overflow:auto;font:14px system-ui;user-select:text";
  panel.innerHTML = `
    <summary>GPS test — simulated location</summary>
    <form style="display:grid;gap:8px;margin-top:12px">
      <label>Latitude <input name="latitude" type="number" step="any" min="-90" max="90" value="44.80246330430531" required></label>
      <label>Longitude <input name="longitude" type="number" step="any" min="-180" max="180" value="-78.6038691958595" required></label>
      <label>Accuracy (m) <input name="accuracy" type="number" min="0" step="any" value="5" required></label>
      <label>Fix age (seconds) <input name="age" type="number" min="0" value="0" required></label>
      <button type="submit">Apply GPS position</button>
      <button type="button" id="gps-test-error">Simulate unavailable GPS</button>
    </form>
    <pre aria-label="GPS diagnostics" style="white-space:pre-wrap;margin-bottom:0">Apply a position to begin.</pre>
  `;
  document.body.appendChild(panel);
  const form = panel.querySelector("form")!;
  const diagnostics = panel.querySelector("pre")!;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const latitude = Number(data.get("latitude"));
    const longitude = Number(data.get("longitude"));
    const accuracy = Number(data.get("accuracy"));
    const timestamp = Date.now() - Number(data.get("age")) * 1000;
    diagnostics.textContent = `Input: ${latitude}, ${longitude}\nAccuracy: ${accuracy} m · fix age: ${data.get("age")} s`;
    const coords = { latitude, longitude, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON() { return { latitude, longitude, accuracy }; } };
    success?.({ coords, timestamp, toJSON() { return { coords, timestamp }; } });
  });
  panel.querySelector("#gps-test-error")!.addEventListener("click", () => {
    diagnostics.textContent = "Simulated GPS unavailable";
    failure?.({ code: 2, message: "GPS unavailable (simulated)", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  });

  return {
    geolocation: {
      watchPosition(onSuccess: PositionCallback, onError?: PositionErrorCallback | null) {
        success = onSuccess;
        failure = onError;
        return 1;
      },
      clearWatch() { success = undefined; failure = undefined; }
    },
    report(position: GeolocationPosition, projected: GpsMapPosition) {
      diagnostics.textContent = [
        `GPS: ${position.coords.latitude}, ${position.coords.longitude}`,
        `Accuracy: ${position.coords.accuracy} m · fix age: ${Math.max(0, Date.now() - position.timestamp)} ms`,
        `UTM E,N: ${projected.easting.toFixed(3)}, ${projected.northing.toFixed(3)}`,
        `Map Y,X: ${projected.point.map((v) => v.toFixed(3)).join(", ")}`,
        projected.inside ? "Inside map" : "Outside map"
      ].join("\n");
    }
  };
}
