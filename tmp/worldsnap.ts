import { World } from '/Users/sal/code/fabletest-sketch/src/engine/world';
import { DEFAULT_PARAMS } from '/Users/sal/code/fabletest-sketch/src/engine/params';
import { writeFileSync } from 'fs';

const w = new World({ ...DEFAULT_PARAMS, seed: Number(process.argv[2] ?? 1337) });
const ccx = Math.floor(Number(process.argv[4] ?? 0) / 32);
const ccy = Math.floor(Number(process.argv[5] ?? 0) / 32);
const tiles: any[] = [];
const R = Number(process.argv[3] ?? 1);
for (let cy = ccy - R; cy <= ccy + R; cy++) for (let cx = ccx - R; cx <= ccx + R; cx++) {
  tiles.push(...w.chunkAt(cx, cy).placed);
}
writeFileSync('/tmp/tilecheck/scene.json', JSON.stringify({ tiles }));
console.log(tiles.length, 'tiles');
