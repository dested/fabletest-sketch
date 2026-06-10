// Canvas renderer: visible-chunk gathering, painter-order drawing with
// depth-inserted character sprites, on-demand tile image loading.

import { World } from '../engine/world';
import { CHUNK } from '../engine/chunkgen';
import {
  Placed, HALF_W, HALF_H, LEVEL, ANCHOR_X, ANCHOR_Y, IMG_W, IMG_H, sortKey,
} from '../engine/tileset';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Sprite {
  fx: number;
  fy: number;
  z: number;       // walk plane (continuous on ramps)
  step: number;    // walk-cycle phase 0..1
  cloak: string;
  trim: string;
  hood: string;
  scale: number;   // 1 = player size
}

export class TileStore {
  private images = new Map<string, HTMLImageElement>();
  private missing = new Set<string>();
  onload?: () => void;

  get(pack: string, name: string, dir: number): HTMLImageElement | null {
    const k = `${pack}/${name}_${'NESW'[dir]}`;
    if (this.missing.has(k)) return null;
    let img = this.images.get(k);
    if (!img) {
      img = new Image();
      img.src = `${import.meta.env.BASE_URL}tiles/${k}.png`;
      img.onload = () => this.onload?.();
      img.onerror = () => this.missing.add(k);
      this.images.set(k, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }
}

/** depth key for sprites: in front of every column they overlap mid-step */
function spriteKey(s: Sprite): number {
  return Math.ceil(s.fx + s.fy - 1e-6) * 64 + Math.ceil(s.z) + 0.49;
}

const BLOB_SHADOW = /^(tree|rocks|well|structure|dome|overhang)/;

export class Renderer {
  tiles = new TileStore();
  private cacheKey = '';
  private cacheWorld: World | null = null;
  private cacheList: Placed[] = [];

  draw(
    ctx: CanvasRenderingContext2D,
    world: World,
    cam: Camera,
    sprites: Sprite[],
    w: number,
    h: number,
  ) {
    ctx.fillStyle = '#cfe8f2';
    ctx.fillRect(0, 0, w, h);

    const z = cam.zoom;
    const camSX = (cam.x - cam.y) * HALF_W;
    const camSY = (cam.x + cam.y) * HALF_H;
    const toScreenX = (sx: number) => (sx - camSX) * z + w / 2;
    const toScreenY = (sy: number) => (sy - camSY) * z + h / 2;

    const margin = 3;
    const minU = (0 - w / 2) / z + camSX, maxU = (w - w / 2) / z + camSX;
    const minV = (0 - h / 2) / z + camSY - 12 * LEVEL, maxV = (h - h / 2) / z + camSY + IMG_H;
    const xy0 = minV / HALF_H, xy1 = maxV / HALF_H;
    const xmy0 = minU / HALF_W, xmy1 = maxU / HALF_W;

    const cells = {
      x0: Math.floor((xy0 + xmy0) / 2) - margin,
      y0: Math.floor((xy0 - xmy1) / 2) - margin,
      x1: Math.ceil((xy1 + xmy1) / 2) + margin,
      y1: Math.ceil((xy1 - xmy0) / 2) + margin,
    };
    const c0x = Math.floor(cells.x0 / CHUNK), c1x = Math.floor(cells.x1 / CHUNK);
    const c0y = Math.floor(cells.y0 / CHUNK), c1y = Math.floor(cells.y1 / CHUNK);

    // cull + sort is cached: re-done only when the view moves a coarse step
    const qx = Math.round(camSX / (8 * HALF_W)), qy = Math.round(camSY / (8 * HALF_H));
    const ck = `${c0x},${c0y},${c1x},${c1y}|${qx},${qy}|${z.toFixed(2)}`;
    let drawList = this.cacheList;
    if (ck !== this.cacheKey || world !== this.cacheWorld) {
      const pad = 10 * HALF_W; // margin so the cache survives small pans
      drawList = [];
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          const ch = world.chunkAt(cx, cy);
          for (const t of ch.placed) {
            const u = (t.x - t.y) * HALF_W;
            if (u < minU - IMG_W - pad || u > maxU + IMG_W + pad) continue;
            const v = (t.x + t.y) * HALF_H - t.z * LEVEL;
            if (v < minV - IMG_H - pad || v > maxV + IMG_H + pad) continue;
            drawList.push(t);
          }
        }
      }
      drawList.sort((a, b) => sortKey(a.x, a.y, a.z) - sortKey(b.x, b.y, b.z) || a.x - b.x);
      this.cacheKey = ck;
      this.cacheWorld = world;
      this.cacheList = drawList;
    }

    const sorted = [...sprites].sort((a, b) => spriteKey(a) - spriteKey(b));
    let si = 0;

    const dw = IMG_W * z, dh = IMG_H * z;
    const blobShadows = z >= 0.14;
    for (const t of drawList) {
      const tk = sortKey(t.x, t.y, t.z);
      while (si < sorted.length && spriteKey(sorted[si]) <= tk) {
        this.drawCharacter(ctx, sorted[si], toScreenX, toScreenY, z);
        si++;
      }
      if (t.name === '__shade') {
        this.drawShade(ctx, t, toScreenX, toScreenY, z);
        continue;
      }
      const img = this.tiles.get(t.pack, t.name, t.dir);
      if (!img) continue;
      const sx = toScreenX((t.x - t.y) * HALF_W + ANCHOR_X);
      const sy = toScreenY((t.x + t.y) * HALF_H - t.z * LEVEL + ANCHOR_Y);
      if (sx > w || sy > h || sx + dw < 0 || sy + dh < 0) continue;
      if (blobShadows && BLOB_SHADOW.test(t.name)) {
        // soft blob under free-standing objects, nudged away from the sun
        const bx = toScreenX((t.x - t.y) * HALF_W) + 8 * z;
        const by = toScreenY((t.x + t.y) * HALF_H - t.z * LEVEL + HALF_H) + 4 * z;
        ctx.fillStyle = 'rgba(60,42,20,0.26)';
        ctx.beginPath();
        ctx.ellipse(bx, by, 88 * z, 40 * z, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.drawImage(img, sx, sy, dw, dh);
    }
    while (si < sorted.length) {
      this.drawCharacter(ctx, sorted[si], toScreenX, toScreenY, z);
      si++;
    }
    // x-ray marker so the player reads through cliffs and walls
    const pl = sprites[0];
    if (pl) {
      const mx = toScreenX((pl.fx - pl.fy) * HALF_W);
      const my = toScreenY((pl.fx + pl.fy) * HALF_H - pl.z * LEVEL + HALF_H);
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, 2.5 * z);
      ctx.beginPath();
      ctx.ellipse(mx, my, 120 * z * pl.scale * 0.34, 120 * z * pl.scale * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawShade(
    ctx: CanvasRenderingContext2D,
    t: Placed,
    tsx: (x: number) => number,
    tsy: (y: number) => number,
    zoom: number,
  ) {
    // translucent diamond over the top face of the cube at z=t.z (plane t.z+1)
    const cx = (t.x - t.y) * HALF_W;
    const cy = (t.x + t.y) * HALF_H - (t.z + 1) * LEVEL;
    ctx.fillStyle = `rgba(46,38,80,${t.alpha ?? 0.18})`;
    ctx.beginPath();
    ctx.moveTo(tsx(cx), tsy(cy));
    ctx.lineTo(tsx(cx + HALF_W), tsy(cy + HALF_H));
    ctx.lineTo(tsx(cx), tsy(cy + HALF_H * 2));
    ctx.lineTo(tsx(cx - HALF_W), tsy(cy + HALF_H));
    ctx.closePath();
    ctx.fill();
  }

  /** stylized wanderer: shadow, cloak, head, hood, walking bob */
  private drawCharacter(
    ctx: CanvasRenderingContext2D,
    p: Sprite,
    tsx: (x: number) => number,
    tsy: (y: number) => number,
    zoom: number,
  ) {
    // feet at the CENTER of the standing surface (plane z): top vertex + HALF_H
    const sx = tsx((p.fx - p.fy) * HALF_W);
    const sy = tsy((p.fx + p.fy) * HALF_H - p.z * LEVEL + HALF_H);
    const s = zoom * 110 * p.scale;
    const bob = Math.sin(p.step * Math.PI * 2) * 0.06 * s;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = 'rgba(60,40,20,0.30)';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.34, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    const bodyH = s * 0.62, bodyW = s * 0.36;
    const grd = ctx.createLinearGradient(0, -bodyH - bob, 0, -bob);
    grd.addColorStop(0, p.cloak);
    grd.addColorStop(1, shade(p.cloak, -28));
    ctx.fillStyle = grd;
    ctx.strokeStyle = shade(p.cloak, -70);
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(-bodyW / 2, -bob);
    ctx.quadraticCurveTo(-bodyW * 0.62, -bodyH * 0.62 - bob, 0, -bodyH - bob);
    ctx.quadraticCurveTo(bodyW * 0.62, -bodyH * 0.62 - bob, bodyW / 2, -bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.trim;
    ctx.beginPath();
    ctx.arc(0, -bodyH - s * 0.13 - bob, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.hood;
    ctx.beginPath();
    ctx.arc(0, -bodyH - s * 0.2 - bob, s * 0.12, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}
