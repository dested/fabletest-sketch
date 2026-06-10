import { writeFileSync } from 'fs';
const tiles: any[] = [];
const put = (name: string, dir: number, x: number, y: number, z: number) =>
  tiles.push({ pack: 'town', name, dir, x, y, z });
// four junctions along y: ground cube z1 | slope cell | raised cube z2
for (let s = 0; s < 4; s++) {
  const y = s * 3;
  put('grass_center', 0, 0, y, 1);
  put('grass_center', 0, 1, y, 1);          // slope cell base
  put('grass_slope', s, 1, y, 2);           // wedge candidate
  put('grass_center', 0, 2, y, 2);          // plateau block (higher toward +x)
}
writeFileSync('/tmp/tilecheck/scene.json', JSON.stringify({ tiles }));
console.log('ok');
