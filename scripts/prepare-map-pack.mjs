import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import proj4 from "proj4";

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
if (tileWidth !== tileHeight) {
  throw new Error("A 1 km square tile must have square pixels and equal image dimensions.");
}
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

const projection = `+proj=utm +zone=${sourceTiles[0].zone} +ellps=GRS80 +units=m +no_defs`;
const geographicCorners = [
  [minEasting, minNorthing], [minEasting, maxNorthing],
  [maxEasting, minNorthing], [maxEasting, maxNorthing]
].map((point) => proj4(projection, "EPSG:4326", point));

const mapPack = {
  id: "current",
  name: "SCOOP 2023 square 3 bottom-left",
  mode: "image-pixel",
  baseImage: "base.webp",
  width,
  height,
  pixelSizeMeters: (maxEasting - minEasting) / width,
  projection: `NAD83(CSRS) / UTM zone ${sourceTiles[0].zone}N`,
  georeference: {
    projection,
    westEastingMeters: minEasting,
    southNorthingMeters: minNorthing
  },
  gpsBounds: {
    north: Math.max(...geographicCorners.map((point) => point[1])),
    south: Math.min(...geographicCorners.map((point) => point[1])),
    east: Math.max(...geographicCorners.map((point) => point[0])),
    west: Math.min(...geographicCorners.map((point) => point[0]))
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
