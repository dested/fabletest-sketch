import { World } from '/Users/sal/code/fabletest-sketch/src/engine/world';
import { DEFAULT_PARAMS } from '/Users/sal/code/fabletest-sketch/src/engine/params';

const w = new World(DEFAULT_PARAMS);
const t0 = performance.now();
let tiles = 0;
for (let cy = -2; cy <= 2; cy++) for (let cx = -2; cx <= 2; cx++) {
  tiles += w.chunkAt(cx, cy).placed.length;
}
console.log('25 chunks in', (performance.now() - t0).toFixed(0), 'ms,', tiles, 'tiles');
const s = w.findSpawn();
console.log('spawn', s, 'plane', w.planeAt(s.x, s.y), 'biome', w.biomeAt(s.x, s.y));
// walk a bit
let { x, y } = s;
let steps = 0;
for (let i = 0; i < 200; i++) {
  const d = (Math.floor(Math.random() * 4)) as 0|1|2|3;
  if (w.canStep(x, y, d)) {
    x += [0,1,0,-1][d]; y += [1,0,-1,0][d];
    steps++;
  }
}
console.log('random walk ok:', steps, 'steps, ended at', x, y, 'plane', w.planeAt(x, y));
// name sanity: collect all placed tile keys and verify files exist
import { readdirSync } from 'fs';
const have = new Set<string>();
for (const pack of ['town','exp','desert']) {
  for (const f of readdirSync(`/Users/sal/code/fabletest-sketch/public/tiles/${pack}`)) {
    have.add(`${pack}/${f.replace('.png','')}`);
  }
}
const missing = new Set<string>();
for (let cy = -4; cy <= 4; cy++) for (let cx = -4; cx <= 4; cx++) {
  for (const t of w.chunkAt(cx, cy).placed) {
    const k = `${t.pack}/${t.name}_${'NESW'[t.dir]}`;
    if (!have.has(k)) missing.add(k);
  }
}
console.log('missing tile refs:', missing.size ? [...missing] : 'none');
