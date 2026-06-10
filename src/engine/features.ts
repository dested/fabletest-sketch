// Deterministic world features: rivers, villages, castles, desert relics.
//
// The world is divided into feature regions (REGION x REGION cells). Each
// region hashes to at most one feature whose stamp is computed lazily and
// cached. Stamps are bounded (STAMP_R) so a chunk only needs regions within
// a fixed radius. Rivers are longer: they get their own sparser grid and a
// generous scan radius, and every walk is fully deterministic.

import { hash32, rand01, rng } from './noise';
import { Terrain } from './terrain';
import { Dir, DX, DY } from './tileset';

export const REGION = 48;       // feature region size (cells)
export const STAMP_R = 16;      // max half-extent of any village/castle/relic stamp
export const RIVER_REGION = 96; // river spring grid
export const RIVER_MAX_LEN = 260;

export type FeatureKind = 'village' | 'castle' | 'relic';

export interface HeightOverride { h: number }

export interface CellFeature {
  /** extra placed object name (drawn at surface+1), pack decided by chunkgen */
  obj?: { pack: 'town' | 'exp' | 'desert'; name: string; dir: Dir; dz?: number }[];
  /** path connection mask for autotiling village paths */
  path?: boolean;
  /** suppress trees/decor */
  clear?: boolean;
  /** blocks walking */
  solid?: boolean;
}

export interface RegionStamp {
  kind: FeatureKind;
  anchor: { x: number; y: number; h: number };
  /** flat height override applied within radius */
  flatten?: { x0: number; y0: number; x1: number; y1: number; h: number };
  cells: Map<string, CellFeature>;
}

export interface RiverCell {
  mask: number;          // connection bits N=1 E=2 S=4 W=8 (on final heights)
  drop?: Dir;            // 1-level slope cell descending toward dir (on the LOW cell)
  fall?: Dir;            // multi-level waterfall column on the HIGH cell, pouring toward dir
  fallTo?: number;       // height of the cell the fall lands on
  mouth?: Dir;           // river enters open water through this edge (entry dir of flow)
  spring?: boolean;
}

const key = (x: number, y: number) => `${x},${y}`;

export class Features {
  private stamps = new Map<string, RegionStamp | null>();
  private riverCache = new Map<string, Map<string, RiverCell> | null>();

  constructor(private t: Terrain) {}

  // ---------- height with feature flattening ----------
  /** terrain height + village/castle flattening (rivers read THIS) */
  heightAt(x: number, y: number): number {
    const s = this.t.sample(x, y);
    if (s.water) return 0;
    const st = this.stampNear(x, y);
    if (st?.flatten) {
      const f = st.flatten;
      if (x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1) return f.h;
    }
    return s.height;
  }

  private stampNear(x: number, y: number): RegionStamp | null {
    const rx = Math.floor(x / REGION), ry = Math.floor(y / REGION);
    // stamps extend at most STAMP_R from anchor; anchor is within its region,
    // so checking the cell's own region + 8 neighbors covers everything.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const st = this.regionStamp(rx + dx, ry + dy);
      if (!st) continue;
      const f = st.flatten;
      if (f && x >= f.x0 - 1 && x <= f.x1 + 1 && y >= f.y0 - 1 && y <= f.y1 + 1) return st;
      if (!f && Math.abs(x - st.anchor.x) <= STAMP_R && Math.abs(y - st.anchor.y) <= STAMP_R) return st;
    }
    return null;
  }

  /** all stamps that may touch a cell range */
  stampsTouching(x0: number, y0: number, x1: number, y1: number): RegionStamp[] {
    const out: RegionStamp[] = [];
    const rx0 = Math.floor((x0 - STAMP_R) / REGION), rx1 = Math.floor((x1 + STAMP_R) / REGION);
    const ry0 = Math.floor((y0 - STAMP_R) / REGION), ry1 = Math.floor((y1 + STAMP_R) / REGION);
    for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) {
      const st = this.regionStamp(rx, ry);
      if (st) out.push(st);
    }
    return out;
  }

  // ---------- region stamps ----------
  regionStamp(rx: number, ry: number): RegionStamp | null {
    const k = key(rx, ry);
    let st = this.stamps.get(k);
    if (st !== undefined) return st;
    st = this.buildStamp(rx, ry);
    this.stamps.set(k, st);
    return st;
  }

  private buildStamp(rx: number, ry: number): RegionStamp | null {
    const p = this.t.p;
    const h0 = hash32(rx, ry, p.seed, 901);
    const roll = rand01(rx, ry, p.seed, 902);
    // anchor: deterministic spot inside region, away from edges
    const ax = rx * REGION + 10 + (hash32(rx, ry, p.seed, 903) % (REGION - 20));
    const ay = ry * REGION + 10 + (hash32(rx, ry, p.seed, 904) % (REGION - 20));
    const s = this.t.sample(ax, ay);
    if (s.water) return null;

    if (s.biome === 'desert') {
      if (roll < p.relics) return this.buildRelic(rx, ry, ax, ay, s.height, h0);
      return null;
    }
    // grass biome: villages prefer lowland, castles prefer high ground
    if (s.height >= 3 && roll < p.castles * 0.5) {
      return this.buildCastle(ax, ay, s.height, h0);
    }
    if (s.height >= 1 && s.height <= 4 && roll < p.villages * 0.75) {
      return this.buildVillage(ax, ay, s.height, h0);
    }
    return null;
  }

  private buildVillage(ax: number, ay: number, h: number, seed: number): RegionStamp {
    const r = rng(seed);
    const cells = new Map<string, CellFeature>();
    const W = 6 + Math.floor(r() * 3) * 2; // half-extent 6..10
    const flatten = { x0: ax - W, y0: ay - W, x1: ax + W, y1: ay + W, h };
    const get = (x: number, y: number) => {
      const k = key(x, y);
      let c = cells.get(k);
      if (!c) { c = {}; cells.set(k, c); }
      return c;
    };
    // main street cross
    for (let x = ax - W + 1; x <= ax + W - 1; x++) { const c = get(x, ay); c.path = true; c.clear = true; }
    for (let y = ay - W + 1; y <= ay + W - 1; y++) { const c = get(ax, y); c.path = true; c.clear = true; }
    // well at plaza center offset
    const wc = get(ax + 1, ay + 1); wc.obj = [{ pack: 'exp', name: 'well', dir: 0 }]; wc.solid = true; wc.clear = true;

    const roofColors = ['Green', 'Brown', 'Beige', 'Purple'];
    const houses = 4 + Math.floor(r() * 4);
    const spots: [number, number, Dir][] = [];
    // house plots flank the streets, door facing the street
    for (let i = 1; i < W - 1; i += 2) {
      spots.push([ax + i, ay - 2, 0 as Dir]); // south side of x street faces N(+y)? door faces street at ay
      spots.push([ax + i, ay + 2, 2 as Dir]);
      spots.push([ax - i, ay - 2, 0 as Dir]);
      spots.push([ax - i, ay + 2, 2 as Dir]);
      spots.push([ax - 2, ay + i, 1 as Dir]);
      spots.push([ax + 2, ay + i, 3 as Dir]);
      spots.push([ax - 2, ay - i, 1 as Dir]);
      spots.push([ax + 2, ay - i, 3 as Dir]);
    }
    // shuffle deterministically
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t2 = spots[i]; spots[i] = spots[j]; spots[j] = t2;
    }
    let placedH = 0;
    const used = new Set<string>();
    for (const [hx, hy, face] of spots) {
      if (placedH >= houses) break;
      // door faces toward the street: face dir points from house to street
      const overlaps = [key(hx, hy), key(hx + 1, hy), key(hx, hy + 1)].some((kk) => used.has(kk));
      if (overlaps) continue;
      const color = roofColors[Math.floor(r() * roofColors.length)];
      const two = r() < 0.45; // 2x1 house
      const axis = face === 0 || face === 2; // street runs along x -> house extends along x
      const c1 = get(hx, hy);
      c1.obj = [
        { pack: 'town', name: 'building_door', dir: ((face ^ 1) & 3) as Dir },
        { pack: 'town', name: two ? `roof_gable${color}` : (r() < 0.5 ? `roof_point${color}` : `roof_slant${color}`), dir: two ? (axis ? 0 : 1) as Dir : 0 as Dir, dz: 1 },
      ];
      c1.solid = true; c1.clear = true;
      used.add(key(hx, hy));
      if (two) {
        const bx = hx + (axis ? 1 : 0), by = hy + (axis ? 0 : 1);
        const c2 = get(bx, by);
        c2.obj = [
          { pack: 'town', name: 'building_windows', dir: ((face ^ 1) & 3) as Dir },
          { pack: 'town', name: `roof_gable${color}`, dir: (axis ? 0 : 1) as Dir, dz: 1 },
        ];
        c2.solid = true; c2.clear = true;
        used.add(key(bx, by));
      }
      placedH++;
    }
    // farm plot in one quadrant
    if (r() < 0.85) {
      const fx = ax + (r() < 0.5 ? -W + 1 : 3), fy = ay + (r() < 0.5 ? -W + 1 : 3);
      for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
        const c = get(fx + dx, fy + dy);
        if (c.obj || c.path) continue;
        c.obj = [{ pack: 'exp', name: dy === 1 ? 'furrow_cropWheat' : 'furrow_crop', dir: 0 }];
        c.clear = true; c.solid = true;
      }
    }
    return { kind: 'village', anchor: { x: ax, y: ay, h }, flatten, cells };
  }

  private buildCastle(ax: number, ay: number, h: number, seed: number): RegionStamp {
    const r = rng(seed);
    const cells = new Map<string, CellFeature>();
    const W = 4 + Math.floor(r() * 2); // wall half-extent
    const flatten = { x0: ax - W - 2, y0: ay - W - 2, x1: ax + W + 2, y1: ay + W + 2, h };
    const get = (x: number, y: number) => {
      const k = key(x, y);
      let c = cells.get(k);
      if (!c) { c = {}; cells.set(k, c); }
      return c;
    };
    const towerColor = ['', 'Beige', 'Brown', 'Green', 'Purple'][Math.floor(r() * 5)];
    const gateSide: Dir = r() < 0.5 ? 0 : 1; // gate on N (+y) or E (+x) wall — visible sides
    for (let i = -W; i <= W; i++) {
      for (const [wx, wy, axisX] of [
        [ax + i, ay - W, true], [ax + i, ay + W, true],
        [ax - W, ay + i, false], [ax + W, ay + i, false],
      ] as [number, number, boolean][]) {
        const corner = Math.abs(wx - ax) === W && Math.abs(wy - ay) === W;
        const c = get(wx, wy);
        c.clear = true;
        if (corner) {
          c.obj = [{ pack: 'town', name: `castle_tower${towerColor}`, dir: 0 }];
          c.solid = true;
          continue;
        }
        const isGate =
          (gateSide === 0 && wy === ay + W && wx === ax) ||
          (gateSide === 1 && wx === ax + W && wy === ay);
        if (isGate) {
          // gate opening faces outward: feature face = outward dir; suffix = face^1
          c.obj = [{ pack: 'town', name: 'castle_gateOpen', dir: ((gateSide ^ 1) & 3) as Dir }];
          c.path = true;
        } else {
          // wall runs along x on N/S walls: straight-family suffix N for x axis
          c.obj = [{ pack: 'town', name: 'castle_wall', dir: (axisX ? 0 : 1) as Dir }];
          c.solid = true;
        }
      }
    }
    // keep: 2x2 tall castle_center with towerTop caps
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const c = get(ax + dx - 0, ay + dy - 0);
      c.obj = [
        { pack: 'town', name: 'castle_center', dir: 0 },
        { pack: 'town', name: 'castle_center', dir: 0, dz: 1 },
      ];
      c.solid = true; c.clear = true;
    }
    get(ax, ay).obj!.push({ pack: 'exp', name: 'castle_towerCenter', dir: 0, dz: 2 });
    // path from gate outward + inside to keep
    if (gateSide === 0) {
      for (let y = ay + 1; y <= ay + W + 3; y++) { const c = get(ax, y); c.path = true; c.clear = true; }
    } else {
      for (let x = ax + 1; x <= ax + W + 3; x++) { const c = get(x, ay); c.path = true; c.clear = true; }
    }
    return { kind: 'castle', anchor: { x: ax, y: ay, h }, flatten, cells };
  }

  private buildRelic(rx: number, ry: number, ax: number, ay: number, h: number, seed: number): RegionStamp {
    const r = rng(seed);
    const cells = new Map<string, CellFeature>();
    const get = (x: number, y: number) => {
      const k = key(x, y);
      let c = cells.get(k);
      if (!c) { c = {}; cells.set(k, c); }
      return c;
    };
    const type = Math.floor(r() * 4);
    const flatten = { x0: ax - 5, y0: ay - 5, x1: ax + 5, y1: ay + 5, h };
    if (type === 0) {
      // ruined plaza: cracked tiles, broken walls, a dome
      for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
        const c = get(ax + dx, ay + dy);
        c.clear = true;
        const rr = r();
        if (Math.abs(dx) === 3 || Math.abs(dy) === 3) {
          if (rr < 0.4) { c.obj = [{ pack: 'desert', name: 'walls_broken', dir: (Math.abs(dy) === 3 ? 0 : 1) as Dir }]; c.solid = true; }
        } else if (rr < 0.75) {
          c.obj = [{ pack: 'desert', name: rr < 0.3 ? 'tiles_crumbled' : 'tiles', dir: 0 }];
        }
      }
      get(ax, ay).obj = [{ pack: 'desert', name: 'dome', dir: 0 }];
      get(ax, ay).solid = true;
    } else if (type === 1) {
      // tent camp around a tiled court
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const c = get(ax + dx, ay + dy); c.clear = true;
        if ((dx + dy) % 2 === 0) c.obj = [{ pack: 'desert', name: 'tiles', dir: 0 }];
      }
      for (const [dx, dy, d] of [[-2, 0, 1], [2, 1, 3], [0, -2, 0], [1, 2, 2]] as const) {
        const c = get(ax + dx, ay + dy);
        c.obj = [{ pack: 'desert', name: r() < 0.5 ? 'structure_tent' : 'structure_tentSlant', dir: ((d ^ 1) & 3) as Dir }];
        c.solid = true; c.clear = true;
      }
      get(ax + 3, ay + 3).obj = [{ pack: 'desert', name: 'tree', dir: 0 }];
      get(ax + 3, ay + 3).solid = true;
    } else if (type === 2) {
      // grand stair monument: stepped tiles platform with dome
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const c = get(ax + dx, ay + dy); c.clear = true;
        c.obj = [{ pack: 'desert', name: 'tiles_decorated', dir: 0 }];
      }
      get(ax, ay).obj = [
        { pack: 'desert', name: 'tiles_steps', dir: 0 },
        { pack: 'desert', name: 'dome_small', dir: 0, dz: 1 },
      ];
      get(ax, ay).solid = true;
    } else {
      // palm cluster + rocks (mini oasis without water)
      for (const [dx, dy] of [[0, 0], [1, 1], [-1, 1], [1, -1], [-2, 0], [0, 2]]) {
        const c = get(ax + dx, ay + dy);
        if (r() < 0.7) { c.obj = [{ pack: 'desert', name: r() < 0.5 ? 'tree' : 'trees', dir: 0 }]; c.solid = true; }
        c.clear = true;
      }
      get(ax + 2, ay).obj = [{ pack: 'desert', name: 'rocks', dir: 0 }];
      get(ax + 2, ay).solid = true;
    }
    return { kind: 'relic', anchor: { x: ax, y: ay, h }, cells, flatten };
  }

  // ---------- rivers ----------
  /** river cells for a spring region (cached). null if region spawns none. */
  riverFor(rx: number, ry: number): Map<string, RiverCell> | null {
    const k = key(rx, ry);
    let rv = this.riverCache.get(k);
    if (rv !== undefined) return rv;
    rv = this.buildRiver(rx, ry);
    this.riverCache.set(k, rv);
    return rv;
  }

  private buildRiver(rx: number, ry: number): Map<string, RiverCell> | null {
    const p = this.t.p;
    if (rand01(rx, ry, p.seed, 801) > p.rivers * 0.8) return null;
    // spring: probe a few spots, pick the highest land cell
    let sx = 0, sy = 0, sh = -1;
    for (let i = 0; i < 6; i++) {
      const px = rx * RIVER_REGION + 8 + (hash32(rx, ry, p.seed, 810 + i) % (RIVER_REGION - 16));
      const py = ry * RIVER_REGION + 8 + (hash32(rx, ry, p.seed, 820 + i) % (RIVER_REGION - 16));
      const hh = this.heightAt(px, py);
      if (hh > sh) { sh = hh; sx = px; sy = py; }
    }
    if (sh < 3) return null; // springs need high ground
    const cells = new Map<string, RiverCell>();
    const pathCells: { x: number; y: number; h: number }[] = [];
    let x: number = sx, y: number = sy, h: number = sh;
    let prevDir: Dir | null = null;
    for (let i = 0; i < RIVER_MAX_LEN; i++) {
      pathCells.push({ x, y, h });
      // choose next: lowest neighbor height; prefer continuing straight; never reverse
      let best: { d: Dir; h: number; score: number } | null = null;
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        if (prevDir !== null && d === ((prevDir + 2) & 3)) continue;
        const nx: number = x + DX[d], ny: number = y + DY[d];
        if (cells.has(key(nx, ny))) { best = { d, h: -2, score: -100 }; break; } // join existing river: flow into it
        const nh = this.heightAt(nx, ny);
        if (nh > h) continue; // never uphill
        const meander = rand01(nx, ny, p.seed, 830) * 1.2;
        const straightBonus: number = prevDir === d ? -0.45 : 0;
        const score: number = nh * 2 + meander + straightBonus;
        if (!best || score < best.score) best = { d, h: nh, score };
      }
      if (!best) break; // boxed in: end as a pond cap
      const d: Dir = best.d;
      const nx: number = x + DX[d], ny: number = y + DY[d];
      if (best.h === -2) {
        // confluence: add our entry bit to the existing cell and stop
        const c = cells.get(key(nx, ny))!;
        c.mask |= 1 << (((d + 2) & 3) as Dir);
        const pc = pathCells[pathCells.length - 1];
        const me = cells.get(key(pc.x, pc.y));
        if (me) me.mask |= 1 << d;
        break;
      }
      const nh = best.h;
      if (nh === 0) {
        // reached open water: mouth (entry edge = direction we flow = d's opposite side of the water cell)
        cells.set(key(nx, ny), { mask: 0, mouth: ((d + 2) & 3) as Dir });
        const pc = key(x, y);
        const c0 = cells.get(pc);
        if (c0) c0.mask |= 1 << d;
        else cells.set(pc, { mask: 1 << d });
        break;
      }
      // link masks
      const ck = key(x, y);
      const c0 = cells.get(ck) ?? { mask: 0 };
      c0.mask |= 1 << d;
      if (i === 0) c0.spring = true;
      cells.set(ck, c0);
      const nk = key(nx, ny);
      const c1 = cells.get(nk) ?? { mask: 0 };
      c1.mask |= 1 << (((d + 2) & 3) as Dir);
      if (h - nh === 1) {
        c1.drop = d; // slope cell on the LOW side descending along flow
      } else if (h - nh >= 2) {
        c0.fall = d; // waterfall column on the HIGH cell
        c0.fallTo = nh;
      }
      cells.set(nk, c1);
      x = nx; y = ny; h = nh; prevDir = d;
    }
    if (pathCells.length < 12) return null; // too stubby, skip
    return cells;
  }

  /** all river cells touching a range */
  riversTouching(x0: number, y0: number, x1: number, y1: number): Map<string, RiverCell> {
    const out = new Map<string, RiverCell>();
    const pad = RIVER_MAX_LEN;
    const rx0 = Math.floor((x0 - pad) / RIVER_REGION), rx1 = Math.floor((x1 + pad) / RIVER_REGION);
    const ry0 = Math.floor((y0 - pad) / RIVER_REGION), ry1 = Math.floor((y1 + pad) / RIVER_REGION);
    for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) {
      const rv = this.riverFor(rx, ry);
      if (!rv) continue;
      for (const [k, c] of rv) {
        const [cx, cy] = k.split(',').map(Number);
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
          const prev = out.get(k);
          if (prev) prev.mask |= c.mask;
          else out.set(k, { ...c });
        }
      }
    }
    return out;
  }
}
