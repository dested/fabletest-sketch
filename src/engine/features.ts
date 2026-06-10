// Deterministic world features: rivers, walled towns, castles, desert relics,
// connecting roads.
//
// The world is divided into feature regions (REGION x REGION cells). Each
// region hashes to at most one feature whose stamp is computed lazily and
// cached. Stamps are bounded (STAMP_R) so a chunk only needs regions within
// a fixed radius. Rivers and roads are longer: they get generous scan radii,
// and every walk is fully deterministic.

import { hash32, rand01, rng } from './noise';
import { Terrain } from './terrain';
import { Dir, DX, DY } from './tileset';

export const REGION = 56;       // feature region size (cells)
export const STAMP_R = 27;      // max half-extent of any stamp (must be <= REGION/2)
export const RIVER_REGION = 96; // river spring grid
export const RIVER_MAX_LEN = 260;

export type FeatureKind = 'village' | 'castle' | 'relic' | 'ruin';

export interface CellFeature {
  /** placed objects (drawn at surface+1+dz) */
  obj?: { pack: 'town' | 'exp' | 'desert'; name: string; dir: Dir; dz?: number }[];
  path?: boolean;
  clear?: boolean;
  solid?: boolean;
}

export interface RegionStamp {
  kind: FeatureKind;
  anchor: { x: number; y: number; h: number };
  flatten?: { x0: number; y0: number; x1: number; y1: number; h: number };
  cells: Map<string, CellFeature>;
  /** suggested wanderer count for the NPC system */
  npcs: number;
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
  private roadCache = new Map<string, Set<string> | null>();

  constructor(private t: Terrain) {}

  // ---------- height with feature flattening ----------
  heightAt(x: number, y: number): number {
    const s = this.t.sample(x, y);
    if (s.water) return 0;
    const rx = Math.floor(x / REGION), ry = Math.floor(y / REGION);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const st = this.regionStamp(rx + dx, ry + dy);
      const f = st?.flatten;
      if (f && x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1) return f.h;
    }
    return s.height;
  }

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

  private anchorFor(rx: number, ry: number): { ax: number; ay: number } {
    const p = this.t.p;
    const span = Math.max(4, REGION - STAMP_R * 2 + 8);
    const ax = rx * REGION + STAMP_R - 4 + (hash32(rx, ry, p.seed, 903) % span);
    const ay = ry * REGION + STAMP_R - 4 + (hash32(rx, ry, p.seed, 904) % span);
    return { ax, ay };
  }

  private buildStamp(rx: number, ry: number): RegionStamp | null {
    const p = this.t.p;
    const h0 = hash32(rx, ry, p.seed, 901);
    const roll = rand01(rx, ry, p.seed, 902);
    const { ax, ay } = this.anchorFor(rx, ry);
    const s = this.t.sample(ax, ay);
    if (s.water) return null;

    if (s.biome === 'desert') {
      if (roll < p.relics) return this.buildRelic(ax, ay, s.height, h0);
      return null;
    }
    if (s.height >= 3 && roll < p.castles * 0.55) {
      return this.buildCastle(ax, ay, s.height, h0);
    }
    if (roll < p.villages * 0.85) {
      return this.buildVillage(ax, ay, Math.min(s.height, 5), h0);
    }
    if (roll < p.villages * 0.85 + 0.12) {
      return this.buildRuin(ax, ay, s.height, h0);
    }
    return null;
  }

  // ====================================================================
  // VILLAGE / WALLED TOWN
  // ====================================================================
  private buildVillage(ax: number, ay: number, h: number, seed: number): RegionStamp {
    const r = rng(seed);
    const cells = new Map<string, CellFeature>();
    const W = 13 + Math.floor(r() * 8);            // half-extent 13..20
    const walled = W >= 16 && r() < 0.75;          // big towns get walls
    const RING = W - 4;                            // ring road radius
    const flatten = { x0: ax - W, y0: ay - W, x1: ax + W, y1: ay + W, h };
    const get = (x: number, y: number) => {
      const k = key(x, y);
      let c = cells.get(k);
      if (!c) { c = {}; cells.set(k, c); }
      return c;
    };
    const road = (x: number, y: number) => { const c = get(x, y); c.path = true; c.clear = true; };

    // ring road
    for (let i = -RING; i <= RING; i++) {
      road(ax + i, ay - RING); road(ax + i, ay + RING);
      road(ax - RING, ay + i); road(ax + RING, ay + i);
    }
    // cross streets through the middle, continuing to the town edge
    for (let i = -W; i <= W; i++) { road(ax + i, ay); road(ax, ay + i); }
    // secondary streets: split the town into city blocks
    const HALF = Math.floor(RING / 2);
    for (let i = -RING; i <= RING; i++) {
      road(ax + i, ay - HALF); road(ax + i, ay + HALF);
      road(ax - HALF, ay + i); road(ax + HALF, ay + i);
    }

    // plaza at center
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) road(ax + dx, ay + dy);
    const wc = get(ax + 1, ay + 1);
    wc.obj = [{ pack: 'exp', name: 'well', dir: 0 }]; wc.solid = true; wc.path = false;

    // town wall
    if (walled) {
      const WW = W - 1;
      for (let i = -WW; i <= WW; i++) {
        for (const [wx, wy, axisX] of [
          [ax + i, ay - WW, true], [ax + i, ay + WW, true],
          [ax - WW, ay + i, false], [ax + WW, ay + i, false],
        ] as [number, number, boolean][]) {
          const c = get(wx, wy);
          if (c.path) {
            // street pierces the wall: open gate
            c.obj = [{ pack: 'town', name: 'castle_gateOpen', dir: (axisX ? 0 : 1) as Dir }];
            continue;
          }
          c.clear = true;
          if (Math.abs(wx - ax) === WW && Math.abs(wy - ay) === WW) {
            c.obj = [{ pack: 'town', name: 'castle_tower', dir: 0 }];
          } else {
            c.obj = [{ pack: 'town', name: 'castle_wall', dir: (axisX ? 0 : 1) as Dir }];
          }
          c.solid = true;
        }
      }
    }

    const roofColors = ['Green', 'Brown', 'Beige', 'Purple'];
    const used = new Set<string>();
    const claim = (x: number, y: number) => used.add(key(x, y));
    const free = (x: number, y: number) =>
      !used.has(key(x, y)) && !cells.get(key(x, y))?.path && !cells.get(key(x, y))?.obj;

    // ---- church near the plaza (tower + gable hall, door faces +x street) ----
    {
      const cx = ax - 5, cy = ay - 3;
      const color = roofColors[Math.floor(r() * 4)];
      const parts: [number, string, string, number][] = [
        [2, 'building_door', `roof_church${color}`, 0],
        [1, 'building_windows', `roof_gable${color}`, 0],
        [0, 'building_window', `roof_gable${color}`, 0],
      ];
      for (const [dx, body, roof] of parts) {
        const c = get(cx + dx, cy);
        c.obj = [
          { pack: 'town', name: body, dir: 0 as Dir },        // features face +y street side? door suffix N => face E... see orient: face=dir^1
          { pack: 'town', name: roof, dir: 0 as Dir, dz: 1 },
        ];
        c.solid = true; c.clear = true;
        claim(cx + dx, cy);
      }
      // door of the church faces N (+y): suffix N^1=E... building suffix table: face = suffix^1 -> for face N use suffix E
      const doorCell = cells.get(key(cx + 2, cy))!;
      doorCell.obj![0].dir = 1 as Dir; // face N (+y)
      for (let y2 = cy + 1; y2 < ay; y2++) road(cx + 2, y2); // spur to main street
    }

    // ---- houses: line every street on both sides ----
    type Spot = { x: number; y: number; face: Dir };
    const spots: Spot[] = [];
    const addRow = (x: number, y: number, face: Dir) => spots.push({ x, y, face });
    const streetRows = [0, HALF, -HALF, RING, -RING];
    for (const sr of streetRows) {
      for (let i = -RING + 1; i <= RING - 1; i++) {
        if (Math.abs(i) < 2 && sr === 0) continue; // keep the plaza open
        // houses flanking horizontal streets (face toward the street)
        addRow(ax + i, ay + sr - 1, 0 as Dir);
        addRow(ax + i, ay + sr + 1, 2 as Dir);
        // houses flanking vertical streets
        addRow(ax + sr - 1, ay + i, 1 as Dir);
        addRow(ax + sr + 1, ay + i, 3 as Dir);
      }
    }
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t2 = spots[i]; spots[i] = spots[j]; spots[j] = t2;
    }
    const targetHouses = 22 + Math.floor(r() * 12);
    let placed = 0;
    for (const sp of spots) {
      if (placed >= targetHouses) break;
      const two = r() < 0.5;
      const tall = r() < 0.28;
      const axis = sp.face === 0 || sp.face === 2;
      const bx2 = sp.x + (two ? (axis ? 1 : 0) : 0), by2 = sp.y + (two ? (axis ? 0 : 1) : 0);
      if (!free(sp.x, sp.y) || (two && !free(bx2, by2))) continue;
      const color = roofColors[Math.floor(r() * 4)];
      const beige = r() < 0.3 ? 'Beige' : '';
      const mk = (x: number, y: number, body: string) => {
        const c = get(x, y);
        c.obj = [];
        c.obj.push({ pack: 'town', name: `${body}${beige}`, dir: ((sp.face ^ 1) & 3) as Dir });
        let dz = 1;
        if (tall) {
          c.obj.push({ pack: 'exp', name: `building_stack${beige}`, dir: ((sp.face ^ 1) & 3) as Dir, dz });
          dz++;
        }
        c.obj.push({
          pack: 'town',
          name: two ? `roof_gable${color}` : r() < 0.4 ? `roof_point${color}` : `roof_slant${color}`,
          dir: two ? ((axis ? 0 : 1) as Dir) : 0,
          dz,
        });
        c.solid = true; c.clear = true;
        claim(x, y);
      };
      mk(sp.x, sp.y, 'building_door');
      if (two) mk(bx2, by2, r() < 0.5 ? 'building_windows' : 'building_window');
      placed++;
    }

    // ---- farms with fences outside the ring ----
    const farms = 2 + Math.floor(r() * 3);
    for (let f = 0; f < farms; f++) {
      const qx = r() < 0.5 ? -1 : 1, qy = r() < 0.5 ? -1 : 1;
      const fx = ax + qx * (RING + 1), fy = ay + qy * (RING + 1);
      const fw = 3 + Math.floor(r() * 3), fh = 2 + Math.floor(r() * 3);
      const x0 = qx < 0 ? fx - fw : fx, y0 = qy < 0 ? fy - fh : fy;
      let ok = true;
      for (let x = x0; x <= x0 + fw && ok; x++) for (let y = y0; y <= y0 + fh && ok; y++) {
        if (!free(x, y) || Math.abs(x - ax) > W - 1 || Math.abs(y - ay) > W - 1) ok = false;
      }
      if (!ok) continue;
      for (let x = x0; x <= x0 + fw; x++) for (let y = y0; y <= y0 + fh; y++) {
        const c = get(x, y);
        c.clear = true;
        const border = x === x0 || x === x0 + fw || y === y0 || y === y0 + fh;
        if (border) {
          const corner = (x === x0 || x === x0 + fw) && (y === y0 || y === y0 + fh);
          c.obj = [{ pack: 'exp', name: corner ? 'fence_woodCorner' : 'fence_wood', dir: ((y === y0 || y === y0 + fh) && !corner ? 0 : 1) as Dir }];
          c.solid = true;
        } else {
          const wheat = r() < 0.5;
          c.obj = [{ pack: 'exp', name: wheat ? 'furrow_cropWheat' : 'furrow_crop', dir: 0 }];
          c.solid = true;
        }
        claim(x, y);
      }
    }

    // ---- orchard rows ----
    if (r() < 0.7) {
      const ox = ax + (r() < 0.5 ? -RING - 1 : RING - 5), oy = ay + (r() < 0.5 ? -RING - 1 : RING - 5);
      for (let dx = 0; dx < 6; dx += 2) for (let dy = 0; dy < 6; dy += 2) {
        if (!free(ox + dx, oy + dy)) continue;
        const c = get(ox + dx, oy + dy);
        c.obj = [{ pack: 'town', name: 'tree_single', dir: 0 }];
        c.solid = true; c.clear = true;
      }
    }

    // little shrine
    if (r() < 0.5) {
      const c = get(ax - 1, ay + RING - 1);
      if (!c.obj && !c.path) {
        c.obj = [{ pack: 'town', name: r() < 0.5 ? 'structure_low' : 'structure_arch', dir: 1 }];
        c.solid = true; c.clear = true;
      }
    }

    return { kind: 'village', anchor: { x: ax, y: ay, h }, flatten, cells, npcs: 8 + Math.floor(r() * 5) };
  }

  // ====================================================================
  // CASTLE
  // ====================================================================
  private buildCastle(ax: number, ay: number, h: number, seed: number): RegionStamp {
    const r = rng(seed);
    const cells = new Map<string, CellFeature>();
    const W = 9 + Math.floor(r() * 4); // curtain wall half-extent 9..12
    const flatten = { x0: ax - W - 3, y0: ay - W - 3, x1: ax + W + 3, y1: ay + W + 3, h };
    const get = (x: number, y: number) => {
      const k = key(x, y);
      let c = cells.get(k);
      if (!c) { c = {}; cells.set(k, c); }
      return c;
    };
    const road = (x: number, y: number) => { const c = get(x, y); c.path = true; c.clear = true; };
    const towerColor = ['', 'Beige', 'Brown', 'Green', 'Purple'][Math.floor(r() * 5)];
    const gateSide: Dir = r() < 0.5 ? 0 : 1;

    // approach road first so the wall knows where the gate pierces
    if (gateSide === 0) for (let y = ay; y <= ay + W + 3; y++) road(ax, y);
    else for (let x = ax; x <= ax + W + 3; x++) road(x, ay);

    // curtain wall with regular towers
    for (let i = -W; i <= W; i++) {
      for (const [wx, wy, axisX] of [
        [ax + i, ay - W, true], [ax + i, ay + W, true],
        [ax - W, ay + i, false], [ax + W, ay + i, false],
      ] as [number, number, boolean][]) {
        const c = get(wx, wy);
        const corner = Math.abs(wx - ax) === W && Math.abs(wy - ay) === W;
        const midTower = !corner && Math.abs(i) === Math.floor(W / 2);
        if (c.path) {
          c.obj = [{ pack: 'town', name: 'castle_gateOpen', dir: (axisX ? 0 : 1) as Dir }];
          continue;
        }
        c.clear = true; c.solid = true;
        if (corner || midTower) {
          c.obj = [{ pack: 'town', name: `castle_tower${towerColor}`, dir: 0 }];
        } else {
          c.obj = [{ pack: 'town', name: 'castle_wall', dir: (axisX ? 0 : 1) as Dir }];
        }
      }
    }
    // flanking gate towers
    if (gateSide === 0) {
      for (const gx of [ax - 1, ax + 1]) {
        const c = get(gx, ay + W);
        c.obj = [{ pack: 'town', name: `castle_tower${towerColor}`, dir: 0 }];
        c.solid = true; c.clear = true; c.path = false;
      }
    } else {
      for (const gy of [ay - 1, ay + 1]) {
        const c = get(ax + W, gy);
        c.obj = [{ pack: 'town', name: `castle_tower${towerColor}`, dir: 0 }];
        c.solid = true; c.clear = true; c.path = false;
      }
    }

    // ---- keep: 4x4, two stories, turrets on corners ----
    const kx = ax - 2, ky = ay - 2;
    for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 4; dy++) {
      const x = kx + dx, y = ky + dy;
      const c = get(x, y);
      if (c.path) c.path = false; // keep overrides the road stub under it
      const corner = (dx === 0 || dx === 3) && (dy === 0 || dy === 3);
      c.obj = [];
      const stories = 2;
      for (let s2 = 0; s2 < stories; s2++) {
        c.obj.push({ pack: 'town', name: 'castle_center', dir: 0, dz: s2 });
      }
      if (corner) {
        const tc = towerColor || 'Brown';
        c.obj.push({ pack: 'exp', name: `castle_tower${tc}Base`, dir: 0, dz: stories });
        c.obj.push({ pack: 'exp', name: `castle_tower${tc}Top`, dir: 0, dz: stories + 1 });
      } else {
        c.obj.push({ pack: 'town', name: 'castle_wall', dir: (dy === 0 || dy === 3 ? 0 : 1) as Dir, dz: stories });
      }
      c.solid = true; c.clear = true;
    }

    // courtyard: well + barracks
    {
      const c = get(ax + 3, ay + 3);
      if (!c.path && !c.obj) { c.obj = [{ pack: 'exp', name: 'well', dir: 0 }]; c.solid = true; c.clear = true; }
    }
    const color = ['Green', 'Brown', 'Beige', 'Purple'][Math.floor(r() * 4)];
    for (const [bx, by] of [[ax - W + 2, ay - W + 2], [ax + W - 3, ay - W + 2]] as const) {
      const c1 = get(bx, by), c2 = get(bx, by + 1);
      if (c1.path || c2.path || c1.obj || c2.obj) continue;
      c1.obj = [
        { pack: 'town', name: 'building_door', dir: 0 as Dir }, // door faces E (+x)
        { pack: 'town', name: `roof_gable${color}`, dir: 1, dz: 1 },
      ];
      c2.obj = [
        { pack: 'town', name: 'building_windows', dir: 0 as Dir },
        { pack: 'town', name: `roof_gable${color}`, dir: 1, dz: 1 },
      ];
      c1.solid = c2.solid = true; c1.clear = c2.clear = true;
    }
    // courtyard ring path inside the walls
    for (let i = -W + 3; i <= W - 3; i++) {
      road(ax + i, ay - W + 3); road(ax + i, ay + W - 3);
      road(ax - W + 3, ay + i); road(ax + W - 3, ay + i);
    }

    return { kind: 'castle', anchor: { x: ax, y: ay, h }, flatten, cells, npcs: 5 + Math.floor(r() * 4) };
  }

  // ====================================================================
  // DESERT RELICS — sprawling ruin complexes
  // ====================================================================
  private buildRelic(ax: number, ay: number, h: number, seed: number): RegionStamp {
    const r = rng(seed);
    const cells = new Map<string, CellFeature>();
    const get = (x: number, y: number) => {
      const k = key(x, y);
      let c = cells.get(k);
      if (!c) { c = {}; cells.set(k, c); }
      return c;
    };
    const type = Math.floor(r() * 3);
    const W = 8 + Math.floor(r() * 5);
    const flatten = { x0: ax - W, y0: ay - W, x1: ax + W, y1: ay + W, h };

    if (type === 0) {
      // lost city: grid of broken walls, court tiles, domes
      for (let dx = -W + 1; dx <= W - 1; dx++) for (let dy = -W + 1; dy <= W - 1; dy++) {
        const x = ax + dx, y = ay + dy;
        const rr = rand01(x, y, seed, 11);
        const c = get(x, y);
        c.clear = true;
        const onGrid = (((dx % 5) + 5) % 5 === 0) || (((dy % 5) + 5) % 5 === 0);
        if (onGrid && rr < 0.5) {
          c.obj = [{ pack: 'desert', name: rr < 0.18 ? 'walls_broken' : 'walls_sides', dir: ((((dy % 5) + 5) % 5 === 0) ? 0 : 1) as Dir }];
          c.solid = true;
        } else if (rr < 0.68) {
          c.obj = [{ pack: 'desert', name: rr < 0.6 ? 'tiles' : 'tiles_crumbled', dir: 0 }];
        }
      }
      for (const [dx, dy] of [[0, 0], [-5, -5], [5, 5], [-5, 5], [5, -5]]) {
        const c = get(ax + dx, ay + dy);
        c.obj = [{ pack: 'desert', name: Math.abs(dx) === 5 ? 'dome_small' : 'dome', dir: 0 }];
        c.solid = true; c.clear = true;
      }
    } else if (type === 1) {
      // grand tiered temple with a stair line on the +y face and dome crown
      const tiers = 3;
      for (let t2 = 0; t2 < tiers; t2++) {
        const R2 = Math.max(2, W - 3 - t2 * 2);
        for (let dx = -R2; dx <= R2; dx++) for (let dy = -R2; dy <= R2; dy++) {
          const c = get(ax + dx, ay + dy);
          c.clear = true;
          if (!c.obj) c.obj = [];
          c.obj.push({ pack: 'desert', name: 'tiles_decorated', dir: 0, dz: t2 });
          c.solid = true;
        }
      }
      // stair column on the +y side: replace decorated tiles with steps
      for (let t2 = 0; t2 < tiers; t2++) {
        const R2 = Math.max(2, W - 3 - t2 * 2);
        const c = get(ax, ay + R2);
        if (c.obj) {
          c.obj = c.obj.map((o) => (o.dz === t2 ? { ...o, name: 'tiles_steps', dir: 0 as Dir } : o));
        }
      }
      const top = get(ax, ay);
      top.obj = top.obj ?? [];
      top.obj.push({ pack: 'desert', name: 'dome', dir: 0, dz: tiers });
    } else {
      // caravan camp: tents, palms, market court
      for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
        const c = get(ax + dx, ay + dy);
        c.clear = true;
        if ((dx + dy + 100) % 2 === 0 && Math.abs(dx) + Math.abs(dy) <= 5) {
          c.obj = [{ pack: 'desert', name: 'tiles', dir: 0 }];
        }
      }
      for (const [dx, dy, d] of [[-3, 0, 1], [3, 1, 3], [0, -3, 0], [1, 3, 2], [-2, -3, 0]] as const) {
        const c = get(ax + dx, ay + dy);
        c.obj = [{ pack: 'desert', name: r() < 0.5 ? 'structure_tent' : 'structure_tentSlant', dir: ((d ^ 1) & 3) as Dir }];
        c.solid = true; c.clear = true;
      }
      for (const [dx, dy] of [[4, 4], [-4, 3], [3, -4], [-4, -4], [5, 0]]) {
        const c = get(ax + dx, ay + dy);
        if (!c.obj) {
          c.obj = [{ pack: 'desert', name: r() < 0.6 ? 'tree' : 'trees', dir: 0 }];
          c.solid = true; c.clear = true;
        }
      }
    }
    return { kind: 'relic', anchor: { x: ax, y: ay, h }, cells, flatten, npcs: type === 2 ? 4 : 2 };
  }

  // ---- small grass ruin (filler so the wilds never feel empty) ----
  private buildRuin(ax: number, ay: number, h: number, seed: number): RegionStamp {
    const r = rng(seed);
    const cells = new Map<string, CellFeature>();
    const get = (x: number, y: number) => {
      const k = key(x, y);
      let c = cells.get(k);
      if (!c) { c = {}; cells.set(k, c); }
      return c;
    };
    const hh = Math.max(1, h);
    const flatten = { x0: ax - 4, y0: ay - 4, x1: ax + 4, y1: ay + 4, h: hh };
    for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2], [-2, 1], [1, -2]]) {
      if (r() < 0.7) {
        const c = get(ax + dx, ay + dy);
        c.obj = [{ pack: 'town', name: r() < 0.4 ? 'structure_high' : r() < 0.7 ? 'structure_low' : 'structure_arch', dir: (r() < 0.5 ? 0 : 1) as Dir }];
        c.solid = true; c.clear = true;
      }
    }
    const c = get(ax - 1, ay - 1);
    if (!c.obj) { c.obj = [{ pack: 'town', name: 'rocks_grass', dir: 0 }]; c.solid = true; }
    return { kind: 'ruin', anchor: { x: ax, y: ay, h: hh }, cells, flatten, npcs: 0 };
  }

  // ====================================================================
  // ROADS between neighboring settlements
  // ====================================================================
  private roadFor(rx: number, ry: number): Set<string> | null {
    const k = key(rx, ry);
    let rd = this.roadCache.get(k);
    if (rd !== undefined) return rd;
    rd = this.buildRoads(rx, ry);
    this.roadCache.set(k, rd);
    return rd;
  }

  private buildRoads(rx: number, ry: number): Set<string> | null {
    const here = this.regionStamp(rx, ry);
    if (!here || (here.kind !== 'village' && here.kind !== 'castle')) return null;
    const out = new Set<string>();
    for (const [drx, dry] of [[1, 0], [0, 1]]) {
      let target: RegionStamp | null = null;
      for (let step = 1; step <= 2 && !target; step++) {
        const st = this.regionStamp(rx + drx * step, ry + dry * step);
        if (st && (st.kind === 'village' || st.kind === 'castle')) target = st;
      }
      if (!target) continue;
      // L-path, skipping water cells (rivers crossed via auto bridges)
      let x: number = here.anchor.x, y: number = here.anchor.y;
      const tx = target.anchor.x, ty = target.anchor.y;
      while (x !== tx) { x += Math.sign(tx - x); if (this.t.sample(x, y).height > 0) out.add(key(x, y)); }
      while (y !== ty) { y += Math.sign(ty - y); if (this.t.sample(x, y).height > 0) out.add(key(x, y)); }
    }
    return out.size ? out : null;
  }

  /** road cells within a range (roads span at most ~2 regions from their source) */
  roadsTouching(x0: number, y0: number, x1: number, y1: number): Set<string> {
    const out = new Set<string>();
    const rx0 = Math.floor(x0 / REGION) - 2, rx1 = Math.floor(x1 / REGION) + 2;
    const ry0 = Math.floor(y0 / REGION) - 2, ry1 = Math.floor(y1 / REGION) + 2;
    for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) {
      const rd = this.roadFor(rx, ry);
      if (!rd) continue;
      for (const k of rd) {
        const i = k.indexOf(',');
        const cx = +k.slice(0, i), cy = +k.slice(i + 1);
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) out.add(k);
      }
    }
    return out;
  }

  // ====================================================================
  // RIVERS
  // ====================================================================
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
    let sx = 0, sy = 0, sh = -1;
    for (let i = 0; i < 6; i++) {
      const px = rx * RIVER_REGION + 8 + (hash32(rx, ry, p.seed, 810 + i) % (RIVER_REGION - 16));
      const py = ry * RIVER_REGION + 8 + (hash32(rx, ry, p.seed, 820 + i) % (RIVER_REGION - 16));
      const hh = this.heightAt(px, py);
      if (hh > sh) { sh = hh; sx = px; sy = py; }
    }
    if (sh < 3) return null;
    const cells = new Map<string, RiverCell>();
    const pathCells: { x: number; y: number; h: number }[] = [];
    let x: number = sx, y: number = sy, h: number = sh;
    let prevDir: Dir | null = null;
    for (let i = 0; i < RIVER_MAX_LEN; i++) {
      pathCells.push({ x, y, h });
      let best: { d: Dir; h: number; score: number } | null = null;
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        if (prevDir !== null && d === ((prevDir + 2) & 3)) continue;
        const nx: number = x + DX[d], ny: number = y + DY[d];
        if (cells.has(key(nx, ny))) { best = { d, h: -2, score: -100 }; break; }
        const nh = this.heightAt(nx, ny);
        if (nh > h) continue;
        const meander = rand01(nx, ny, p.seed, 830) * 1.2;
        const straightBonus: number = prevDir === d ? -0.45 : 0;
        const score: number = nh * 2 + meander + straightBonus;
        if (!best || score < best.score) best = { d, h: nh, score };
      }
      if (!best) break;
      const d: Dir = best.d;
      const nx: number = x + DX[d], ny: number = y + DY[d];
      if (best.h === -2) {
        const c = cells.get(key(nx, ny))!;
        c.mask |= 1 << (((d + 2) & 3) as Dir);
        const pc = pathCells[pathCells.length - 1];
        const me = cells.get(key(pc.x, pc.y));
        if (me) me.mask |= 1 << d;
        break;
      }
      const nh = best.h;
      if (nh === 0) {
        cells.set(key(nx, ny), { mask: 0, mouth: ((d + 2) & 3) as Dir });
        const pc = key(x, y);
        const c0m = cells.get(pc);
        if (c0m) c0m.mask |= 1 << d;
        else cells.set(pc, { mask: 1 << d });
        break;
      }
      const ck = key(x, y);
      const c0 = cells.get(ck) ?? { mask: 0 };
      c0.mask |= 1 << d;
      if (i === 0) c0.spring = true;
      cells.set(ck, c0);
      const nk = key(nx, ny);
      const c1 = cells.get(nk) ?? { mask: 0 };
      c1.mask |= 1 << (((d + 2) & 3) as Dir);
      if (h - nh === 1) {
        c1.drop = d;
      } else if (h - nh >= 2) {
        c0.fall = d;
        c0.fallTo = nh;
      }
      cells.set(nk, c1);
      x = nx; y = ny; h = nh; prevDir = d;
    }
    if (pathCells.length < 12) return null;
    return cells;
  }

  riversTouching(x0: number, y0: number, x1: number, y1: number): Map<string, RiverCell> {
    const out = new Map<string, RiverCell>();
    const pad = RIVER_MAX_LEN;
    const rx0 = Math.floor((x0 - pad) / RIVER_REGION), rx1 = Math.floor((x1 + pad) / RIVER_REGION);
    const ry0 = Math.floor((y0 - pad) / RIVER_REGION), ry1 = Math.floor((y1 + pad) / RIVER_REGION);
    for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) {
      const rv = this.riverFor(rx, ry);
      if (!rv) continue;
      for (const [k, c] of rv) {
        const i = k.indexOf(',');
        const cx = +k.slice(0, i), cy = +k.slice(i + 1);
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
