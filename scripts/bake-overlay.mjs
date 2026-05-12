import { bakeOverlay } from "./bake-overlay-core.mjs";

const result = await bakeOverlay();

console.log(`Baked ${result.outputName}`);
console.log(`Map size: ${result.mapWidth}x${result.mapHeight}`);
console.log(
  `Overlay placement: center ${result.x}, ${result.y}, scaled size ${result.width}x${result.height}`
);
