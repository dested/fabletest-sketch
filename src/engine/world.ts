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
   * Can the player step from cell A to adjacent cell B?
   * Rules: B not blocked; same walk plane, or 1-level difference when the
   * lower cell is a ramp descending along the step axis.
   */
  canStep(ax: number, ay: number, d: Dir): boolean {
    const bx = ax + DX[d], by = ay + DY[d];
    const fb = this.flagsAt(bx, by);
    if (fb & F_BLOCKED) return false;
    const pa = this.effectivePlane(ax, ay);
    const pb = this.effectivePlane(bx, by);
    const fa = this.flagsAt(ax, ay);
    if (pa === pb) return true;
    if (Math.abs(pa - pb) !== 1) return false;
    // need a ramp on the LOWER cell, aligned with the movement axis
    const low = pa < pb ? { x: ax, y: ay, f: fa } : { x: bx, y: by, f: fb };
    if (!(low.f & F_RAMP)) return false;
    const rd = this.rampDirAt(low.x, low.y);
    return rd === d || rd === ((d + 2) & 3);
  }

  /** plane the player stands on at the cell's CENTER (ramps count as +0.5) */
  private effectivePlane(x: number, y: number): number {
    return this.planeAt(x, y);
  }

  /**
   * Visual z for the player at fractional position (fx, fy):
   * flat cells -> plane; ramp cells -> interpolate along descent axis.
   */
  surfaceZ(fx: number, fy: number): number {
    const x = Math.round(fx), y = Math.round(fy);
    const p = this.planeAt(x, y);
    const f = this.flagsAt(x, y);
    if (!(f & F_RAMP)) return p;
    const rd = this.rampDirAt(x, y);
    // ramp surface: plane p at the low edge .. p+1 at the high edge.
    // fraction along descent dir within the cell: t=+0.5 at low edge.
    const t = rd === 0 ? fy - y : rd === 1 ? fx - x : rd === 2 ? y - fy : x - fx;
    return p + (0.5 - Math.max(-0.5, Math.min(0.5, t)));
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
