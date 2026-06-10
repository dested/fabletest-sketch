import { World } from '/Users/sal/code/fabletest-sketch/src/engine/world';
import { DEFAULT_PARAMS } from '/Users/sal/code/fabletest-sketch/src/engine/params';
const w = new World(DEFAULT_PARAMS);
for (let ry = -4; ry <= 4; ry++) for (let rx = -4; rx <= 4; rx++) {
  const st = w.features.regionStamp(rx, ry);
  if (st && (st.kind === 'village' || st.kind === 'castle')) {
    console.log(`${st.kind} @ ${st.anchor.x},${st.anchor.y} cells=${st.cells.size}`);
  }
}
