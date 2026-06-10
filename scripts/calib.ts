// Calibration scenes: composed via scripts/compose.py, inspected visually,
// verifying the orientation tables in src/engine/orient.ts work in context.
import { writeFileSync } from 'fs';
import {
  Placed, Dir, DIR_N, DIR_E, DIR_S, DIR_W, DX, DY,
} from '../src/engine/tileset';
import {
  slopeSuffix, convexSuffix, concaveSuffix,
  waterLipSuffix, waterConcaveSuffix, waterConvexSuffix, riverMouthSuffix,
  linearVariant, stairsSuffix, bridgeSuffix, riverBridgeSuffix, gableSuffix,
  buildingSuffix, waterfallSuffix,
} from '../src/engine/orient';

const tiles: Placed[] = [];
const SCENES: Record<string, () => void> = {};
const put = (pack: Placed['pack'], name: string, dir: Dir, x: number, y: number, z: number) =>
  tiles.push({ pack, name, dir, x, y, z });

/** terrain stamper: heights map -> cubes + slope skirt (the real chunkgen algorithm in miniature) */
function stampTerrain(ox: number, oy: number, w: number, h: number, H: (x: number, y: number) => number) {
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const hc = H(x, y);
    for (let z = 1; z < hc; z++) put('town', 'dirt_center', DIR_N, ox + x, oy + y, z);
    put('town', 'grass_center', DIR_N, ox + x, oy + y, hc);
    // skirt pieces on this (low) cell
    const hi: Dir[] = [];
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && H(nx, ny) === hc + 1) hi.push(d);
    }
    if (hi.length === 1) {
      // descend away from the single higher cardinal
      put('town', 'grass_slope', slopeSuffix(((hi[0] + 2) & 3) as Dir), ox + x, oy + y, hc + 1);
    } else if (hi.length === 2 && (((hi[0] + 1) & 3) === hi[1] || ((hi[1] + 1) & 3) === hi[0])) {
      put('town', 'grass_slopeConcave', concaveSuffix(hi[0], hi[1]), ox + x, oy + y, hc + 1);
    } else if (hi.length === 0) {
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        const d2 = ((d + 1) & 3) as Dir;
        const nx = x + DX[d] + DX[d2], ny = y + DY[d] + DY[d2];
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && H(nx, ny) === hc + 1) {
          put('town', 'grass_slopeConvex', convexSuffix(d, d2), ox + x, oy + y, hc + 1);
          break;
        }
      }
    }
  }
}

SCENES['A'] = () => {
  // L-plateau: straight slopes on all four flanks, convex corners at every tip,
  // one concave inner corner.
  const inP = (x: number, y: number) =>
    (x >= 3 && x <= 5 && y >= 3 && y <= 5) || (x >= 3 && x <= 4 && y >= 5 && y <= 7);
  stampTerrain(0, 0, 9, 9, (x, y) => (inP(x, y) ? 2 : 1));
};

SCENES['B'] = () => {
  // L-shaped lake: straight lips on every shore orientation, concave lips at
  // inner shore corners, convex nubs where land touches only diagonally.
  const ox = 11, oy = 0;
  const isW = (x: number, y: number) =>
    (x >= 2 && x <= 5 && y >= 2 && y <= 4) || (x >= 2 && x <= 3 && y >= 4 && y <= 6);
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    if (!isW(x, y)) { put('town', 'grass_center', DIR_N, ox + x, oy + y, 1); continue; }
    const land: Dir[] = [];
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      if (!isW(x + DX[d], y + DY[d])) land.push(d);
    }
    if (land.length === 1) {
      put('town', 'grass_water', waterLipSuffix(land[0]), ox + x, oy + y, 1);
    } else if (land.length === 2) {
      put('town', 'grass_waterConcave', waterConcaveSuffix(land[0], land[1]), ox + x, oy + y, 1);
    } else if (land.length === 0) {
      let placed = false;
      for (let d = 0 as Dir; d < 4 && !placed; d = (d + 1) as Dir) {
        const d2 = ((d + 1) & 3) as Dir;
        if (!isW(x + DX[d] + DX[d2], y + DY[d] + DY[d2])) {
          put('town', 'grass_waterConvex', waterConvexSuffix(d, d2), ox + x, oy + y, 1);
          placed = true;
        }
      }
      if (!placed) put('town', 'water_center', DIR_N, ox + x, oy + y, 1);
    }
  }
};

SCENES['C'] = () => {
  // path ring + spur + crossing bar: exercises straights both axes, all bends,
  // splits, a crossing and an end cap.
  const ox = 21, oy = 0;
  const isP = (x: number, y: number) => {
    const ring = (x >= 2 && x <= 7 && y >= 2 && y <= 5) && (x === 2 || x === 7 || y === 2 || y === 5);
    const spur = y === 3 && x >= 7 && x <= 9;
    const bar = x === 4 && y >= 2 && y <= 5;
    return ring || spur || bar;
  };
  for (let x = 0; x < 11; x++) for (let y = 0; y < 8; y++) {
    if (!isP(x, y)) { put('town', 'grass_center', DIR_N, ox + x, oy + y, 1); continue; }
    let mask = 0;
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      if (isP(x + DX[d], y + DY[d])) mask |= 1 << d;
    }
    const v = linearVariant('grass_path', mask);
    put('town', v.name, v.dir, ox + x, oy + y, 1);
  }
};

SCENES['D'] = () => {
  // river: spring -> bend -> slope down a level -> bridge -> waterfall mouth into pond
  const ox = 34, oy = 0;
  const h = (x: number) => (x <= 4 ? 2 : 1);
  const pond = (x: number, y: number) => x >= 9 && x <= 11 && y >= 2 && y <= 6;
  const path: [number, number][] = [[2, 7], [2, 6], [2, 5], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4]];
  const riv = new Map<string, number>();
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i];
    let mask = 0;
    const link = (x2: number, y2: number) => {
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        if (x + DX[d] === x2 && y + DY[d] === y2) mask |= 1 << d;
      }
    };
    if (i > 0) link(path[i - 1][0], path[i - 1][1]); else link(x, y - 1); // spring end opens N? no: end cap
    if (i < path.length - 1) link(path[i + 1][0], path[i + 1][1]);
    else link(x + 1, y); // flows into pond eastward
    riv.set(`${x},${y}`, mask);
  }
  // spring: first cell connects only to second -> End variant automatically
  riv.set('2,7', (() => { let m = 0; m |= 1 << DIR_S; return m; })()); // connects toward (2,6) = -y = S
  for (let x = 0; x < 13; x++) for (let y = 0; y < 9; y++) {
    const hc = h(x);
    if (pond(x, y)) {
      if (x === 9 && y === 4) put('town', 'grass_waterRiver', riverMouthSuffix(DIR_W), ox + x, oy + y, 1);
      else put('town', 'water_center', DIR_N, ox + x, oy + y, 1);
      continue;
    }
    const m = riv.get(`${x},${y}`);
    if (m !== undefined) {
      if (x === 5) {
        // river descends the cliff line here (flowing E, descending toward E)
        put('town', 'grass_center', DIR_N, ox + x, oy + y, 1);
        put('town', 'grass_riverSlope', slopeSuffix(DIR_E), ox + x, oy + y, 2);
      } else if (x === 7) {
        put('town', 'grass_riverBridge', riverBridgeSuffix(true), ox + x, oy + y, hc);
      } else {
        const v = linearVariant('grass_river', m);
        put('town', v.name, v.dir, ox + x, oy + y, hc);
      }
      continue;
    }
    for (let z = 1; z < hc; z++) put('town', 'dirt_center', DIR_N, ox + x, oy + y, z);
    put('town', 'grass_center', DIR_N, ox + x, oy + y, hc);
    if (x === 5 && h(x - 1) === 2) {
      put('town', 'grass_slope', slopeSuffix(DIR_E), ox + x, oy + y, 2);
    }
  }
};

SCENES['E'] = () => {
  // buildings: doors each visible way, gables both axes, hip roof, stairs, bridges
  const ox = 49, oy = 0;
  for (let x = 0; x < 12; x++) for (let y = 0; y < 9; y++) put('town', 'grass_center', DIR_N, ox + x, oy + y, 1);
  // door facing N (lower-left) and facing E (lower-right)
  put('town', 'building_door', buildingSuffix(DIR_N), ox + 1, oy + 1, 2);
  put('town', 'roof_pointGreen', DIR_N, ox + 1, oy + 1, 3);
  put('town', 'building_door', buildingSuffix(DIR_E), ox + 3, oy + 1, 2);
  put('town', 'roof_pointRed', DIR_N, ox + 3, oy + 1, 3);
  // 2x1 house along x: ridge along x, door facing N
  put('town', 'building_door', buildingSuffix(DIR_N), ox + 1, oy + 4, 2);
  put('town', 'building_windows', buildingSuffix(DIR_N), ox + 2, oy + 4, 2);
  put('town', 'roof_gableGreen', gableSuffix(true), ox + 1, oy + 4, 3);
  put('town', 'roof_gableGreen', gableSuffix(true), ox + 2, oy + 4, 3);
  // 2x1 house along y: ridge along y, door facing E
  put('town', 'building_door', buildingSuffix(DIR_E), ox + 4, oy + 4, 2);
  put('town', 'building_windows', buildingSuffix(DIR_E), ox + 4, oy + 5, 2);
  put('town', 'roof_gableBrown', gableSuffix(false), ox + 4, oy + 4, 3);
  put('town', 'roof_gableBrown', gableSuffix(false), ox + 4, oy + 5, 3);
  // stairs descending each visible direction against a ledge
  for (let x = 8; x < 12; x++) for (let y = 6; y < 9; y++) put('town', 'dirt_center', DIR_N, ox + x, oy + y, 2);
  for (let x = 8; x < 12; x++) for (let y = 6; y < 9; y++) put('town', 'grass_center', DIR_N, ox + x, oy + y, 2);
  put('desert', 'stairs_full', stairsSuffix(DIR_W), ox + 8, oy + 5, 2); // hmm: low cell west of ledge? no:
  // ledge is at y>=6,x>=8 (h2). Low cell (8,5) is S of ledge cell (8,6): high toward N -> stairs descend S
  tiles.pop();
  put('desert', 'stairs_full', stairsSuffix(DIR_S), ox + 8, oy + 5, 2);
  // low cell (7,6) is W of ledge cell (8,6): high toward E -> stairs descend W
  put('desert', 'stairs_full', stairsSuffix(DIR_W), ox + 7, oy + 6, 2);
  // bridges: walk along x and along y
  put('town', 'bridge', bridgeSuffix(true), ox + 9, oy + 1, 2);
  put('town', 'bridge', bridgeSuffix(false), ox + 9, oy + 3, 2);
  // waterfall cube: flow E
  put('town', 'water_fall', waterfallSuffix(DIR_E), ox + 6, oy + 7, 1);
};

const which = process.argv[2] || 'all';
for (const k of Object.keys(SCENES)) { if (which === 'all' || which === k) SCENES[k](); }
writeFileSync('/Users/sal/code/fabletest-sketch/tmp/scene.json', JSON.stringify({ tiles }));
console.log('wrote', tiles.length, 'tiles');
