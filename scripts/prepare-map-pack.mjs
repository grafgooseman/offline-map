import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const defaultOntarioDirectory = path.join(root, "source-imagery", "scoop-2023");
const activeSquareFile = "1km17689049630SCOOP2023.tif";
const sourcePath = path.resolve(process.argv[2] ?? process.env.MAP_SOURCE_PATH ?? defaultOntarioDirectory);
const outputDir = path.join(root, "public", "map-packs", "current");

await fs.mkdir(outputDir, { recursive: true });

const sourceTiles = (await readOntarioTiles(sourcePath)).filter(
  (tile) => path.basename(tile.filePath).toLowerCase() === activeSquareFile.toLowerCase()
);
if (sourceTiles.length === 0) {
  throw new Error(`Active square ${activeSquareFile} was not found in ${sourcePath}.`);
}

const firstMetadata = await sharp(sourceTiles[0].filePath, { limitInputPixels: false }).metadata();
if (!firstMetadata.width || !firstMetadata.height) {
  throw new Error("Could not read source image dimensions.");
}

const tileWidth = firstMetadata.width;
const tileHeight = firstMetadata.height;
const minEasting = Math.min(...sourceTiles.map((tile) => tile.westEastingMeters));
const maxEasting = Math.max(...sourceTiles.map((tile) => tile.eastEastingMeters));
const minNorthing = Math.min(...sourceTiles.map((tile) => tile.southNorthingMeters));
const maxNorthing = Math.max(...sourceTiles.map((tile) => tile.northNorthingMeters));
const width = ((maxEasting - minEasting) / 1000) * tileWidth;
const height = ((maxNorthing - minNorthing) / 1000) * tileHeight;
const baseImage = path.join(outputDir, "base.webp");

await sharp({
  create: {
    width,
    height,
    channels: 3,
    background: "#101418"
  },
  limitInputPixels: false
})
  .composite(
    sourceTiles.map((tile) => ({
      input: tile.filePath,
      left: ((tile.westEastingMeters - minEasting) / 1000) * tileWidth,
      top: ((maxNorthing - tile.northNorthingMeters) / 1000) * tileHeight
    }))
  )
  .removeAlpha()
  .webp({ quality: 88, effort: 4 })
  .toFile(baseImage);

const southwest = utmToWgs84(sourceTiles[0].zone, minEasting, minNorthing);
const northeast = utmToWgs84(sourceTiles[0].zone, maxEasting, maxNorthing);

const mapPack = {
  id: "current",
  name: "SCOOP 2023 square 3 bottom-left",
  mode: "image-pixel",
  baseImage: "base.webp",
  width,
  height,
  pixelSizeMeters: 0.2,
  projection: "NAD83(CSRS) / UTM zone 17N",
  gpsBounds: {
    north: northeast.latitude,
    south: southwest.latitude,
    east: northeast.longitude,
    west: southwest.longitude
  },
  tiles: sourceTiles.map((tile) => ({
    file: path.basename(tile.filePath),
    westEastingMeters: tile.westEastingMeters,
    southNorthingMeters: tile.southNorthingMeters
  })),
  activeSquare: {
    label: "square-3-bottom-left",
    file: activeSquareFile
  }
};

await fs.writeFile(
  path.join(outputDir, "map-pack.json"),
  `${JSON.stringify(mapPack, null, 2)}\n`,
  "utf8"
);

console.log(`Prepared ${mapPack.name}`);
console.log(`Tiles: ${sourceTiles.length}`);
console.log(`Base image: ${width}x${height}`);
console.log("GPS bounds: detected from Ontario filenames");

async function readOntarioTiles(inputPath) {
  const stats = await fs.stat(inputPath);
  const files = stats.isDirectory()
    ? (await fs.readdir(inputPath))
        .filter((file) => /\.(tif|tiff)$/i.test(file))
        .map((file) => path.join(inputPath, file))
    : [inputPath];

  return files
    .map((filePath) => parseOntarioTile(filePath))
    .filter((tile) => tile !== null)
    .sort((a, b) => a.southNorthingMeters - b.southNorthingMeters || a.westEastingMeters - b.westEastingMeters);
}

function parseOntarioTile(filePath) {
  const match = path.basename(filePath).match(/1km(\d{2})(\d{4})(\d{5})/i);
  if (!match) {
    return null;
  }

  const zone = Number(match[1]);
  const westEastingMeters = Number(match[2]) * 100;
  const southNorthingMeters = Number(match[3]) * 100;

  return {
    filePath,
    zone,
    westEastingMeters,
    eastEastingMeters: westEastingMeters + 1000,
    southNorthingMeters,
    northNorthingMeters: southNorthingMeters + 1000
  };
}

function utmToWgs84(zone, easting, northing) {
  const a = 6378137;
  const eccSquared = 0.00669438;
  const k0 = 0.9996;
  const eccPrimeSquared = eccSquared / (1 - eccSquared);
  const e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));
  const x = easting - 500000;
  const y = northing;
  const longOrigin = (zone - 1) * 6 - 180 + 3;
  const m = y / k0;
  const mu =
    m /
    (a *
      (1 -
        eccSquared / 4 -
        (3 * eccSquared * eccSquared) / 64 -
        (5 * eccSquared * eccSquared * eccSquared) / 256));
  const phi1Rad =
    mu +
    ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) * Math.sin(4 * mu) +
    ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu);
  const n1 = a / Math.sqrt(1 - eccSquared * Math.sin(phi1Rad) * Math.sin(phi1Rad));
  const t1 = Math.tan(phi1Rad) * Math.tan(phi1Rad);
  const c1 = eccPrimeSquared * Math.cos(phi1Rad) * Math.cos(phi1Rad);
  const r1 =
    (a * (1 - eccSquared)) /
    Math.pow(1 - eccSquared * Math.sin(phi1Rad) * Math.sin(phi1Rad), 1.5);
  const d = x / (n1 * k0);
  const latitude =
    phi1Rad -
    ((n1 * Math.tan(phi1Rad)) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * eccPrimeSquared) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * eccPrimeSquared - 3 * c1 * c1) *
          d ** 6) /
          720);
  const longitude =
    ((d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * eccPrimeSquared + 24 * t1 * t1) * d ** 5) /
        120) /
      Math.cos(phi1Rad)) +
    degreesToRadians(longOrigin);

  return {
    latitude: radiansToDegrees(latitude),
    longitude: radiansToDegrees(longitude)
  };
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value) {
  return (value * 180) / Math.PI;
}
