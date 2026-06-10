// Deterministic terrain sampling: elevation, biome, moisture — pure functions
// of (x, y, params). Everything downstream (chunks, features, minimap) reads
// the world through this single lens.

import { Fbm, rand01 } from './noise';
import { WorldParams } from './params';

export type Biome = 'grass' | 'desert';

export interface TerrainSample {
  /** integer surface height; 0 = ocean floor level (water), >=1 land */
  height: number;
  water: boolean;
  biome: Biome;
  /** 0..1 continuous elevation before quantizing (for minimap shading) */
  elev: number;
  moisture: number;
}

export class Terrain {
  private elevFbm: Fbm;
  private ridgeFbm: Fbm;
  private warpX: Fbm;
  private warpY: Fbm;
  private climateFbm: Fbm;
  private roughFbm: Fbm;
  readonly p: WorldParams;

  constructor(p: WorldParams) {
    this.p = p;
    this.elevFbm = new Fbm(p.seed ^ 0x11, 5, 0.5, 2.02);
    this.ridgeFbm = new Fbm(p.seed ^ 0x22, 4, 0.52, 2.1);
    this.warpX = new Fbm(p.seed ^ 0x33, 3, 0.5, 2.0);
    this.warpY = new Fbm(p.seed ^ 0x44, 3, 0.5, 2.0);
    this.climateFbm = new Fbm(p.seed ^ 0x55, 3, 0.5, 2.0);
    this.roughFbm = new Fbm(p.seed ^ 0x66, 3, 0.55, 2.3);
  }

  /** continuous elevation 0..1 (sea level cuts at p.seaLevel) */
  elevation(x: number, y: number): number {
    const p = this.p;
    const s = 1 / p.terrainScale;
    let wx = x, wy = y;
    if (p.warp > 0) {
      const ws = s * 0.6;
      wx += this.warpX.at(x * ws, y * ws) * p.warp * p.terrainScale * 0.55;
      wy += this.warpY.at(x * ws + 31.7, y * ws - 17.3) * p.warp * p.terrainScale * 0.55;
    }
    let e = this.elevFbm.at01(wx * s, wy * s);
    if (p.mountains > 0) {
      const r = this.ridgeFbm.ridged(wx * s * 1.7, wy * s * 1.7); // 0..1 sharp ridges
      e = e * (1 - p.mountains * 0.65) + r * e * p.mountains * 1.05;
    }
    if (p.roughness > 0) {
      e += this.roughFbm.at(x * s * 6, y * s * 6) * 0.06 * p.roughness;
    }
    return Math.min(1, Math.max(0, e));
  }

  moisture(x: number, y: number): number {
    const cs = 1 / this.p.climateScale;
    return this.climateFbm.at01(x * cs + 1000, y * cs - 1000);
  }

  sample(x: number, y: number): TerrainSample {
    const p = this.p;
    const e = this.elevation(x, y);
    const sea = p.seaLevel;
    const m = this.moisture(x, y);
    const biome: Biome = m < p.desert ? 'desert' : 'grass';
    if (e <= sea) {
      return { height: 0, water: true, biome, elev: e, moisture: m };
    }
    // land: quantize remaining range into heightLevels terraces (1..heightLevels)
    const t = (e - sea) / (1 - sea); // 0..1 over land
    const shaped = Math.pow(t, 1.35); // wide lowlands, steep peaks
    const h = 1 + Math.floor(shaped * p.heightLevels);
    return { height: Math.min(p.heightLevels, h), water: false, biome, elev: e, moisture: m };
  }

  /** integer surface height with water=0 */
  heightAt(x: number, y: number): number {
    return this.sample(x, y).height;
  }

  /** deterministic per-cell random in [0,1) for decor scattering */
  cellRand(x: number, y: number, salt: number): number {
    return rand01(x, y, this.p.seed, salt);
  }
}
