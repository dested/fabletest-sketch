// World: chunk cache + walkability queries. The single object the renderer
// and the player controller talk to.

import { WorldParams } from './params';
import { Terrain } from './terrain';
import { Features } from './features';
import { ChunkGen, Chunk, CHUNK, F_BLOCKED, F_RAMP, F_WATER, F_BRIDGE } from './chunkgen';
import { Dir, DX, DY } from './tileset';

const MAX_CHUNKS = 220;

export class World {
  readonly terrain: Terrain;
  readonly features: Features;
  private gen: ChunkGen;
  private chunks = new Map<string, Chunk>();
  private order: string[] = []; // LRU

  constructor(readonly params: WorldParams) {
    this.terrain = new Terrain(params);
    this.features = new Features(this.terrain);
    this.gen = new ChunkGen(this.terrain, this.features);
  }

  chunkAt(cx: number, cy: number): Chunk {
    const k = `${cx},${cy}`;
    let c = this.chunks.get(k);
    if (!c) {
      c = this.gen.generate(cx, cy);
      this.chunks.set(k, c);
      this.order.push(k);
      if (this.order.length > MAX_CHUNKS) {
        const evict = this.order.shift()!;
        this.chunks.delete(evict);
      }
    }
    return c;
  }

  private cell(x: number, y: number): { c: Chunk; i: number } {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    const c = this.chunkAt(cx, cy);
    const i = (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK);
    return { c, i };
  }

  planeAt(x: number, y: number): number {
    const { c, i } = this.cell(x, y);
    return c.plane[i];
  }
  flagsAt(x: number, y: number): number {
    const { c, i } = this.cell(x, y);
    return c.flags[i];
  }
  rampDirAt(x: number, y: number): number {
    const { c, i } = this.cell(x, y);
    return c.rampDir[i];
  }
  biomeAt(x: number, y: number): 'grass' | 'desert' {
    const { c, i } = this.cell(x, y);
    return c.biome[i] ? 'desert' : 'grass';
  }

  /**
   * Walking surface inside one cell, evaluated at fractional world coords.
   * Flat cells are flat at their plane. Wedge cells (straight slopes AND
   * convex/concave corners) interpolate bilinearly between vertex heights,
   * where each grid vertex takes the MAX walk plane of its 4 touching cells,
   * clamped to [p, p+1]. This is continuous across every cell boundary, so
   * walking over any slope or corner is smooth.
   */
  zInCell(cx: number, cy: number, fx: number, fy: number): number {
    const p = this.planeAt(cx, cy);
    if (!(this.flagsAt(cx, cy) & F_RAMP)) return p;
    const vtx = (ix: number, iy: number): number => {
      // vertex at grid corner (cx-0.5+ix, cy-0.5+iy): 4 touching cells
      let m = p;
      for (let dx = ix - 1; dx <= ix; dx++) for (let dy = iy - 1; dy <= iy; dy++) {
        if (dx === 0 && dy === 0) continue;
        m = Math.max(m, this.planeAt(cx + dx, cy + dy));
      }
      return Math.min(p + 1, m);
    };
    const du = Math.min(1, Math.max(0, fx - cx + 0.5));
    const dv = Math.min(1, Math.max(0, fy - cy + 0.5));
    const v00 = vtx(0, 0), v10 = vtx(1, 0), v01 = vtx(0, 1), v11 = vtx(1, 1);
    return (
      v00 * (1 - du) * (1 - dv) +
      v10 * du * (1 - dv) +
      v01 * (1 - du) * dv +
      v11 * du * dv
    );
  }

  /**
   * Can the player step from cell A to adjacent cell B? B must be unblocked
   * and the walking surfaces must meet at the shared edge (within half a
   * step) — flat<->flat same plane, any wedge that bridges a level, and
   * never a bare cliff.
   */
  canStep(ax: number, ay: number, d: Dir): boolean {
    const bx = ax + DX[d], by = ay + DY[d];
    if (this.flagsAt(bx, by) & F_BLOCKED) return false;
    const mx = ax + DX[d] * 0.5, my = ay + DY[d] * 0.5;
    const za = this.zInCell(ax, ay, mx, my);
    const zb = this.zInCell(bx, by, mx, my);
    // surfaces must genuinely meet at the crossing point — anything bigger
    // than a kerb reads as a pop or a cliff
    return Math.abs(za - zb) < 0.26;
  }

  /** visual z for a character at fractional position */
  surfaceZ(fx: number, fy: number): number {
    return this.zInCell(Math.round(fx), Math.round(fy), fx, fy);
  }

  isWater(x: number, y: number): boolean {
    return (this.flagsAt(x, y) & F_WATER) !== 0 && !(this.flagsAt(x, y) & F_BRIDGE);
  }

  /** find a pleasant land spawn near the origin */
  findSpawn(): { x: number; y: number } {
    for (let r = 0; r < 40; r++) {
      for (let a = 0; a < 16; a++) {
        const x = Math.round(Math.cos((a / 16) * Math.PI * 2) * r * 8);
        const y = Math.round(Math.sin((a / 16) * Math.PI * 2) * r * 8);
        const f = this.flagsAt(x, y);
        if (!(f & F_BLOCKED) && !(f & F_WATER)) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }
}
