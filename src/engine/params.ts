// World generation parameters — every slider in the World Builder panel maps to one of these.

export interface WorldParams {
  seed: number;
  /** size of landmasses; bigger = larger continents */
  terrainScale: number;
  /** 0..1 — how much of the world is ocean */
  seaLevel: number;
  /** number of terrain height levels above sea */
  heightLevels: number;
  /** 0..1 — strength of ridged mountain ranges */
  mountains: number;
  /** 0..1 — small-scale terrain roughness */
  roughness: number;
  /** 0..1 — domain warp strength: swirly, organic coastlines */
  warp: number;
  /** 0..1 — fraction of land that turns to desert */
  desert: number;
  /** size of climate zones */
  climateScale: number;
  /** 0..1 — tree coverage */
  forests: number;
  /** 0..1 — chance each river region spawns a river */
  rivers: number;
  /** 0..1 — chance each village region spawns a village */
  villages: number;
  /** 0..1 — chance each castle region spawns a castle */
  castles: number;
  /** 0..1 — desert ruins / oases / camps / pyramids */
  relics: number;
  /** 0..1 — scattered rocks & wildflower decor */
  decor: number;
}

export const DEFAULT_PARAMS: WorldParams = {
  seed: 1337,
  terrainScale: 180,
  seaLevel: 0.34,
  heightLevels: 7,
  mountains: 0.55,
  roughness: 0.5,
  warp: 0.5,
  desert: 0.35,
  climateScale: 420,
  forests: 0.45,
  rivers: 0.75,
  villages: 0.75,
  castles: 0.6,
  relics: 0.7,
  decor: 0.5,
};

export interface ParamSpec {
  key: keyof WorldParams;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
  hint?: string;
}

export const PARAM_SPECS: ParamSpec[] = [
  { key: 'terrainScale', label: 'Landmass size', min: 60, max: 480, step: 5, group: 'Terrain', hint: 'How sprawling continents are' },
  { key: 'seaLevel', label: 'Sea level', min: 0.05, max: 0.6, step: 0.01, group: 'Terrain', hint: 'Raise to drown the world' },
  { key: 'heightLevels', label: 'Peak height', min: 2, max: 10, step: 1, group: 'Terrain', hint: 'Terrace levels above the sea' },
  { key: 'mountains', label: 'Mountains', min: 0, max: 1, step: 0.01, group: 'Terrain', hint: 'Ridged ranges & highlands' },
  { key: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.01, group: 'Terrain', hint: 'Bumpiness of the land' },
  { key: 'warp', label: 'Swirl', min: 0, max: 1, step: 0.01, group: 'Terrain', hint: 'Warps coastlines into organic shapes' },
  { key: 'desert', label: 'Desert', min: 0, max: 1, step: 0.01, group: 'Climate', hint: 'How much land bakes to sand' },
  { key: 'climateScale', label: 'Climate zones', min: 120, max: 900, step: 10, group: 'Climate', hint: 'Size of biome regions' },
  { key: 'rivers', label: 'Rivers', min: 0, max: 1, step: 0.01, group: 'Water & Life', hint: 'Winding rivers with waterfalls' },
  { key: 'forests', label: 'Forests', min: 0, max: 1, step: 0.01, group: 'Water & Life', hint: 'Tree coverage' },
  { key: 'decor', label: 'Rocks & detail', min: 0, max: 1, step: 0.01, group: 'Water & Life' },
  { key: 'villages', label: 'Villages', min: 0, max: 1, step: 0.01, group: 'Civilization', hint: 'Walled hamlets with farms' },
  { key: 'castles', label: 'Castles', min: 0, max: 1, step: 0.01, group: 'Civilization', hint: 'Mountain strongholds' },
  { key: 'relics', label: 'Desert relics', min: 0, max: 1, step: 0.01, group: 'Civilization', hint: 'Ruins, oases, pyramids, camps' },
];

export interface Preset { name: string; emoji: string; params: Partial<WorldParams> }

export const PRESETS: Preset[] = [
  { name: 'Verdant Kingdom', emoji: '🏰', params: { seaLevel: 0.3, desert: 0.18, mountains: 0.5, forests: 0.55, villages: 0.85, castles: 0.7, rivers: 0.8, terrainScale: 200 } },
  { name: 'Dune Sea', emoji: '🏜️', params: { seaLevel: 0.12, desert: 0.92, mountains: 0.35, forests: 0.1, relics: 0.95, rivers: 0.35, terrainScale: 240 } },
  { name: 'Archipelago', emoji: '🏝️', params: { seaLevel: 0.52, terrainScale: 110, warp: 0.8, desert: 0.3, mountains: 0.45, forests: 0.5, villages: 0.7 } },
  { name: 'Highlands', emoji: '⛰️', params: { seaLevel: 0.2, mountains: 0.95, heightLevels: 10, roughness: 0.65, forests: 0.5, castles: 0.9, desert: 0.15 } },
  { name: 'Riverlands', emoji: '🏞️', params: { seaLevel: 0.34, rivers: 1, mountains: 0.4, heightLevels: 5, villages: 0.9, forests: 0.4, desert: 0.2 } },
];
