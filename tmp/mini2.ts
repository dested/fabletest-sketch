import { writeFileSync } from 'fs';
const tiles: any[] = [];
const put = (name: string, dir: number, x: number, y: number, z: number) =>
  tiles.push({ pack: 'town', name, dir, x, y, z });

// Row 1 (y offset 0): straight slope, plateau toward +y (N). slope cell at y=1, plateau at y>=2.
// candidates s=0..3 spaced along x.
for (let s = 0; s < 4; s++) {
  const ox = s * 5;
  for (let x = 0; x < 3; x++) {
    put('grass_center', 0, ox + x, 0, 1);                 // low ground
    put('grass_center', 0, ox + x, 1, 1);                 // slope cell base
    put('grass_center', 0, ox + x, 2, 2);                 // plateau
  }
  put('grass_slope', s, ox + 1, 1, 2);
}
// Row 2 (y offset 6): convex corner. plateau 2x2 at x>=2,y>=8 (within patch); corner cell at (1,7)
// has only the DIAGONAL (2,8) higher. uphill corner = between N(+y) and E(+x).
for (let s = 0; s < 4; s++) {
  const ox = s * 5;
  for (let x = 0; x < 4; x++) for (let y = 6; y < 10; y++) {
    const hi = x >= 2 && y >= 8;
    put('grass_center', 0, ox + x, y, hi ? 2 : 1);
  }
  // straight skirts known-good would go here; only test the corner piece:
  put('grass_slopeConvex', s, ox + 1, 7, 2);
}
// Row 3 (y offset 12): concave corner. plateau = (x>=2 OR y>=14) in patch; skirt cell (1,13)
// has higher at N(+y->14) and E(+x->2). uphill corner between N and E.
for (let s = 0; s < 4; s++) {
  const ox = s * 5;
  for (let x = 0; x < 4; x++) for (let y = 12; y < 16; y++) {
    const hi = x >= 2 || y >= 14;
    put('grass_center', 0, ox + x, y, hi ? 2 : 1);
  }
  put('grass_slopeConcave', s, ox + 1, 13, 2);
}
writeFileSync('/tmp/tilecheck/scene.json', JSON.stringify({ tiles }));
console.log('ok');
