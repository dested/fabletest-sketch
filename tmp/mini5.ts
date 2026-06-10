// Render one junction rotation with an EXPLICIT suffix candidate.
// Usage: npx tsx mini5.ts <convex|concave> <rot 0-3> <suffix 0-3>
import { writeFileSync } from 'fs';
import { DX, DY } from '/Users/sal/code/fabletest-sketch/src/engine/tileset';
type T = { pack: string; name: string; dir: number; x: number; y: number; z: number };
const tiles: T[] = [];
const put = (name: string, dir: number, x: number, y: number, z: number) =>
  tiles.push({ pack: 'town', name, dir, x, y, z });
const kind = process.argv[2];
const r = Number(process.argv[3]);
const s = Number(process.argv[4]);
const dA = r & 3, dB = (r + 1) & 3;
const cx = 2, cy = 2;
function inPlateau(x: number, y: number): boolean {
  const rx = x - cx, ry = y - cy;
  const a = rx * DX[dA] + ry * DY[dA];
  const b = rx * DX[dB] + ry * DY[dB];
  return kind === 'convex' ? (a >= 1 && b >= 1) : (a >= 1 || b >= 1);
}
for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
  const h = inPlateau(x, y) ? 2 : 1;
  if (h === 2) put('dirt_center', 0, x, y, 1);
  put('grass_center', 0, x, y, h);
}
put(kind === 'convex' ? 'grass_slopeConvex' : 'grass_slopeConcave', s, cx, cy, 2);
writeFileSync('/tmp/tilecheck/scene.json', JSON.stringify({ tiles }));
