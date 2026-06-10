import { writeFileSync } from 'fs';
// emit one json per (family, suffix) — patches rendered separately then pasted in a strip
type T = { pack: string; name: string; dir: number; x: number; y: number; z: number };
function patch(kind: string, s: number): T[] {
  const tiles: T[] = [];
  const put = (name: string, dir: number, x: number, y: number, z: number) =>
    tiles.push({ pack: 'town', name, dir, x, y, z });
  if (kind === 'slopeN') { // plateau toward +y
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++)
      put('grass_center', 0, x, y, y >= 2 ? 2 : 1);
    put('grass_slope', s, 1, 1, 2);
  } else if (kind === 'slopeE') { // plateau toward +x
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++)
      put('grass_center', 0, x, y, x >= 2 ? 2 : 1);
    put('grass_slope', s, 1, 1, 2);
  } else if (kind === 'convex') { // only diagonal (+x,+y) higher
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++)
      put('grass_center', 0, x, y, x >= 2 && y >= 2 ? 2 : 1);
    put('grass_slopeConvex', s, 1, 1, 2);
    put('grass_slope', 99 as any, 0, 0, 0); // sentinel removed below
    tiles.pop();
  } else if (kind === 'concave') { // higher at +x OR +y
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++)
      put('grass_center', 0, x, y, x >= 2 || y >= 2 ? 2 : 1);
    put('grass_slopeConcave', s, 1, 1, 2);
  }
  return tiles;
}
const kind = process.argv[2], s = Number(process.argv[3]);
writeFileSync('/tmp/tilecheck/scene.json', JSON.stringify({ tiles: patch(kind, s) }));
