import { World } from '/Users/sal/code/fabletest-sketch/src/engine/world';
import { DEFAULT_PARAMS } from '/Users/sal/code/fabletest-sketch/src/engine/params';
import { DX, DY } from '/Users/sal/code/fabletest-sketch/src/engine/tileset';

const w = new World(DEFAULT_PARAMS);
let checked = 0, maxJump = 0, cornerSteps = 0, blockedCliffs = 0;
for (let y = -120; y < 120; y += 1) {
  for (let x = -120; x < 120; x += 1) {
    if (w.flagsAt(x, y) & 1) continue;
    for (let d = 0 as 0|1|2|3; d < 4; d = (d+1) as any) {
      const nx = x + DX[d], ny = y + DY[d];
      if (w.canStep(x, y, d)) {
        // sample surface along the step; measure largest discontinuity
        let prev = w.surfaceZ(x, y);
        for (let t = 0.05; t <= 1.001; t += 0.05) {
          const z = w.surfaceZ(x + DX[d]*t, y + DY[d]*t);
          maxJump = Math.max(maxJump, Math.abs(z - prev));
          prev = z;
        }
        checked++;
        if (Math.abs(w.planeAt(nx, ny) - w.planeAt(x, y)) === 1) cornerSteps++;
      } else if (!(w.flagsAt(nx, ny) & 1) && Math.abs(w.planeAt(nx, ny) - w.planeAt(x, y)) >= 2) {
        blockedCliffs++;
      }
    }
  }
}
console.log(`steps checked: ${checked}, level-transitions allowed: ${cornerSteps}`);
console.log(`max surface discontinuity along any allowed step: ${maxJump.toFixed(3)} (should be < 0.1)`);
console.log(`2+ level cliffs correctly blocked: ${blockedCliffs > 0}`);
