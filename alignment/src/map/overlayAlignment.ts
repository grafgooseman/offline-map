export type OverlayAlignment = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  opacity: number;
};

const storagePrefix = "offline-mapper.alignment.";

export function loadAlignment(packId: string): OverlayAlignment | null {
  const raw = localStorage.getItem(`${storagePrefix}${packId}`);
  if (!raw) {
    return null;
  }

  try {
    return clampAlignment(JSON.parse(raw) as OverlayAlignment);
  } catch {
    return null;
  }
}

export function saveAlignment(packId: string, alignment: OverlayAlignment): void {
  localStorage.setItem(`${storagePrefix}${packId}`, JSON.stringify(clampAlignment(alignment)));
}

export function clampAlignment(alignment: OverlayAlignment): OverlayAlignment {
  return {
    x: finiteOr(alignment.x, 0),
    y: finiteOr(alignment.y, 0),
    width: Math.max(1, finiteOr(alignment.width, 1)),
    height: Math.max(1, finiteOr(alignment.height, 1)),
    scale: clamp(finiteOr(alignment.scale, 1), 0.1, 4),
    rotation: clamp(finiteOr(alignment.rotation, 0), -180, 180),
    opacity: clamp(finiteOr(alignment.opacity, 0.65), 0, 1)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
