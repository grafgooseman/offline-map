import { createMap, type CompassHeading, type MapPack } from "./map/createMap";

const mapPackPath = `${import.meta.env.BASE_URL}map-packs/current/map-pack.json`;
const settingsKey = "mobile-mapper.settings";

type Settings = {
  settingsVersion: number;
  satelliteImageEnabled: boolean;
  overlayOpacity: number;
  gridEnabled: boolean;
  gridOpacity: number;
  redFilterEnabled: boolean;
  redFilterStrength: number;
};

type DeviceOrientationPermissionState = "granted" | "denied" | "prompt";

type DeviceOrientationEventWithCompass = DeviceOrientationEvent & {
  webkitCompassAccuracy?: number;
  webkitCompassHeading?: number;
};

type DeviceOrientationEventConstructorWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: (absolute?: boolean) => Promise<DeviceOrientationPermissionState>;
};

type WindowWithOrientation = Window & {
  orientation?: number;
};

type CompassDirection = {
  english: string;
  russian: string;
};

const currentSettingsVersion = 4;

const compassDirections: CompassDirection[] = [
  { english: "N", russian: "С" },
  { english: "NE", russian: "СВ" },
  { english: "E", russian: "В" },
  { english: "SE", russian: "ЮВ" },
  { english: "S", russian: "Ю" },
  { english: "SW", russian: "ЮЗ" },
  { english: "W", russian: "З" },
  { english: "NW", russian: "СЗ" }
];

const defaultSettings: Settings = {
  settingsVersion: currentSettingsVersion,
  satelliteImageEnabled: false,
  overlayOpacity: 1,
  gridEnabled: true,
  gridOpacity: 1,
  redFilterEnabled: false,
  redFilterStrength: 0.8
};

export async function createApp(root: HTMLDivElement | null): Promise<void> {
  if (!root) {
    throw new Error("App root not found.");
  }

  root.innerHTML = `
    <main class="app-shell">
      <section id="map" class="map" aria-label="Ontario image map"></section>
      <button id="settings-button" class="settings-button" type="button" aria-label="Open settings" aria-expanded="false">
        <span aria-hidden="true">⚙</span>
      </button>
      <div class="tracking-status">
        <output id="gps-status" class="gps-status" aria-live="polite"></output>
        <output id="compass-status" class="compass-status" aria-live="polite"></output>
        <button id="compass-enable" class="compass-enable" type="button" hidden>Enable compass</button>
      </div>
      <section id="settings-sheet" class="settings-sheet" aria-label="Settings" hidden>
        <div class="sheet-handle" aria-hidden="true"></div>
        <label class="toggle-row">
          <span>Satellite image</span>
          <input id="satellite-image-enabled" type="checkbox" />
        </label>
        <label id="overlay-opacity-row">
          Overlay opacity
          <input id="overlay-opacity" type="range" min="0" max="1" step="0.01" value="1" />
        </label>
        <label class="toggle-row">
          <span>25 m grid</span>
          <input id="grid-enabled" type="checkbox" />
        </label>
        <label>
          Grid opacity
          <input id="grid-opacity" type="range" min="0" max="1" step="0.01" value="1" />
        </label>
        <label class="toggle-row">
          <span>Red night filter</span>
          <input id="red-filter-enabled" type="checkbox" />
        </label>
        <label>
          Red strength
          <input id="red-filter-strength" type="range" min="0" max="1" step="0.01" value="0.8" />
        </label>
      </section>
      <div id="red-filter" class="red-filter" aria-hidden="true"></div>
    </main>
  `;

  const pack = await fetch(mapPackPath).then((response) => {
    if (!response.ok) {
      throw new Error(`Could not load ${mapPackPath}`);
    }

    return response.json() as Promise<MapPack>;
  });

  const settings = loadSettings();
  const mapState = createMap("map", pack);

  const settingsButton = requireElement<HTMLButtonElement>(root, "#settings-button");
  const settingsSheet = requireElement<HTMLElement>(root, "#settings-sheet");
  const gpsStatus = requireElement<HTMLOutputElement>(root, "#gps-status");
  const compassStatus = requireElement<HTMLOutputElement>(root, "#compass-status");
  const compassEnable = requireElement<HTMLButtonElement>(root, "#compass-enable");
  const satelliteImageEnabled = requireElement<HTMLInputElement>(root, "#satellite-image-enabled");
  const overlayOpacityRow = requireElement<HTMLLabelElement>(root, "#overlay-opacity-row");
  const opacity = requireElement<HTMLInputElement>(root, "#overlay-opacity");
  const gridEnabled = requireElement<HTMLInputElement>(root, "#grid-enabled");
  const gridOpacity = requireElement<HTMLInputElement>(root, "#grid-opacity");
  const redFilterEnabled = requireElement<HTMLInputElement>(root, "#red-filter-enabled");
  const redFilterStrength = requireElement<HTMLInputElement>(root, "#red-filter-strength");

  const syncSettings = () => {
    if (!settings.satelliteImageEnabled) {
      settings.overlayOpacity = 1;
    }

    satelliteImageEnabled.checked = settings.satelliteImageEnabled;
    overlayOpacityRow.hidden = !settings.satelliteImageEnabled;
    opacity.value = String(settings.overlayOpacity);
    gridEnabled.checked = settings.gridEnabled;
    gridOpacity.value = String(settings.gridOpacity);
    redFilterEnabled.checked = settings.redFilterEnabled;
    redFilterStrength.value = String(settings.redFilterStrength);
    mapState.setSatelliteImageEnabled(settings.satelliteImageEnabled);
    mapState.setOverlayOpacity(settings.satelliteImageEnabled ? settings.overlayOpacity : 1);
    mapState.setGridEnabled(settings.gridEnabled);
    mapState.setGridOpacity(settings.gridOpacity);
    root.style.setProperty("--red-filter-strength", String(settings.redFilterStrength));
    root.classList.toggle("night-filter-enabled", settings.redFilterEnabled);
    saveSettings(settings);
  };

  const setSettingsOpen = (open: boolean) => {
    settingsSheet.hidden = !open;
    settingsButton.setAttribute("aria-expanded", String(open));
  };

  settingsButton.addEventListener("click", () => {
    setSettingsOpen(settingsSheet.hidden);
  });

  root.addEventListener(
    "pointerdown",
    (event) => {
      if (settingsSheet.hidden || !(event.target instanceof Node)) {
        return;
      }

      if (settingsSheet.contains(event.target) || settingsButton.contains(event.target)) {
        return;
      }

      setSettingsOpen(false);
    },
    { capture: true }
  );

  satelliteImageEnabled.addEventListener("change", () => {
    settings.satelliteImageEnabled = satelliteImageEnabled.checked;
    syncSettings();
  });

  opacity.addEventListener("input", () => {
    settings.overlayOpacity = Number(opacity.value);
    syncSettings();
  });

  gridEnabled.addEventListener("change", () => {
    settings.gridEnabled = gridEnabled.checked;
    syncSettings();
  });

  gridOpacity.addEventListener("input", () => {
    settings.gridOpacity = Number(gridOpacity.value);
    syncSettings();
  });

  redFilterEnabled.addEventListener("change", () => {
    settings.redFilterEnabled = redFilterEnabled.checked;
    syncSettings();
  });

  redFilterStrength.addEventListener("input", () => {
    settings.redFilterStrength = Number(redFilterStrength.value);
    syncSettings();
  });

  syncSettings();
  startGps(mapState, pack, gpsStatus);
  startCompass(mapState, compassStatus, compassEnable);
}

function startGps(
  mapState: ReturnType<typeof createMap>,
  pack: MapPack,
  gpsStatus: HTMLOutputElement
): void {
  if (!navigator.geolocation) {
    gpsStatus.value = "GPS unavailable";
    return;
  }

  if (!pack.gpsBounds) {
    gpsStatus.value = "Map GPS bounds missing";
    return;
  }

  gpsStatus.value = "Requesting GPS";
  navigator.geolocation.watchPosition(
    (position) => {
      mapState.setGpsPosition({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy
      });
      gpsStatus.value = "";
    },
    (error) => {
      gpsStatus.value = error.message;
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000
    }
  );
}

function startCompass(
  mapState: ReturnType<typeof createMap>,
  compassStatus: HTMLOutputElement,
  compassEnable: HTMLButtonElement
): void {
  const OrientationEvent = globalThis.DeviceOrientationEvent as
    | DeviceOrientationEventConstructorWithPermission
    | undefined;

  if (!OrientationEvent) {
    compassStatus.value = "Compass unavailable";
    mapState.setCompassHeading(null);
    return;
  }

  let listening = false;
  let headingSeen = false;
  let rawCompassHeading: CompassHeading | null = null;
  let unavailableTimer: number | undefined;

  const applyHeading = () => {
    if (!rawCompassHeading) {
      return;
    }

    const heading = {
      degrees: normalizeDegrees(rawCompassHeading.degrees + getScreenOrientationAngle())
    };
    mapState.setCompassHeading(heading);
    compassStatus.value = formatCompassHeading(heading.degrees);
  };

  const handleOrientation = (event: Event) => {
    rawCompassHeading = getCompassHeading(event);
    if (!rawCompassHeading) {
      return;
    }

    headingSeen = true;
    if (unavailableTimer !== undefined) {
      window.clearTimeout(unavailableTimer);
      unavailableTimer = undefined;
    }

    applyHeading();
  };

  const registerListeners = () => {
    if (listening) {
      return;
    }

    listening = true;
    window.addEventListener("deviceorientationabsolute", handleOrientation);
    window.addEventListener("deviceorientation", handleOrientation);
    screen.orientation?.addEventListener("change", applyHeading);
    window.addEventListener("orientationchange", applyHeading);
    unavailableTimer = window.setTimeout(() => {
      if (!headingSeen) {
        mapState.setCompassHeading(null);
        compassStatus.value = "Compass unavailable";
      }
    }, 3000);
  };

  if (typeof OrientationEvent.requestPermission === "function") {
    compassEnable.hidden = false;

    const requestCompassPermission = async (automatic: boolean) => {
      compassEnable.disabled = true;
      compassStatus.value = "Requesting compass";

      try {
        const permission = await OrientationEvent.requestPermission?.(true);
        if (permission === "granted") {
          compassEnable.hidden = true;
          compassStatus.value = "";
          registerListeners();
          return;
        }

        mapState.setCompassHeading(null);
        compassStatus.value = permission === "prompt" ? "Tap to enable compass" : "Compass denied";
      } catch {
        mapState.setCompassHeading(null);
        compassStatus.value = automatic ? "Tap to enable compass" : "Compass unavailable";
      } finally {
        if (!compassEnable.hidden) {
          compassEnable.disabled = false;
        }
      }
    };

    compassEnable.addEventListener("click", () => {
      void requestCompassPermission(false);
    });
    void requestCompassPermission(true);
    return;
  }

  registerListeners();
}

function getCompassHeading(event: Event): CompassHeading | null {
  const orientation = event as DeviceOrientationEventWithCompass;
  const webkitHeading = orientation.webkitCompassHeading;
  if (typeof webkitHeading === "number" && Number.isFinite(webkitHeading)) {
    return { degrees: normalizeDegrees(webkitHeading) };
  }

  const alpha = orientation.alpha;
  if (orientation.absolute === true && typeof alpha === "number" && Number.isFinite(alpha)) {
    return { degrees: normalizeDegrees(360 - alpha) };
  }

  return null;
}

function formatCompassHeading(degrees: number): string {
  const direction = getCompassDirection(degrees);
  return `${Math.round(degrees)}\u00b0 ${direction.english} (${direction.russian})`;
}

function getCompassDirection(degrees: number): CompassDirection {
  const index = Math.round(normalizeDegrees(degrees) / 45) % compassDirections.length;
  return compassDirections[index];
}

function getScreenOrientationAngle(): number {
  const orientationAngle = screen.orientation?.angle;
  if (typeof orientationAngle === "number" && Number.isFinite(orientationAngle)) {
    return orientationAngle;
  }

  const legacyOrientation = (window as WindowWithOrientation).orientation;
  if (typeof legacyOrientation === "number" && Number.isFinite(legacyOrientation)) {
    return legacyOrientation;
  }

  return 0;
}

function loadSettings(): Settings {
  const raw = localStorage.getItem(settingsKey);
  if (!raw) {
    return { ...defaultSettings };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const isCurrentSettings = parsed.settingsVersion === currentSettingsVersion;
    return {
      settingsVersion: currentSettingsVersion,
      satelliteImageEnabled: isCurrentSettings
        ? (parsed.satelliteImageEnabled ?? defaultSettings.satelliteImageEnabled)
        : false,
      overlayOpacity: isCurrentSettings
        ? clamp(parsed.overlayOpacity ?? defaultSettings.overlayOpacity, 0, 1)
        : 1,
      gridEnabled: isCurrentSettings ? (parsed.gridEnabled ?? defaultSettings.gridEnabled) : true,
      gridOpacity: isCurrentSettings
        ? clamp(parsed.gridOpacity ?? defaultSettings.gridOpacity, 0, 1)
        : defaultSettings.gridOpacity,
      redFilterEnabled: parsed.redFilterEnabled ?? defaultSettings.redFilterEnabled,
      redFilterStrength: clamp(parsed.redFilterStrength ?? defaultSettings.redFilterStrength, 0, 1)
    };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(settings: Settings): void {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element ${selector}`);
  }

  return element;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}
