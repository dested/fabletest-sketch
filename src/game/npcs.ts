// Wandering NPCs: every settlement spawns villagers that stroll its streets.
// Spawning is deterministic per settlement; movement is simulated only while
// the player is nearby.

import { World } from '../engine/world';
import { hash32, rng } from '../engine/noise';
import { Dir, DX, DY } from '../engine/tileset';

export interface Npc {
  id: string;
  home: { x: number; y: number };
  leash: number;
  x: number;
  y: number;
  fx: number;
  fy: number;
  z: number;
  facing: Dir;
  step: number;
  cloak: string;
  trim: string;
  speed: number;
  pause: number;
  target: { x: number; y: number } | null;
  rand: () => number;
}

const CLOAKS = ['#c94e4e', '#4e8ac9', '#4ec96b', '#c9a44e', '#9b59b6', '#5d6d7e', '#e67e22', '#16a085'];
const ACTIVE_R = 110;   // simulate NPCs within this range of the player
const SPAWN_SCAN = 96;  // look for settlements within this range

export class NpcManager {
  npcs = new Map<string, Npc>();

  /** ensure NPCs exist for settlements near the player; drop faraway ones */
  sync(world: World, px: number, py: number) {
    const stamps = world.features.stampsTouching(px - SPAWN_SCAN, py - SPAWN_SCAN, px + SPAWN_SCAN, py + SPAWN_SCAN);
    for (const st of stamps) {
      if (!st.npcs) continue;
      const baseId = `${st.anchor.x},${st.anchor.y}`;
      if (this.npcs.has(`${baseId}#0`)) continue;
      const seed = hash32(st.anchor.x, st.anchor.y, world.params.seed, 555);
      const r = rng(seed);
      let spawned = 0;
      // walk outward from the anchor looking for walkable cells
      for (let ring = 0; ring < 20 && spawned < st.npcs; ring++) {
        for (let i = 0; i < 8 && spawned < st.npcs; i++) {
          const dx = Math.floor(r() * (ring * 2 + 1)) - ring;
          const dy = Math.floor(r() * (ring * 2 + 1)) - ring;
          const x = st.anchor.x + dx, y = st.anchor.y + dy;
          if (world.flagsAt(x, y) & 1 || world.isWater(x, y)) continue;
          const id = `${baseId}#${spawned}`;
          this.npcs.set(id, {
            id,
            home: { x: st.anchor.x, y: st.anchor.y },
            leash: st.kind === 'village' ? 22 : 14,
            x, y, fx: x, fy: y,
            z: world.planeAt(x, y),
            facing: (Math.floor(r() * 4) & 3) as Dir,
            step: 0,
            cloak: CLOAKS[Math.floor(r() * CLOAKS.length)],
            trim: r() < 0.5 ? '#ffd9a8' : '#e8c188',
            speed: 1.6 + r() * 1.2,
            pause: r() * 3,
            target: null,
            rand: rng(seed ^ (spawned * 7919)),
          });
          spawned++;
        }
      }
    }
    // cull NPCs far from the player
    for (const [id, n] of this.npcs) {
      if (Math.abs(n.fx - px) > ACTIVE_R * 1.6 || Math.abs(n.fy - py) > ACTIVE_R * 1.6) {
        this.npcs.delete(id);
      }
    }
  }

  update(world: World, dt: number, px: number, py: number) {
    for (const n of this.npcs.values()) {
      if (Math.abs(n.fx - px) > ACTIVE_R || Math.abs(n.fy - py) > ACTIVE_R) continue;
      if (n.pause > 0) {
        n.pause -= dt;
        n.step = 0;
        continue;
      }
      if (!n.target) {
        if (n.rand() < 0.35) {
          // bias back toward home when at the leash edge
          const candidates: Dir[] = [];
          for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
            const nx = n.x + DX[d], ny = n.y + DY[d];
            if (Math.abs(nx - n.home.x) > n.leash || Math.abs(ny - n.home.y) > n.leash) continue;
            if (world.canStep(n.x, n.y, d)) candidates.push(d);
          }
          if (candidates.length) {
            const d = candidates[Math.floor(n.rand() * candidates.length)];
            n.facing = d;
            n.target = { x: n.x + DX[d], y: n.y + DY[d] };
          }
        } else {
          n.pause = 0.6 + n.rand() * 2.6;
        }
        continue;
      }
      const ddx = n.target.x - n.fx, ddy = n.target.y - n.fy;
      const dist = Math.hypot(ddx, ddy);
      const step = n.speed * dt;
      if (dist <= step) {
        n.fx = n.target.x; n.fy = n.target.y;
        n.x = n.target.x; n.y = n.target.y;
        n.target = null;
        n.pause = n.rand() < 0.5 ? 0.4 + n.rand() * 2 : 0;
        n.step = 0;
      } else {
        n.fx += (ddx / dist) * step;
        n.fy += (ddy / dist) * step;
        n.step = (n.step + step * 0.9) % 1;
      }
      n.z = world.surfaceZ(n.fx, n.fy);
    }
  }
}
