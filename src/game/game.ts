// Game loop: player movement (grid-stepped, smooth), camera follow, input.

import { World } from '../engine/world';
import { Renderer, Camera, PlayerView } from '../render/renderer';
import { Dir, DX, DY } from '../engine/tileset';
import { WorldParams } from '../engine/params';

const WALK_SPEED = 5.2; // cells per second

export interface HudState {
  x: number;
  y: number;
  height: number;
  biome: string;
  fps: number;
}

export class Game {
  world: World;
  cam: Camera;
  renderer = new Renderer();
  player = { x: 0, y: 0, fx: 0, fy: 0, z: 1, facing: 0 as Dir, step: 0 };
  private moveTarget: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  private raf = 0;
  private last = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  fps = 60;
  onHud?: (h: HudState) => void;

  constructor(params: WorldParams, private canvas: HTMLCanvasElement) {
    this.world = new World(params);
    const spawn = this.world.findSpawn();
    this.player.x = spawn.x; this.player.y = spawn.y;
    this.player.fx = spawn.x; this.player.fy = spawn.y;
    this.player.z = this.world.planeAt(spawn.x, spawn.y);
    this.cam = { x: spawn.x, y: spawn.y, zoom: 0.45 };
    this.renderer.tiles.onload = () => { /* progressive paint via raf */ };
  }

  /** swap world for new params, keeping player position if possible */
  setParams(params: WorldParams) {
    this.world = new World(params);
    const { x, y } = this.player;
    const f = this.world.flagsAt(x, y);
    if (f & 1 /* blocked */ || this.world.isWater(x, y)) {
      const s = this.world.findSpawn();
      this.player.x = s.x; this.player.y = s.y;
      this.player.fx = s.x; this.player.fy = s.y;
    }
    this.player.z = this.world.planeAt(this.player.x, this.player.y);
    this.moveTarget = null;
  }

  teleport(x: number, y: number) {
    // nudge to nearest walkable
    for (let r = 0; r < 24; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = x + dx, ty = y + dy;
        const f = this.world.flagsAt(tx, ty);
        if (!(f & 1) && !this.world.isWater(tx, ty)) {
          this.player.x = tx; this.player.y = ty;
          this.player.fx = tx; this.player.fy = ty;
          this.player.z = this.world.planeAt(tx, ty);
          this.moveTarget = null;
          this.cam.x = tx; this.cam.y = ty;
          return;
        }
      }
    }
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.render();
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc >= 0.5) {
        this.fps = Math.round(this.fpsN / this.fpsAcc);
        this.fpsAcc = 0; this.fpsN = 0;
        this.onHud?.({
          x: this.player.x,
          y: this.player.y,
          height: this.world.planeAt(this.player.x, this.player.y) - 1,
          biome: this.world.biomeAt(this.player.x, this.player.y),
          fps: this.fps,
        });
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  stop() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  private onKey = (e: KeyboardEvent) => {
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
    this.keys.add(e.key.toLowerCase());
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0012);
    this.cam.zoom = Math.min(1.2, Math.max(0.16, this.cam.zoom * f));
  };

  private wishDir(): Dir | -1 {
    // screen-relative: W = up (-x,-y picks the axis pressed harder)… cardinal mapping:
    // w -> -y (S), s -> +y (N), a -> -x (W), d -> +x (E)
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) return 2;
    if (k.has('s') || k.has('arrowdown')) return 0;
    if (k.has('a') || k.has('arrowleft')) return 3;
    if (k.has('d') || k.has('arrowright')) return 1;
    return -1;
  }

  private update(dt: number) {
    const p = this.player;
    if (!this.moveTarget) {
      const d = this.wishDir();
      if (d !== -1) {
        p.facing = d;
        if (this.world.canStep(p.x, p.y, d)) {
          this.moveTarget = { x: p.x + DX[d], y: p.y + DY[d] };
        }
      }
    }
    if (this.moveTarget) {
      const tx = this.moveTarget.x, ty = this.moveTarget.y;
      const ddx = tx - p.fx, ddy = ty - p.fy;
      const dist = Math.hypot(ddx, ddy);
      const step = WALK_SPEED * dt;
      if (dist <= step) {
        p.fx = tx; p.fy = ty;
        p.x = tx; p.y = ty;
        this.moveTarget = null;
        // chain steps for held keys without a stutter frame
        const d = this.wishDir();
        if (d !== -1 && this.world.canStep(p.x, p.y, d)) {
          p.facing = d;
          this.moveTarget = { x: p.x + DX[d], y: p.y + DY[d] };
        }
        p.step = this.moveTarget ? (p.step + step * 0.8) % 1 : 0;
      } else {
        p.fx += (ddx / dist) * step;
        p.fy += (ddy / dist) * step;
        p.step = (p.step + step * 0.8) % 1;
      }
    }
    p.z = this.world.surfaceZ(p.fx, p.fy);

    // camera spring-follow
    const k = 1 - Math.exp(-dt * 5);
    this.cam.x += (p.fx - this.cam.x) * k;
    this.cam.y += (p.fy - this.cam.y) * k;
  }

  private render() {
    const ctx = this.canvas.getContext('2d')!;
    const w = this.canvas.width, h = this.canvas.height;
    const pv: PlayerView = {
      fx: this.player.fx,
      fy: this.player.fy,
      z: this.player.z,
      facing: this.player.facing,
      step: this.player.step,
    };
    this.renderer.draw(ctx, this.world, this.cam, pv, w, h);
  }
}
