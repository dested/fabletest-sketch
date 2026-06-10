// Canvas renderer: visible-chunk gathering, painter-order drawing with the
// player depth-inserted, on-demand tile image loading.

import { World } from '../engine/world';
import { CHUNK } from '../engine/chunkgen';
import {
  Placed, tileKey, HALF_W, HALF_H, LEVEL, ANCHOR_X, ANCHOR_Y, IMG_W, IMG_H, sortKey,
} from '../engine/tileset';

export interface Camera {
  /** world cell coords the screen centers on */
  x: number;
  y: number;
  zoom: number; // screen px per art px
}

export interface PlayerView {
  fx: number;
  fy: number;
  z: number;       // walk plane (continuous on ramps)
  facing: number;  // dir 0..3
  step: number;    // walk-cycle phase 0..1
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

export class Renderer {
  tiles = new TileStore();

  draw(
    ctx: CanvasRenderingContext2D,
    world: World,
    cam: Camera,
    player: PlayerView,
    w: number,
    h: number,
  ) {
    ctx.fillStyle = '#cfe8f2'; // distant sea haze
    ctx.fillRect(0, 0, w, h);

    const z = cam.zoom;
    const camSX = (cam.x - cam.y) * HALF_W;
    const camSY = (cam.x + cam.y) * HALF_H;
    // screen px -> world art px offset
    const toScreenX = (sx: number) => (sx - camSX) * z + w / 2;
    const toScreenY = (sy: number) => (sy - camSY) * z + h / 2;

    // visible cell bounds (generous: account for tall stacks & big tiles)
    const margin = 3;
    const minU = (0 - w / 2) / z + camSX, maxU = (w - w / 2) / z + camSX; // u = (x-y)*116
    const minV = (0 - h / 2) / z + camSY - 12 * LEVEL, maxV = (h - h / 2) / z + camSY + IMG_H; // v = (x+y)*55
    const xy0 = minV / HALF_H, xy1 = maxV / HALF_H;
    const xmy0 = minU / HALF_W, xmy1 = maxU / HALF_W;

    // chunks intersecting the diamond window
    const cells: { x0: number; y0: number; x1: number; y1: number } = {
      x0: Math.floor((xy0 + xmy0) / 2) - margin,
      y0: Math.floor((xy0 - xmy1) / 2) - margin,
      x1: Math.ceil((xy1 + xmy1) / 2) + margin,
      y1: Math.ceil((xy1 - xmy0) / 2) + margin,
    };
    const c0x = Math.floor(cells.x0 / CHUNK), c1x = Math.floor(cells.x1 / CHUNK);
    const c0y = Math.floor(cells.y0 / CHUNK), c1y = Math.floor(cells.y1 / CHUNK);

    const drawList: Placed[] = [];
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const ch = world.chunkAt(cx, cy);
        for (const t of ch.placed) {
          const u = (t.x - t.y) * HALF_W;
          if (u < minU - IMG_W || u > maxU + IMG_W) continue;
          const v = (t.x + t.y) * HALF_H - t.z * LEVEL;
          if (v < minV - IMG_H || v > maxV + IMG_H) continue;
          drawList.push(t);
        }
      }
    }
    drawList.sort((a, b) => sortKey(a.x, a.y, a.z) - sortKey(b.x, b.y, b.z) || a.x - b.x);

    // player sort position: just after the tile stack of its own cell
    const pCellX = Math.round(player.fx), pCellY = Math.round(player.fy);
    const pKey = sortKey(pCellX, pCellY, Math.ceil(player.z) + 0.49);

    const dw = IMG_W * z, dh = IMG_H * z;
    let playerDrawn = false;
    for (const t of drawList) {
      const tk = sortKey(t.x, t.y, t.z);
      if (!playerDrawn && (tk > pKey || (tk === pKey && t.x > pCellX))) {
        this.drawPlayer(ctx, player, toScreenX, toScreenY, z);
        playerDrawn = true;
      }
      const img = this.tiles.get(t.pack, t.name, t.dir);
      if (!img) continue;
      const sx = toScreenX((t.x - t.y) * HALF_W + ANCHOR_X);
      const sy = toScreenY((t.x + t.y) * HALF_H - t.z * LEVEL + ANCHOR_Y);
      ctx.drawImage(img, sx, sy, dw, dh);
    }
    if (!playerDrawn) this.drawPlayer(ctx, player, toScreenX, toScreenY, z);
  }

  /** stylized wanderer: shadow, cloak, head, walking bob */
  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    p: PlayerView,
    tsx: (x: number) => number,
    tsy: (y: number) => number,
    zoom: number,
  ) {
    const sx = tsx((p.fx - p.fy) * HALF_W);
    // stand on the walk plane: plane k means top of cube at z=k
    const sy = tsy((p.fx + p.fy) * HALF_H - p.z * LEVEL + LEVEL * 0.97);
    const s = zoom * 110; // base size unit
    const bob = Math.sin(p.step * Math.PI * 2) * 0.06 * s;

    ctx.save();
    ctx.translate(sx, sy);
    // shadow
    ctx.fillStyle = 'rgba(60,40,20,0.30)';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.34, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    // body (cloak)
    const bodyH = s * 0.62, bodyW = s * 0.36;
    const grd = ctx.createLinearGradient(0, -bodyH - bob, 0, -bob);
    grd.addColorStop(0, '#7a4ec9');
    grd.addColorStop(1, '#5b3399');
    ctx.fillStyle = grd;
    ctx.strokeStyle = '#3c2266';
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(-bodyW / 2, -bob);
    ctx.quadraticCurveTo(-bodyW * 0.62, -bodyH * 0.62 - bob, 0, -bodyH - bob);
    ctx.quadraticCurveTo(bodyW * 0.62, -bodyH * 0.62 - bob, bodyW / 2, -bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // head
    ctx.fillStyle = '#ffd9a8';
    ctx.beginPath();
    ctx.arc(0, -bodyH - s * 0.13 - bob, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // hood tip
    ctx.fillStyle = '#7a4ec9';
    ctx.beginPath();
    ctx.arc(0, -bodyH - s * 0.2 - bob, s * 0.12, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
