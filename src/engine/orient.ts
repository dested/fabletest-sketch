// Orientation tables for every directional tile family.
//
// CALIBRATED AUTHORITATIVELY by pixel analysis of the tile art
// (scripts/tile_classify.py — silhouette envelope fitting; scripts/tile_masks.py
// — direct projected-position color sampling), cross-checked visually with
// wireframe overlays (scripts in /tmp/tilecheck). Do not "simplify" these
// tables: the pack mixes several authoring conventions (transpose, anti-
// transpose, corner-identity), so each family is its own explicit mapping.
//
// Grid dirs: N=+y (screen lower-left), E=+x (lower-right), S=-y, W=-x.
// Cell corners (screen): T=top(-x,-y)  R=right(+x,-y)  B=bottom(+x,+y)  L=left(-x,+y)

import { Dir, DIR_N, DIR_E, DIR_S, DIR_W } from './tileset';

const T = 0, R = 1, B = 2, L = 3; // corner ids
export type Corner = 0 | 1 | 2 | 3;

/** corner of the cell that points toward the diagonal between adjacent dirs a,b */
export function cornerToward(a: Dir, b: Dir): Corner {
  const m = (1 << a) | (1 << b);
  if (m === ((1 << DIR_N) | (1 << DIR_E))) return B;
  if (m === ((1 << DIR_E) | (1 << DIR_S))) return R;
  if (m === ((1 << DIR_S) | (1 << DIR_W))) return T;
  return L; // W,N
}

// ---- terrain slopes (also pathSlope / riverSlope — verified same convention) ----
// grass_slope_X descends toward X^1 (envelope-verified: N->E, E->N, S->W, W->S).
// Wedge sits ON the low cell at z = lowH+1; its high edge mates the plateau.
export function slopeSuffix(descDir: Dir): Dir {
  return (descDir ^ 1) as Dir;
}

// grass_slopeConvex_X: HIGH corner of the wedge = {N:T, E:R, S:B, W:L}.
// Placed on the low cell when only a diagonal neighbor is higher; the high
// corner must point at that diagonal.
const CONVEX_BY_HIGH_CORNER: Dir[] = [DIR_N, DIR_E, DIR_S, DIR_W]; // corner T,R,B,L -> suffix
export function convexSuffix(hiDirA: Dir, hiDirB: Dir): Dir {
  return CONVEX_BY_HIGH_CORNER[cornerToward(hiDirA, hiDirB)];
}

// grass_slopeConcave_X: LOW (dipped) corner = {N:B, E:L, S:T, W:R}.
// Placed on the low cell when two adjacent cardinals are higher; the dip
// points AWAY from them.
const CONCAVE_BY_LOW_CORNER: Dir[] = [DIR_S, DIR_W, DIR_N, DIR_E]; // corner T,R,B,L -> suffix
export function concaveSuffix(hiDirA: Dir, hiDirB: Dir): Dir {
  const dip = cornerToward(((hiDirA + 2) & 3) as Dir, ((hiDirB + 2) & 3) as Dir);
  return CONCAVE_BY_LOW_CORNER[dip];
}

// ---- water shore (tile is water; grass lip(s) on the named edges) ----
// grass_water_X lip edge: {N:S, E:E, S:N, W:W}  => suffix = (2-lip)&3 (self-inverse)
export function waterLipSuffix(lipEdge: Dir): Dir {
  return ((2 - lipEdge) & 3) as Dir;
}
// grass_waterConcave_X lips on the two edges meeting at corner {N:T, E:R, S:B, W:L}
const WATERCONCAVE_BY_CORNER: Dir[] = [DIR_N, DIR_E, DIR_S, DIR_W]; // corner T,R,B,L
export function waterConcaveSuffix(landDirA: Dir, landDirB: Dir): Dir {
  return WATERCONCAVE_BY_CORNER[cornerToward(landDirA, landDirB)];
}
// grass_waterConvex_X: tiny grass nub at corner {N:T, E:R, S:B, W:L} (land only diagonal)
export function waterConvexSuffix(diagDirA: Dir, diagDirB: Dir): Dir {
  return WATERCONCAVE_BY_CORNER[cornerToward(diagDirA, diagDirB)];
}
// grass_waterRiver_X (river mouth into open water): river enters through edge
// {N:W, E:S, S:E, W:N}  => suffix = 3 - entryEdge
export function riverMouthSuffix(entryEdge: Dir): Dir {
  return (3 - entryEdge) as Dir;
}

// ---- linear families: grass_path*, grass_river* (identical orientation layout) ----
// Connection mask bit i = connects through edge dir i (N=1,E=2,S=4,W=8).
const N = 1, E = 2, S = 4, W = 8;

export interface Variant { name: string; dir: Dir }

/** mask -> variant, calibrated via direct color sampling of every tile:
 *  straight _N connects E|W (x axis), _E connects N|S.
 *  Bend: _N={N,E} _E={N,W} _S={S,W} _W={E,S}
 *  Split (T): _N=N|E|S  _E=N|E|W  _S=N|S|W  _W=E|S|W
 *  End: opens toward {_N:E, _E:N, _S:W, _W:S}
 */
export function linearVariant(base: string, mask: number): Variant {
  switch (mask) {
    case E | W: return { name: base, dir: DIR_N };
    case N | S: return { name: base, dir: DIR_E };
    case N | E: return { name: `${base}Bend`, dir: DIR_N };
    case N | W: return { name: `${base}Bend`, dir: DIR_E };
    case S | W: return { name: `${base}Bend`, dir: DIR_S };
    case E | S: return { name: `${base}Bend`, dir: DIR_W };
    case N | E | S: return { name: `${base}Split`, dir: DIR_N };
    case N | E | W: return { name: `${base}Split`, dir: DIR_E };
    case N | S | W: return { name: `${base}Split`, dir: DIR_S };
    case E | S | W: return { name: `${base}Split`, dir: DIR_W };
    case N | E | S | W: return { name: `${base}Crossing`, dir: DIR_N };
    case E: return { name: `${base}End`, dir: DIR_N };
    case N: return { name: `${base}End`, dir: DIR_E };
    case W: return { name: `${base}End`, dir: DIR_S };
    case S: return { name: `${base}End`, dir: DIR_W };
    default: return { name: `${base}EndSquare`, dir: DIR_N };
  }
}

// water_fall_X (full dirt cube with river over the top pouring down one face):
// _N/_S: channel along x, fall face E.  _E/_W: channel along y, fall face N.
// Only E- and N-facing falls are visible from the camera.
export function waterfallSuffix(flowDir: Dir): Dir {
  return flowDir === DIR_E || flowDir === DIR_W ? DIR_N : DIR_E;
}

// grass_riverBridge_X: _N/_S river along x (deck walks y); _E/_W river along y.
export function riverBridgeSuffix(riverAxisIsX: boolean): Dir {
  return riverAxisIsX ? DIR_N : DIR_E;
}

// bridge_X (standalone deck): _N/_S walk along y; _E/_W walk along x.
export function bridgeSuffix(walkAxisIsX: boolean): Dir {
  return walkAxisIsX ? DIR_E : DIR_N;
}

// stairs_full_X (desert): steps DESCEND toward X (visible cuts: N,E; walled: S,W).
// Place on the low cell against a 1-level ledge; the high side is opposite(X).
export function stairsSuffix(descendDir: Dir): Dir {
  return descendDir;
}

// building feature tiles (doors, windows...): feature face = suffix^1,
// same transpose as slopes. door facing dir f => suffix f^1.
export function buildingSuffix(faceDir: Dir): Dir {
  return (faceDir ^ 1) as Dir;
}

// roof_gable*_X: _N/_S ridge along x; _E/_W ridge along y.
export function gableSuffix(ridgeAxisIsX: boolean): Dir {
  return ridgeAxisIsX ? DIR_N : DIR_E;
}
