// Seeded 2D noise toolkit: hashing, PRNG streams, simplex, fbm, ridged, domain warp.

export function hash32(x: number, y: number, seed: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647 + salt * 144665) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

export function rand01(x: number, y: number, seed: number, salt = 0): number {
  return hash32(x, y, seed, salt) / 4294967296;
}

/** Deterministic stream RNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- simplex noise ----
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1];

export class Simplex {
  private perm: Uint8Array;
  constructor(seed: number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    const r = rng(seed ^ 0x9e3779b9);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  /** returns noise in [-1, 1] */
  at(xin: number, yin: number): number {
    const perm = this.perm;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      const g = (perm[ii + perm[jj]] & 7) * 2;
      n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      const g = (perm[ii + i1 + perm[jj + j1]] & 7) * 2;
      n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      const g = (perm[ii + 1 + perm[jj + 1]] & 7) * 2;
      n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2);
    }
    return 70 * n;
  }
}

export class Fbm {
  private n: Simplex;
  constructor(seed: number, public octaves = 4, public gain = 0.5, public lacunarity = 2) {
    this.n = new Simplex(seed);
  }
  /** [-1, 1] */
  at(x: number, y: number): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < this.octaves; o++) {
      sum += amp * this.n.at(x * freq, y * freq);
      norm += amp;
      amp *= this.gain;
      freq *= this.lacunarity;
    }
    return sum / norm;
  }
  /** [0, 1] */
  at01(x: number, y: number): number {
    return this.at(x, y) * 0.5 + 0.5;
  }
  /** ridged [0,1]: sharp crests near 1 */
  ridged(x: number, y: number): number {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < this.octaves; o++) {
      sum += amp * (1 - Math.abs(this.n.at(x * freq, y * freq)));
      norm += amp;
      amp *= this.gain;
      freq *= this.lacunarity;
    }
    return sum / norm;
  }
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
