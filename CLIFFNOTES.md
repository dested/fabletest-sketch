# CLIFFNOTES — fabletest-sketch

An infinite, procedurally generated isometric world built from Kenney's "Sketch"
tile packs (sketch-town, sketch-town-expansion, sketch-desert), rendered in a
Vite + React + Canvas app you can walk around in.

**Live:** https://dested.github.io/fabletest-sketch/ · **Deploy:** `npm run deploy`
(builds with `GITHUB_PAGES=1` and force-pushes `dist/` to the `gh-pages` branch —
the stored PAT lacks `workflow` scope, so GitHub Actions is not an option here).

---

## The world

- **Infinite & deterministic.** Everything is a pure function of
  `(x, y, params)`. Chunks (32×32 cells) generate lazily in ~10–20 ms and are
  LRU-cached. Same seed + sliders ⇒ same world, forever, in every direction.
- **Terrain.** Seeded simplex FBM elevation with domain warp (swirly coasts),
  ridged-noise mountains, roughness detail, quantized into walkable terraces.
  Moisture noise splits grass vs desert biomes — the desert pack reuses the
  town pack's tile names, so a biome is literally a pack swap.
- **Rivers.** Spring regions on a 96-cell grid roll a deterministic downhill
  walk with meander noise: riverEnd spring pools, autotiled bends/splits,
  1-level drops become riverSlope ramps, 2+ level drops become stacked
  `water_fall` cube columns, mouths into open water use `grass_waterRiver`.
  Rivers merge at confluences (T-splits).
- **Settlements** (region grid, 56 cells, all stamped deterministically):
  - *Walled towns*: ring + cross + secondary streets forming city blocks,
    20–34 houses (1×1, 2×1, two-story stacks), church with tower, plaza with
    well, fenced wheat farms, orchards, shrines; big towns get curtain walls
    with corner towers and gates where streets pierce.
  - *Castles*: curtain wall with regular + flanking towers, gatehouse, a 4×4
    two-story keep with corner turrets, courtyard barracks, well, ring paths.
  - *Desert relics*: lost cities (wall grids + domes), tiered temples with
    stair monuments, caravan camps with tents and palms.
  - *Grass ruins* as low-probability filler so the wilds never feel empty.
- **Roads** connect each settlement to its neighbors (deterministic L-paths,
  computed per region pair). Roads autotile, climb terraces via `pathSlope`,
  and cross rivers via `riverBridge` automatically.
- **NPCs.** Every settlement spawns 2–12 villagers (deterministic per anchor)
  who wander leashed random walks using the same walkability rules as the
  player. Simulated only near the player; culled when far.
- **Shadows.** Sun sits beyond the screen-top corner: cells overshadowed by
  taller terrain toward (−x,−y) get translucent diamond shades (computed in
  chunkgen as `__shade` pseudo-tiles); trees/rocks/props get blob shadows at
  render time. Both make elevation readable.

## The hard part: tile orientation calibration

The pack's `_N/_E/_S/_W` suffixes follow **several different conventions** —
this cost the most effort and three wrong guesses by eyeballing renders.
The locked tables live in `src/engine/orient.ts`; **don't "simplify" them**:

| family | rule |
|---|---|
| grass/path/river **slope** | suffix `s` descends toward `s^1` (N↔E, S↔W transposed) |
| **slopeConvex** | suffix → HIGH corner: N=top, E=right, S=bottom, W=left |
| **slopeConcave** | suffix → LOW (dipped) corner: N=bottom, E=left, S=top, W=right |
| **grass_water** lip | suffix → lip edge `(2-d)&3` (N↔S swapped, E/W identity) |
| **waterConcave/Convex** | suffix → corner: N=top, E=right, S=bottom, W=left |
| **waterRiver** (mouth) | river enters through edge: N→W, E→S, S→E, W→N |
| **path/river straights** | `_N/_S` run along x (connect E+W); `_E/_W` along y |
| **bends** | N={N,E}, E={N,W}, S={S,W}, W={E,S} |
| **splits** | missing edge: N→W, E→S, S→E, W→N |
| **ends** | open toward: N→E, E→N, S→W, W→S |
| **water_fall** | `_N/_S` channel x falling down E face; `_E/_W` channel y, N face |
| **bridge** | `_N/_S` walk along y; `_E/_W` walk along x |
| **stairs_full** | descends toward suffix (N/E visible, S/W walled backs) |
| **buildings** (door…) | feature face = `suffix^1` |
| **roof_gable** | `_N/_S` ridge along x; `_E/_W` ridge along y |

**Methodology that actually worked** (after visual inspection failed twice):

1. `scripts/tile_classify.py` — fit each tile's upper-envelope silhouette
   against predicted wedge geometries (planes, corner folds) in the cell
   parametrization `img_x = 128+(u−v)·116`, `img_y = 236+(u+v)·55 − 110h`.
2. `scripts/tile_masks.py` — sample colors at exact projected surface
   coordinates (flat tiles): which edges a path/river stripe reaches, which
   edges have grass lips, which corners have nubs. Top-down column probes are
   **occlusion-unreliable near front (N/E) edges** — direct projection isn't.
3. Wireframe overlays (edge-colored diamonds) for the families where you do
   need eyes: `tmp/ov_*.png`.
4. `scripts/calib.ts` + `scripts/compose.py` — five verification scenes
   (plateau skirt, lake, path net, river with bridge+mouth, building row)
   composited to PNG, checked visually: `tmp/v2_*.png`.

## Geometry cheat sheet

- Cell diamond 232×110; `screenX=(x−y)·116`, `screenY=(x+y)·55 − z·110`.
- Tile images 256×352, anchored at (−128, −236) from the cell's base vertex.
- A cube at z=k spans base vertex `(x+y)·55 − k·110` rising 110 px; the walk
  plane k is the top of cube k, at `(x+y)·55 − k·110` ... i.e. plane k renders
  at `screenY(x, y, k)`; characters' feet center = that + 55.
- Painter order: `(x+y)·64 + z`, ties by x; chunk lists are pre-sorted; the
  global merge re-sorts visible tiles (cached against coarse camera quanta).
- Character depth key: `ceil(fx+fy)·64 + ceil(z) + 0.49` — in front of every
  column they overlap mid-step, behind everything nearer. This is what fixed
  the player clipping while walking downhill.
- Heights: cell height h ⇒ cube at z=h, walk plane h+1. Water cells are h=0,
  drawn as inset water at z=1.
- Slopes/corners are wedges stacked **on the low cell** at `z = lowH+1`.

## Walkability (the up/down levels logic)

`World.zInCell` defines a **globally continuous walking surface**: flat cells
are flat at their plane; wedge cells (straight slopes AND corner pieces)
bilinearly interpolate between vertex heights, where each grid vertex takes
the max plane of its 4 touching cells clamped to [p, p+1]. `canStep` then
allows a move iff the two cells' surfaces meet at the shared edge midpoint
(< 0.26 difference). One rule covers flats, ramps, corners; bare cliffs and
2+ level jumps are naturally blocked, and `tmp/walktest.ts` verifies the
surface never pops more than 0.05 along any allowed step.

## Layout

```
src/engine/    noise, params(+presets), tileset(geometry), orient(CALIBRATED),
               terrain, features(rivers/towns/castles/relics/roads), chunkgen, world
src/render/    renderer (canvas, tile store, shades, sprites, draw cache)
src/game/      game (loop, input, camera), npcs
src/ui/        Panel (sliders/presets/seed), Minimap (click-to-travel)
scripts/       calib.ts, compose.py, tile_classify.py, tile_masks.py, tile_geom.py
public/tiles/  town/ exp/ desert/ (828 pre-rotated PNGs)
tmp/           historical calibration artifacts & scratch — KEEP; this is the
               project scratch dir going forward (renders, probes, test scripts)
```

## Gotchas / future work

- `__shade` is a renderer-drawn pseudo-tile (skipped by compose.py); it is not
  a real image — don't try to load it.
- The biome border is a hard pack-swap edge; a dithered transition band would
  soften it.
- Desert temple tiers are solid decor (not climbable); making `tiles_steps`
  a real ramp would let you summit pyramids.
- Town/castle flattening can cut sharp 2+ level cliffs at stamp borders —
  usually fine, occasionally dramatic.
- Chunk gen is ~10–20 ms on the main thread; a worker would remove rare
  hitches when sprinting into ungenerated territory.
