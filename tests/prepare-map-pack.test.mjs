import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import sharp from 'sharp';

const script = fileURLToPath(new URL('../scripts/prepare-map-pack.mjs', import.meta.url));

test('map preparation writes the UTM origin, pixel size, and all-corner envelope', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'map-pack-test-'));
  try {
    const source = path.join(root, 'source');
    await mkdir(source);
    // Small synthetic tile tests metadata generation without the original imagery.
    const tile = path.join(source, '1km17689049630SCOOP2023.tif');
    await sharp({create:{width:50,height:50,channels:3,background:'#aaa'}}).tiff().toFile(tile);
    execFileSync(process.execPath, [script, source], {cwd:root, stdio:'pipe'});
    const pack = JSON.parse(await readFile(path.join(root,'public/map-packs/current/map-pack.json'),'utf8'));
    assert.equal(pack.width, 50);
    assert.equal(pack.height, 50);
    assert.equal(pack.pixelSizeMeters, 20);
    assert.equal(pack.georeference.westEastingMeters, 689000);
    assert.equal(pack.georeference.southNorthingMeters, 4963000);
    assert.match(pack.georeference.projection, /\+zone=17 /);
    assert.ok(Math.abs(pack.gpsBounds.north - 44.80439461532957) < 1e-8);
    assert.ok(Math.abs(pack.gpsBounds.south - 44.79513506674198) < 1e-8);
    await sharp({create:{width:50,height:40,channels:3,background:'#aaa'}}).tiff().toFile(tile);
    assert.throws(() => execFileSync(process.execPath,[script,source],{cwd:root,stdio:'pipe'}), /square pixels/);
  } finally {
    await rm(root, {recursive:true,force:true});
  }
});
