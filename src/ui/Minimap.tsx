import { useEffect, useRef } from 'react';
import { World } from '../engine/world';

const SIZE = 168;          // canvas px
const SPAN = 320;          // world cells covered
const STEP = SPAN / SIZE;  // cells per pixel

interface Props {
  world: World;
  px: number;
  py: number;
  onTeleport: (x: number, y: number) => void;
  version: number;
}

export function Minimap({ world, px, py, onTeleport, version }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(SIZE, SIZE);
    const t = world.terrain;
    const cx = Math.round(px), cy = Math.round(py);
    let i = 0;
    for (let yy = 0; yy < SIZE; yy++) {
      for (let xx = 0; xx < SIZE; xx++) {
        const wx = cx + Math.round((xx - SIZE / 2) * STEP);
        const wy = cy + Math.round((yy - SIZE / 2) * STEP);
        const s = t.sample(wx, wy);
        let r: number, g: number, b: number;
        if (s.water) {
          r = 122; g = 196; b = 226;
        } else {
          const shade = 0.72 + 0.3 * (s.height / Math.max(1, t.p.heightLevels));
          if (s.biome === 'desert') { r = 236 * shade; g = 196 * shade; b = 142 * shade; }
          else { r = 132 * shade; g = 190 * shade; b = 86 * shade; }
        }
        img.data[i++] = r; img.data[i++] = g; img.data[i++] = b; img.data[i++] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // player dot
    ctx.fillStyle = '#5b3399';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, [world, px, py, version]);

  return (
    <canvas
      ref={ref}
      width={SIZE}
      height={SIZE}
      className="minimap"
      title="Click to travel"
      onClick={(e) => {
        const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const mx = ((e.clientX - r.left) / r.width) * SIZE;
        const my = ((e.clientY - r.top) / r.height) * SIZE;
        const wx = Math.round(px) + Math.round((mx - SIZE / 2) * STEP);
        const wy = Math.round(py) + Math.round((my - SIZE / 2) * STEP);
        onTeleport(wx, wy);
      }}
    />
  );
}
