// All four rotations of convex/concave junctions, suffix chosen BY THE FORMULA.
// Each patch: 4x4 ground h1, plateau quadrant h2, test cell adjacent.
// Usage: npx tsx mini4.ts <convex|concave> <0|1|2|3>   (rotation index)
import { writeFileSync } from 'fs';
import { Dir, DX, DY } from '/Users/sal/code/fabletest-sketch/src/engine/tileset';
import { convexDir } from '/Users/sal/code/fabletest-sketch/src/engine/orient';

type T = { pack: string; name: string; dir: number; x: number; y: number; z: number };
const tiles: T[] = [];
const put = (name: string, dir: number, x: number, y: number, z: number) =>
  tiles.push({ pack: 'town', name, dir, x, y, z });
const flip = (d: Dir): Dir => ((d + 2) & 3) as Dir;

const kind = process.argv[2];
const r = Number(process.argv[3]); // rotation: plateau quadrant toward dirs r and r+1
const dA = (r & 3) as Dir, dB = ((r + 1) & 3) as Dir; // plateau lies toward dA+dB diagonal
// grid 5x5, test cell at center (2,2)
const cx = 2, cy = 2;
const qx = DX[dA] + DX[dB], qy = DY[dA] + DY[dB]; // diagonal unit toward plateau

function inPlateau(x: number, y: number): boolean {
  const rx = x - cx, ry = y - cy;
  if (kind === 'convex') {
    // plateau strictly in the quadrant beyond the diagonal cell
    const a = rx * DX[dA] + ry * DY[dA]; // component toward dA
    const b = rx * DX[dB] + ry * DY[dB];
    return a >= 1 && b >= 1;
  } else {
    // concave: plateau is L wrapping the cell: higher at dA OR dB direction
    const a = rx * DX[dA] + ry * DY[dA];
    const b = rx * DX[dB] + ry * DY[dB];
    return a >= 1 || b >= 1;
  }
}
for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
  const h = inPlateau(x, y) ? 2 : 1;
  if (h === 2) put('dirt_center', 0, x, y, 1);
  put('grass_center', 0, x, y, h);
}
const suffix = convexDir(flip(dA), flip(dB)); // descent dirs = away from plateau
put(kind === 'convex' ? 'grass_slopeConvex' : 'grass_slopeConcave', suffix, cx, cy, 2);
console.log(kind, 'rot', r, 'plateau toward', 'NESW'[dA] + '+' + 'NESW'[dB], '-> suffix', 'NESW'[suffix]);
writeFileSync('/tmp/tilecheck/scene.json', JSON.stringify({ tiles }));
