// Chunk generation: turns Terrain + Features into draw lists (Placed[]) and
// walkability grids, using the calibrated orientation tables in orient.ts.

import { Terrain, Biome } from './terrain';
import { Features, RiverCell, CellFeature } from './features';
import {
  Placed, Pack, Dir, DIR_N, DIR_E, DX, DY, sortKey,
} from './tileset';
import {
  slopeSuffix, convexSuffix, concaveSuffix,
  waterLipSuffix, waterConcaveSuffix, waterConvexSuffix, riverMouthSuffix,
  linearVariant, waterfallSuffix, riverBridgeSuffix,
} from './orient';

export const CHUNK = 32;

// walk flags
export const F_BLOCKED = 1;
export const F_WATER = 2;
export const F_RAMP = 4;     // straight slope or stairs: connects plane and plane+1
export const F_BRIDGE = 8;

export interface Chunk {
  cx: number;
  cy: number;
  placed: Placed[];          // sorted by painter order
  plane: Int16Array;         // walk plane (= surface height + 1); CHUNK*CHUNK
  flags: Uint8Array;
  rampDir: Int8Array;        // descent dir of ramp cells, -1 otherwise
  biome: Uint8Array;         // 0 grass, 1 desert (for HUD)
}

const cellKey = (x: number, y: number) => `${x},${y}`;

export class ChunkGen {
  constructor(private t: Terrain, private f: Features) {}

  generate(cx: number, cy: number): Chunk {
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const A = 2; // apron
    const W = CHUNK + A * 2;
    const placed: Placed[] = [];
    const plane = new Int16Array(CHUNK * CHUNK);
    const flags = new Uint8Array(CHUNK * CHUNK);
    const rampDir = new Int8Array(CHUNK * CHUNK).fill(-1);
    const biomeArr = new Uint8Array(CHUNK * CHUNK);

    // ---- gather layers for chunk + apron ----
    const H = new Int16Array(W * W);
    const BIO: Biome[] = new Array(W * W);
    const idx = (lx: number, ly: number) => (ly + A) * W + (lx + A);
    for (let ly = -A; ly < CHUNK + A; ly++) {
      for (let lx = -A; lx < CHUNK + A; lx++) {
        const wx = x0 + lx, wy = y0 + ly;
        H[idx(lx, ly)] = this.f.heightAt(wx, wy);
        BIO[idx(lx, ly)] = this.t.sample(wx, wy).biome;
      }
    }
    const rivers = this.f.riversTouching(x0 - A, y0 - A, x0 + CHUNK + A, y0 + CHUNK + A);
    const stamps = this.f.stampsTouching(x0 - A, y0 - A, x0 + CHUNK + A, y0 + CHUNK + A);
    const roads = this.f.roadsTouching(x0 - A, y0 - A, x0 + CHUNK + A, y0 + CHUNK + A);
    const featCell = (wx: number, wy: number): CellFeature | undefined => {
      for (const st of stamps) {
        const c = st.cells.get(cellKey(wx, wy));
        if (c) return c;
      }
      return undefined;
    };
    const isPath = (wx: number, wy: number): boolean => {
      if (roads.has(cellKey(wx, wy))) return true;
      const c = featCell(wx, wy);
      return !!c?.path;
    };

    const put = (pack: Pack, name: string, dir: Dir, wx: number, wy: number, z: number) =>
      placed.push({ pack, name, dir, x: wx, y: wy, z });

    // terrain-cast shadow: sun sits beyond the screen-top (T) corner, so taller
    // ground toward (-x,-y) shades this cell. Drawn as a translucent diamond.
    const putShade = (wx: number, wy: number, surfZ: number) => {
      let excess = 0;
      for (let k = 1; k <= 5; k++) {
        const hn = this.f.heightAt(wx - k, wy - k);
        excess = Math.max(excess, hn - surfZ - k * 0.9);
      }
      if (excess > 0) {
        placed.push({
          pack: 'town', name: '__shade', dir: DIR_N, x: wx, y: wy, z: surfZ,
          alpha: Math.min(0.30, 0.10 + 0.07 * excess),
        });
      }
    };

    const p = this.t.p;

    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = x0 + lx, wy = y0 + ly;
        const h = H[idx(lx, ly)];
        const bio = BIO[idx(lx, ly)];
        const pack: Pack = bio === 'desert' ? 'desert' : 'town';
        const ci = ly * CHUNK + lx;
        biomeArr[ci] = bio === 'desert' ? 1 : 0;
        const riv = rivers.get(cellKey(wx, wy));
        const feat = featCell(wx, wy);
        const nbrH = [0, 0, 0, 0];
        for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
          nbrH[d] = H[idx(lx + DX[d], ly + DY[d])];
        }

        // ================= WATER =================
        if (h === 0) {
          plane[ci] = 1;
          flags[ci] = F_BLOCKED | F_WATER;
          if (riv?.mouth !== undefined) {
            put(pack, 'grass_waterRiver', riverMouthSuffix(riv.mouth), wx, wy, 1);
            continue;
          }
          const land: Dir[] = [];
          for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) if (nbrH[d] > 0) land.push(d);
          if (land.length === 1) {
            put(pack, 'grass_water', waterLipSuffix(land[0]), wx, wy, 1);
          } else if (land.length === 2 && (((land[0] + 1) & 3) === land[1] || ((land[1] + 1) & 3) === land[0])) {
            put(pack, 'grass_waterConcave', waterConcaveSuffix(land[0], land[1]), wx, wy, 1);
          } else if (land.length >= 2) {
            // strait / cove: use the river channel family, open toward water dirs
            let mask = 0;
            for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) if (nbrH[d] === 0) mask |= 1 << d;
            const v = linearVariant('grass_river', mask);
            put(pack, v.name, v.dir, wx, wy, 1);
          } else {
            // open water: nub if land touches diagonally
            let nub: Dir | -1 = -1;
            for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
              const d2 = ((d + 1) & 3) as Dir;
              if (H[idx(lx + DX[d] + DX[d2], ly + DY[d] + DY[d2])] > 0) { nub = d; break; }
            }
            if (nub >= 0) {
              const d2 = ((nub + 1) & 3) as Dir;
              put(pack, 'grass_waterConvex', waterConvexSuffix(nub as Dir, d2), wx, wy, 1);
            } else {
              put(pack, 'water_center', DIR_N, wx, wy, 1);
            }
          }
          continue;
        }

        // ================= LAND =================
        plane[ci] = h + 1;
        let minNbr = h;
        for (let d = 0; d < 4; d++) minNbr = Math.min(minNbr, nbrH[d]);
        // dirt filler for exposed cliff faces
        const fillFrom = Math.max(1, minNbr + 1);
        const isFall = riv?.fall !== undefined;
        for (let z = fillFrom; z < h; z++) {
          if (isFall && z > (riv!.fallTo ?? 0)) continue; // waterfall column replaces filler
          put(pack, 'dirt_center', DIR_N, wx, wy, z);
        }

        // ---- top cube ----
        const pathHere = isPath(wx, wy);
        if (riv && riv.fall !== undefined) {
          // waterfall column: water_fall cubes from fallTo+1 .. h
          const wf = waterfallSuffix(riv.fall);
          for (let z = (riv.fallTo ?? h - 1) + 1; z <= h; z++) put(pack, 'water_fall', wf, wx, wy, z);
          flags[ci] = F_BLOCKED | F_WATER;
          continue;
        }
        if (riv && riv.drop !== undefined) {
          put(pack, 'grass_center', DIR_N, wx, wy, h);
          put(pack, 'grass_riverSlope', slopeSuffix(riv.drop), wx, wy, h + 1);
          flags[ci] = F_BLOCKED | F_WATER;
          continue;
        }
        if (riv && pathHere) {
          // bridge where a path crosses a straight river
          const isStraightX = riv.mask === ((1 << DIR_E) | (1 << 3));
          const isStraightY = riv.mask === ((1 << DIR_N) | (1 << 2));
          if (isStraightX || isStraightY) {
            put(pack, 'grass_riverBridge', riverBridgeSuffix(isStraightX), wx, wy, h);
            flags[ci] = F_BRIDGE;
            continue;
          }
        }
        if (riv) {
          const v = linearVariant('grass_river', riv.mask);
          put(pack, v.name, v.dir, wx, wy, h);
          flags[ci] = F_BLOCKED | F_WATER;
          continue;
        }
        if (pathHere) {
          // path slope when a path neighbor is one level up
          let up: Dir | -1 = -1;
          for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
            if (nbrH[d] === h + 1 && isPath(wx + DX[d], wy + DY[d])) { up = d; break; }
          }
          if (up >= 0) {
            put(pack, 'grass_center', DIR_N, wx, wy, h);
            put(pack, 'grass_pathSlope', slopeSuffix(((up + 2) & 3) as Dir), wx, wy, h + 1);
            flags[ci] = F_RAMP;
            rampDir[ci] = ((up + 2) & 3);
            plane[ci] = h + 1;
          } else {
            let mask = 0;
            for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
              const nx = wx + DX[d], ny = wy + DY[d];
              const nh = nbrH[d];
              if ((isPath(nx, ny) || rivers.get(cellKey(nx, ny)) !== undefined) && Math.abs(nh - h) <= 1) mask |= 1 << d;
            }
            const v = linearVariant('grass_path', mask);
            put(pack, v.name, v.dir, wx, wy, h);
          }
          // feature objects can still sit beside paths (gate cells are path+obj)
          if (feat?.obj) {
            for (const o of feat.obj) put(o.pack, o.name, o.dir, wx, wy, h + 1 + (o.dz ?? 0));
          }
          if (feat?.solid) flags[ci] |= F_BLOCKED;
          continue;
        }

        // plain ground cube
        put(pack, 'grass_center', DIR_N, wx, wy, h);

        // ---- slope skirt ----
        const hi: Dir[] = [];
        for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) if (nbrH[d] === h + 1) hi.push(d);
        let wedge = false;
        if (!feat?.obj) {
          if (hi.length === 1) {
            // no ramp onto rivers/water above (rare); fine to always place
            put(pack, 'grass_slope', slopeSuffix(((hi[0] + 2) & 3) as Dir), wx, wy, h + 1);
            flags[ci] |= F_RAMP;
            rampDir[ci] = ((hi[0] + 2) & 3);
            wedge = true;
          } else if (hi.length === 2 && (((hi[0] + 1) & 3) === hi[1] || ((hi[1] + 1) & 3) === hi[0])) {
            put(pack, 'grass_slopeConcave', concaveSuffix(hi[0], hi[1]), wx, wy, h + 1);
            wedge = true;
          } else if (hi.length === 0) {
            for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
              const d2 = ((d + 1) & 3) as Dir;
              if (H[idx(lx + DX[d] + DX[d2], ly + DY[d] + DY[d2])] === h + 1) {
                put(pack, 'grass_slopeConvex', convexSuffix(d, d2), wx, wy, h + 1);
                wedge = true;
                break;
              }
            }
          }
        }

        // ---- feature objects ----
        if (feat?.obj) {
          for (const o of feat.obj) put(o.pack, o.name, o.dir, wx, wy, h + 1 + (o.dz ?? 0));
        }
        if (feat?.solid) flags[ci] |= F_BLOCKED;

        // ---- trees, rocks, decor ----
        if (!wedge && !feat?.clear && !feat?.obj) {
          const r = this.t.cellRand(wx, wy, 7);
          const moist = this.t.sample(wx, wy).moisture;
          if (bio === 'grass') {
            const treeP = p.forests * (0.12 + 0.5 * Math.max(0, moist - 0.35));
            if (r < treeP) {
              const r2 = this.t.cellRand(wx, wy, 8);
              const highland = h >= 4;
              const name = highland
                ? (r2 < 0.6 ? 'tree_pine' : 'tree_pineLarge')
                : r2 < 0.55 ? 'tree_single' : r2 < 0.85 ? 'tree_multiple' : 'tree_pine';
              const tp: Pack = name.startsWith('tree_pine') ? 'exp' : 'town';
              put(tp, name, DIR_N, wx, wy, h + 1);
              flags[ci] |= F_BLOCKED;
            } else if (r < treeP + 0.012 * p.decor) {
              put('town', h >= 4 ? 'rocks_dirt' : 'rocks_grass', DIR_N, wx, wy, h + 1);
              flags[ci] |= F_BLOCKED;
            }
          } else {
            const palmP = 0.015 + p.forests * 0.02 + (moist > p.desert - 0.08 ? 0.05 : 0);
            if (r < palmP) {
              const r2 = this.t.cellRand(wx, wy, 8);
              put('desert', r2 < 0.6 ? 'tree' : 'trees', DIR_N, wx, wy, h + 1);
              flags[ci] |= F_BLOCKED;
            } else if (r < palmP + 0.02 * p.decor) {
              const r2 = this.t.cellRand(wx, wy, 9);
              put('desert', r2 < 0.7 ? 'rocks' : 'overhang_small', DIR_N, wx, wy, h + 1);
              flags[ci] |= F_BLOCKED;
            }
          }
        }
      }
    }

    // shadow pass (after all tiles so stable sort keeps shades above cubes)
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const h = H[idx(lx, ly)];
        putShade(x0 + lx, y0 + ly, h === 0 ? 1 : h);
      }
    }

    placed.sort((a, b) => sortKey(a.x, a.y, a.z) - sortKey(b.x, b.y, b.z) || a.x - b.x);
    return { cx, cy, placed, plane, flags, rampDir, biome: biomeArr };
  }
}
