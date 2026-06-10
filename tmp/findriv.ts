import { World } from '/Users/sal/code/fabletest-sketch/src/engine/world';
import { DEFAULT_PARAMS } from '/Users/sal/code/fabletest-sketch/src/engine/params';
const w = new World(DEFAULT_PARAMS);
for (let ry = -4; ry <= 4; ry++) for (let rx = -4; rx <= 4; rx++) {
  const rv = w.features.riverFor(rx, ry);
  if (rv && rv.size > 30) {
    const ks = [...rv.keys()];
    const mid = ks[Math.floor(ks.length / 2)].split(',').map(Number);
    let falls = 0, drops = 0, mouths = 0;
    for (const c of rv.values()) { if (c.fall !== undefined) falls++; if (c.drop !== undefined) drops++; if (c.mouth !== undefined) mouths++; }
    console.log(`river region ${rx},${ry}: ${rv.size} cells, mid ${mid}, drops ${drops} falls ${falls} mouths ${mouths}`);
  }
}
// castles
for (let ry = -6; ry <= 6; ry++) for (let rx = -6; rx <= 6; rx++) {
  const st = w.features.regionStamp(rx, ry);
  if (st?.kind === 'castle') console.log(`castle @ ${st.anchor.x},${st.anchor.y}`);
}
