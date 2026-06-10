// Direction & tile key helpers.
//
// Grid axes: +x runs toward screen lower-right, +y toward screen lower-left.
// Kenney's suffix convention (verified visually): a tile's feature (door, water
// face, downhill side...) faces:
//   N -> +y (screen lower-left)
//   E -> +x (screen lower-right)
//   S -> -y (screen upper-right, hidden back face)
//   W -> -x (screen upper-left, hidden back face)

export type Pack = 'town' | 'exp' | 'desert';
export type Dir = 0 | 1 | 2 | 3; // N, E, S, W

export const DIR_N: Dir = 0;
export const DIR_E: Dir = 1;
export const DIR_S: Dir = 2;
export const DIR_W: Dir = 3;

export const SUFFIX = ['N', 'E', 'S', 'W'] as const;

/** grid delta for each direction */
export const DX = [0, 1, 0, -1];
export const DY = [1, 0, -1, 0];

export function rot(d: Dir, k: number): Dir {
  return ((d + k) & 3) as Dir;
}
export function opposite(d: Dir): Dir {
  return ((d + 2) & 3) as Dir;
}

export interface Placed {
  pack: Pack;
  name: string;
  dir: Dir;
  x: number;
  y: number;
  z: number;
}

export function tileKey(pack: Pack, name: string, dir: Dir): string {
  return `${pack}/${name}_${SUFFIX[dir]}`;
}

// Iso screen geometry (full-res pixels)
export const HALF_W = 116; // half of cell diamond width (232)
export const HALF_H = 55;  // half of cell diamond height (110)
export const LEVEL = 110;  // vertical px per height level
export const IMG_W = 256;
export const IMG_H = 352;
export const ANCHOR_X = -128; // img top-left relative to cell top vertex
export const ANCHOR_Y = -236;

export function screenX(x: number, y: number): number {
  return (x - y) * HALF_W;
}
export function screenY(x: number, y: number, z: number): number {
  return (x + y) * HALF_H - z * LEVEL;
}
/** painter's order key: back-to-front, then bottom-to-top */
export function sortKey(x: number, y: number, z: number): number {
  return (x + y) * 64 + z;
}
