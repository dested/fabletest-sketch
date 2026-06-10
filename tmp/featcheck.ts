import { World } from '/Users/sal/code/fabletest-sketch/src/engine/world';
import { DEFAULT_PARAMS } from '/Users/sal/code/fabletest-sketch/src/engine/params';

const w = new World(DEFAULT_PARAMS);
const f = w.features;
let v = 0, c = 0, r = 0, riv = 0;
const found: string[] = [];
for (let ry = -8; ry <= 8; ry++) for (let rx = -8; rx <= 8; rx++) {
  const st = f.regionStamp(rx, ry);
  if (st) {
    if (st.kind === 'village') v++;
    if (st.kind === 'castle') c++;
    if (st.kind === 'relic') r++;
    if (found.length < 12) found.push(`${st.kind}@${st.anchor.x},${st.anchor.y}`);
  }
}
for (let ry = -4; ry <= 4; ry++) for (let rx = -4; rx <= 4; rx++) {
  if (f.riverFor(rx, ry)) riv++;
}
console.log(`villages ${v}, castles ${c}, relics ${r} in 17x17 regions (816x816 cells)`);
console.log(`rivers: ${riv} of 81 spring regions`);
console.log(found.join('\n'));
