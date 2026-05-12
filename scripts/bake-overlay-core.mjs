import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export async function bakeOverlay(root = process.cwd()) {
  const overlaySource = path.join(root, "source-imagery", "Compound_NoFlag3.webp");
  const alignmentSource = path.join(root, "public", "alignment.json");
  const outputDir = path.join(root, "public", "map-packs", "current");
  const outputName = "aligned-overlay.webp";
  const outputPath = path.join(outputDir, outputName);
  const mapPackPath = path.join(outputDir, "map-pack.json");

  await assertFile(overlaySource);
  await assertFile(alignmentSource);
  await assertFile(mapPackPath);

  const alignment = JSON.parse(await fs.readFile(alignmentSource, "utf8"));
  const mapPack = JSON.parse(await fs.readFile(mapPackPath, "utf8"));
  const mapWidth = requiredNumber(mapPack, "width");
  const mapHeight = requiredNumber(mapPack, "height");
  const sourceWidth = requiredNumber(alignment, "width");
  const sourceHeight = requiredNumber(alignment, "height");
  const scale = requiredNumber(alignment, "scale");
  const rotation = requiredNumber(alignment, "rotation");
  const x = requiredNumber(alignment, "x");
  const leafletY = requiredNumber(alignment, "y");
  const imageY = mapHeight - leafletY;
  const overlayJpeg = await sharp(overlaySource, { limitInputPixels: false })
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();
  const overlayDataUri = `data:image/jpeg;base64,${overlayJpeg.toString("base64")}`;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${mapWidth}" height="${mapHeight}" viewBox="0 0 ${mapWidth} ${mapHeight}">
  <image
    href="${overlayDataUri}"
    width="${sourceWidth}"
    height="${sourceHeight}"
    preserveAspectRatio="none"
    transform="translate(${x} ${imageY}) rotate(${rotation}) scale(${scale}) translate(${-sourceWidth / 2} ${-sourceHeight / 2})"
  />
</svg>`;

  const baked = await sharp(Buffer.from(svg), { limitInputPixels: false })
    .ensureAlpha()
    .webp({ quality: 90, effort: 4, lossless: false })
    .toBuffer();

  const stats = await sharp(baked, { limitInputPixels: false }).ensureAlpha().stats();
  if (stats.channels[3]?.max === 0) {
    throw new Error("Baked overlay is fully transparent. The source image did not render into the SVG.");
  }

  await sharp(baked, { limitInputPixels: false }).toFile(outputPath);

  mapPack.overlayImage = outputName;
  delete mapPack.overlayAlignment;

  await fs.writeFile(mapPackPath, `${JSON.stringify(mapPack, null, 2)}\n`, "utf8");

  return {
    outputName,
    outputPath,
    mapWidth,
    mapHeight,
    x,
    y: leafletY,
    imageY,
    width: sourceWidth * scale,
    height: sourceHeight * scale
  };
}

async function assertFile(filePath) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error(`Missing required file: ${filePath}`);
  }
}

function requiredNumber(value, key) {
  const number = Number(value?.[key]);
  if (!Number.isFinite(number)) {
    throw new Error(`Expected numeric ${key}.`);
  }

  return number;
}
