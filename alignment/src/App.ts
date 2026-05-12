import { createMap, type MapPack } from "./map/createMap";
import {
  clampAlignment,
  loadAlignment,
  saveAlignment,
  type OverlayAlignment
} from "./map/overlayAlignment";

const mapPackPath = `${import.meta.env.BASE_URL}map-packs/current/map-pack.json`;
const overlayImagePath = `${import.meta.env.BASE_URL}map-packs/current/Compound_NoFlag3.webp`;

export async function createApp(root: HTMLDivElement | null): Promise<void> {
  if (!root) {
    throw new Error("App root not found.");
  }

  root.innerHTML = `
    <main class="app-shell">
      <section class="toolbar" aria-label="Overlay controls">
        <div class="toolbar__title">
          <span>Overlay alignment</span>
          <small id="pack-name">loading map pack</small>
        </div>
        <div class="number-grid">
          <label>
            X center
            <input id="x-value" type="number" step="0.01" />
          </label>
          <label>
            Y center
            <input id="y-value" type="number" step="0.01" />
          </label>
        </div>
        <label>
          Opacity
          <input id="opacity" type="range" min="0" max="1" step="0.01" value="0.65" />
        </label>
        <label>
          Scale
          <span class="precision-control">
            <input id="scale" type="range" min="0.1" max="4" step="0.0001" value="1" />
            <input id="scale-value" type="number" min="0.1" max="4" step="0.0001" value="1" />
          </span>
        </label>
        <label>
          Rotate
          <span class="precision-control">
            <input id="rotation" type="range" min="-180" max="180" step="0.001" value="0" />
            <input id="rotation-value" type="number" min="-180" max="180" step="0.001" value="0" />
          </span>
        </label>
        <div class="button-row">
          <button id="reset" type="button">Reset</button>
          <button id="save" type="button">Save</button>
        </div>
        <button id="bake" type="button">Generate baked overlay</button>
        <output id="status" aria-live="polite"></output>
      </section>
      <section id="map" class="map" aria-label="Overlay alignment map"></section>
    </main>
  `;

  const pack = await fetch(mapPackPath).then((response) => {
    if (!response.ok) {
      throw new Error(`Could not load ${mapPackPath}`);
    }

    return response.json() as Promise<MapPack>;
  });

  const overlaySize = await readImageSize(overlayImagePath);
  const stored = loadAlignment(pack.id);
  let alignment = clampAlignment({
    ...(stored ?? createDefaultAlignment(pack, overlaySize)),
    width: overlaySize.width,
    height: overlaySize.height
  });

  const xValue = requireElement<HTMLInputElement>(root, "#x-value");
  const yValue = requireElement<HTMLInputElement>(root, "#y-value");
  const opacity = requireElement<HTMLInputElement>(root, "#opacity");
  const scale = requireElement<HTMLInputElement>(root, "#scale");
  const scaleValue = requireElement<HTMLInputElement>(root, "#scale-value");
  const rotation = requireElement<HTMLInputElement>(root, "#rotation");
  const rotationValue = requireElement<HTMLInputElement>(root, "#rotation-value");
  const reset = requireElement<HTMLButtonElement>(root, "#reset");
  const saveButton = requireElement<HTMLButtonElement>(root, "#save");
  const bakeButton = requireElement<HTMLButtonElement>(root, "#bake");
  const packName = requireElement<HTMLElement>(root, "#pack-name");
  const status = requireElement<HTMLOutputElement>(root, "#status");

  packName.textContent = `${pack.name} (${pack.width} x ${pack.height})`;

  const mapState = createMap("map", pack, alignment, (nextAlignment) => {
    alignment = clampAlignment(nextAlignment);
    syncControls();
    persist("saved");
  });

  mapState.setOverlayImage(overlayImagePath, "Compound_NoFlag3.webp");
  mapState.setAlignment(alignment);

  const syncControls = () => {
    xValue.value = alignment.x.toFixed(2);
    yValue.value = alignment.y.toFixed(2);
    opacity.value = String(alignment.opacity);
    scale.value = alignment.scale.toFixed(4);
    scaleValue.value = alignment.scale.toFixed(4);
    rotation.value = alignment.rotation.toFixed(3);
    rotationValue.value = alignment.rotation.toFixed(3);
    status.value = `x ${Math.round(alignment.x)}, y ${Math.round(alignment.y)}`;
  };

  const applyFromControls = (
    source?: "scale-slider" | "scale-number" | "rotation-slider" | "rotation-number"
  ) => {
    if (source === "scale-slider") {
      scaleValue.value = scale.value;
    }

    if (source === "scale-number") {
      scale.value = scaleValue.value;
    }

    if (source === "rotation-slider") {
      rotationValue.value = rotation.value;
    }

    if (source === "rotation-number") {
      rotation.value = rotationValue.value;
    }

    alignment = clampAlignment({
      ...alignment,
      x: Number(xValue.value),
      y: Number(yValue.value),
      opacity: Number(opacity.value),
      scale: Number(source === "scale-number" ? scaleValue.value : scale.value),
      rotation: Number(source === "rotation-number" ? rotationValue.value : rotation.value)
    });
    mapState.setAlignment(alignment);
    persist("saved");
  };

  const persist = (message: string) => {
    saveAlignment(pack.id, alignment);
    status.value = `${message}: x ${Math.round(alignment.x)}, y ${Math.round(alignment.y)}`;
  };

  xValue.addEventListener("input", () => applyFromControls());
  yValue.addEventListener("input", () => applyFromControls());
  opacity.addEventListener("input", () => applyFromControls());
  scale.addEventListener("input", () => applyFromControls("scale-slider"));
  scaleValue.addEventListener("input", () => applyFromControls("scale-number"));
  rotation.addEventListener("input", () => applyFromControls("rotation-slider"));
  rotationValue.addEventListener("input", () => applyFromControls("rotation-number"));

  reset.addEventListener("click", () => {
    alignment = clampAlignment(createDefaultAlignment(pack, overlaySize));
    mapState.setAlignment(alignment);
    syncControls();
    persist("reset");
  });

  saveButton.addEventListener("click", async () => {
    const savedAlignment = {
      x: alignment.x,
      y: alignment.y,
      width: alignment.width,
      height: alignment.height,
      scale: alignment.scale,
      rotation: alignment.rotation
    };

    saveButton.disabled = true;
    status.value = "saving public/alignment.json";
    try {
      const response = await fetch("/api/save-alignment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(savedAlignment)
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Save failed");
      }

      status.value = "saved public/alignment.json";
    } catch (error) {
      status.value = error instanceof Error ? error.message : String(error);
    } finally {
      saveButton.disabled = false;
    }
  });

  bakeButton.addEventListener("click", async () => {
    bakeButton.disabled = true;
    status.value = "generating baked overlay from public/alignment.json";

    try {
      const response = await fetch("/api/bake-overlay", { method: "POST" });
      const result = (await response.json()) as { outputName?: string; error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Bake failed");
      }

      status.value = `generated ${result.outputName ?? "aligned-overlay.webp"}`;
    } catch (error) {
      status.value = error instanceof Error ? error.message : String(error);
    } finally {
      bakeButton.disabled = false;
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) {
      return;
    }

    const step = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
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

function createDefaultAlignment(
  pack: MapPack,
  overlaySize: { width: number; height: number }
): OverlayAlignment {
  return {
    x: pack.width / 2,
    y: pack.height / 2,
    width: overlaySize.width,
    height: overlaySize.height,
    scale: 1,
    rotation: 0,
    opacity: 0.65
  };
}

async function readImageSize(url: string): Promise<{ width: number; height: number }> {
  const image = new Image();
  image.src = url;
  await image.decode();

  return {
    width: image.naturalWidth,
    height: image.naturalHeight
  };
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element ${selector}`);
  }

  return element;
}
