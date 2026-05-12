import { createMap, type MapPack } from "./map/createMap";
import {
  clampAlignment,
  loadAlignment,
  saveAlignment,
  type OverlayAlignment
} from "./map/overlayAlignment";

const mapPackPath = "/map-packs/coop-sample/map-pack.json";

export async function createApp(root: HTMLDivElement | null): Promise<void> {
  if (!root) {
    throw new Error("App root not found.");
  }

  root.innerHTML = `
    <main class="app-shell">
      <section class="toolbar" aria-label="Overlay controls">
        <div class="toolbar__title">
          <span>Offline mapper</span>
          <small id="pack-name">loading map pack</small>
        </div>
        <label>
          Opacity
          <input id="opacity" type="range" min="0" max="1" step="0.01" value="0.65" />
        </label>
        <label>
          Scale
          <input id="scale" type="range" min="0.1" max="4" step="0.01" value="1" />
        </label>
        <label>
          Rotate
          <input id="rotation" type="range" min="-180" max="180" step="0.1" value="0" />
        </label>
        <div class="button-row">
          <button id="reset" type="button">Reset</button>
          <button id="export" type="button">Export JSON</button>
        </div>
        <output id="status" aria-live="polite"></output>
      </section>
      <section id="map" class="map" aria-label="Offline image map"></section>
    </main>
  `;

  const pack = await fetch(mapPackPath).then((response) => {
    if (!response.ok) {
      throw new Error(`Could not load ${mapPackPath}`);
    }

    return response.json() as Promise<MapPack>;
  });

  const stored = loadAlignment(pack.id);
  let alignment = clampAlignment(stored ?? pack.defaultOverlay);

  const opacity = root.querySelector<HTMLInputElement>("#opacity");
  const scale = root.querySelector<HTMLInputElement>("#scale");
  const rotation = root.querySelector<HTMLInputElement>("#rotation");
  const reset = root.querySelector<HTMLButtonElement>("#reset");
  const exportButton = root.querySelector<HTMLButtonElement>("#export");
  const packName = root.querySelector<HTMLElement>("#pack-name");
  const status = root.querySelector<HTMLOutputElement>("#status");

  if (!opacity || !scale || !rotation || !reset || !exportButton || !packName || !status) {
    throw new Error("Control markup did not render.");
  }

  packName.textContent = `${pack.name} (${pack.width} x ${pack.height})`;

  const mapState = createMap("map", pack, alignment, (nextAlignment) => {
    alignment = clampAlignment(nextAlignment);
    syncControls();
    persist("saved");
  });

  const syncControls = () => {
    opacity.value = String(alignment.opacity);
    scale.value = String(alignment.scale);
    rotation.value = String(alignment.rotation);
    status.value = `x ${Math.round(alignment.x)}, y ${Math.round(alignment.y)}`;
  };

  const applyFromControls = () => {
    alignment = clampAlignment({
      ...alignment,
      opacity: Number(opacity.value),
      scale: Number(scale.value),
      rotation: Number(rotation.value)
    });
    mapState.setAlignment(alignment);
    persist("saved");
  };

  const persist = (message: string) => {
    saveAlignment(pack.id, alignment);
    status.value = `${message}: x ${Math.round(alignment.x)}, y ${Math.round(alignment.y)}`;
  };

  opacity.addEventListener("input", applyFromControls);
  scale.addEventListener("input", applyFromControls);
  rotation.addEventListener("input", applyFromControls);

  reset.addEventListener("click", () => {
    alignment = clampAlignment(pack.defaultOverlay);
    mapState.setAlignment(alignment);
    syncControls();
    persist("reset");
  });

  exportButton.addEventListener("click", async () => {
    const json = JSON.stringify(alignment, null, 2);
    const blobUrl = URL.createObjectURL(new Blob([`${json}\n`], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `${pack.id}-alignment.json`;
    link.click();
    URL.revokeObjectURL(blobUrl);

    try {
      await navigator.clipboard.writeText(json);
      status.value = "alignment json downloaded and copied";
    } catch {
      status.value = "alignment json downloaded";
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) {
      return;
    }

    const step = event.shiftKey ? 10 : 1;
    const movements: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0]
    };
    const move = movements[event.key];
    if (!move) {
      return;
    }

    event.preventDefault();
    alignment = clampAlignment({
      ...alignment,
      x: alignment.x + move[0],
      y: alignment.y + move[1]
    });
    mapState.setAlignment(alignment);
    syncControls();
    persist("nudged");
  });

  syncControls();
}
