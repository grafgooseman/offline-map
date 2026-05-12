import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceTif = path.join(root, "COOP2021_Sample_Uncompressed.tif");
const sourceOverlay = path.join(root, "Compound_NoFlag3.webp");
const outputDir = path.join(root, "public", "map-packs", "coop-sample");

await fs.mkdir(outputDir, { recursive: true });

const baseImage = sharp(sourceTif, { limitInputPixels: false });
const metadata = await baseImage.metadata();
if (!metadata.width || !metadata.height) {
  throw new Error("Could not read GeoTIFF dimensions.");
}

await baseImage
  .removeAlpha()
  .webp({ quality: 88, effort: 4 })
  .toFile(path.join(outputDir, "base.webp"));

await fs.copyFile(sourceOverlay, path.join(outputDir, "compound-overlay.webp"));

const overlayMetadata = await sharp(sourceOverlay, { limitInputPixels: false }).metadata();
if (!overlayMetadata.width || !overlayMetadata.height) {
  throw new Error("Could not read overlay dimensions.");
}

const mapPack = {
  id: "coop-sample",
  name: "COOP 2021 Sample",
  mode: "image-pixel",
  baseImage: "base.webp",
  overlayImage: "compound-overlay.webp",
  width: metadata.width,
  height: metadata.height,
  pixelSizeMeters: 0.2,
  projection: "NAD83(CSRS) / UTM zone 17N",
  defaultOverlay: {
    x: Math.round(metadata.width / 2),
    y: Math.round(metadata.height / 2),
    width: overlayMetadata.width,
    height: overlayMetadata.height,
    scale: 1,
    rotation: 0,
    opacity: 0.65
  }
};

await fs.writeFile(
  path.join(outputDir, "map-pack.json"),
  `${JSON.stringify(mapPack, null, 2)}\n`,
  "utf8"
);

console.log(`Prepared ${mapPack.name}`);
console.log(`Base image: ${metadata.width}x${metadata.height}`);
console.log(`Overlay image: ${overlayMetadata.width}x${overlayMetadata.height}`);
