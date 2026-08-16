export type ZoneKind = 'town' | 'field' | 'dungeon' | 'boss';

export interface ZoneDef {
  id: string;
  name: string;
  act: number;
  kind: ZoneKind;
  zoneLevel: number;
  width: number;
  height: number;
  monsterPool: string[];
  bossId?: string;
  maxMonsters: number;
  connections: { to: string; label: string }[];
  groundColor: string;
  wallColor: string;
  accentColor: string;
}

export const ZONES: Record<string, ZoneDef> = {
  hub_town: {
    id: 'hub_town',
    name: 'Ashport Landing',
    act: 0,
    kind: 'town',
    zoneLevel: 1,
    width: 26,
    height: 26,
    monsterPool: [],
    maxMonsters: 0,
    connections: [{ to: 'a1_coast', label: 'The Blighted Coast' }],
    groundColor: '#7a7060',
    wallColor: '#4a4438',
    accentColor: '#c0a050',
  },

  // ---- Act 1 ----
  a1_coast: {
    id: 'a1_coast',
    name: 'The Blighted Coast',
    act: 1,
    kind: 'field',
    zoneLevel: 1,
    width: 40,
    height: 40,
    monsterPool: ['rot_hound', 'bog_crawler', 'tide_archer'],
    maxMonsters: 14,
    connections: [
      { to: 'hub_town', label: 'Ashport Landing' },
      { to: 'a1_outpost', label: 'Ruined Outpost' },
    ],
    groundColor: '#5a6a5a',
    wallColor: '#3a4a3a',
    accentColor: '#8aa08a',
  },
  a1_outpost: {
    id: 'a1_outpost',
    name: 'Ruined Outpost',
    act: 1,
    kind: 'dungeon',
    zoneLevel: 4,
    width: 34,
    height: 34,
    monsterPool: ['drowned_thrall', 'tide_shaman', 'bog_crawler'],
    maxMonsters: 16,
    connections: [
      { to: 'a1_coast', label: 'The Blighted Coast' },
      { to: 'a1_throne', label: 'The Sunken Throne' },
    ],
    groundColor: '#5a5248',
    wallColor: '#332e28',
    accentColor: '#7a8a90',
  },
  a1_throne: {
    id: 'a1_throne',
    name: 'The Sunken Throne',
    act: 1,
    kind: 'boss',
    zoneLevel: 6,
    width: 20,
    height: 20,
    monsterPool: [],
    bossId: 'boss_drowned_king',
    maxMonsters: 1,
    connections: [{ to: 'a1_outpost', label: 'Ruined Outpost' }],
    groundColor: '#2e3a42',
    wallColor: '#1a2226',
    accentColor: '#4a708a',
  },

  // ---- Act 2 ----
  a2_dunes: {
    id: 'a2_dunes',
    name: 'The Sunscorched Dunes',
    act: 2,
    kind: 'field',
    zoneLevel: 10,
    width: 44,
    height: 44,
    monsterPool: ['sand_scorpion', 'dune_stalker', 'cinder_slinger'],
    maxMonsters: 16,
    connections: [
      { to: 'hub_town', label: 'Ashport Landing' },
      { to: 'a2_temple', label: 'Buried Temple' },
    ],
    groundColor: '#a08a5a',
    wallColor: '#6a5a38',
    accentColor: '#d0b070',
  },
  a2_temple: {
    id: 'a2_temple',
    name: 'Buried Temple',
    act: 2,
    kind: 'dungeon',
    zoneLevel: 13,
    width: 36,
    height: 36,
    monsterPool: ['bone_legionnaire', 'dune_witch', 'sand_scorpion'],
    maxMonsters: 18,
    connections: [
      { to: 'a2_dunes', label: 'The Sunscorched Dunes' },
      { to: 'a2_throne', label: 'The Tyrant’s Court' },
    ],
    groundColor: '#8a704a',
    wallColor: '#4a3a24',
    accentColor: '#c09a5a',
  },
  a2_throne: {
    id: 'a2_throne',
    name: "The Tyrant's Court",
    act: 2,
    kind: 'boss',
    zoneLevel: 16,
    width: 22,
    height: 22,
    monsterPool: [],
    bossId: 'boss_sand_tyrant',
    maxMonsters: 1,
    connections: [{ to: 'a2_temple', label: 'Buried Temple' }],
    groundColor: '#6a5228',
    wallColor: '#382c16',
    accentColor: '#e0b050',
  },

  // ---- Act 3 ----
  a3_peaks: {
    id: 'a3_peaks',
    name: 'Frostspire Peaks',
    act: 3,
    kind: 'field',
    zoneLevel: 20,
    width: 46,
    height: 46,
    monsterPool: ['frost_wolf', 'storm_harpy', 'frozen_revenant'],
    maxMonsters: 18,
    connections: [
      { to: 'hub_town', label: 'Ashport Landing' },
      { to: 'a3_citadel', label: 'The Frozen Citadel' },
    ],
    groundColor: '#9aacc0',
    wallColor: '#4a5a6a',
    accentColor: '#e0f0ff',
  },
  a3_citadel: {
    id: 'a3_citadel',
    name: 'The Frozen Citadel',
    act: 3,
    kind: 'dungeon',
    zoneLevel: 24,
    width: 38,
    height: 38,
    monsterPool: ['glacial_construct', 'rime_conjurer', 'frozen_revenant', 'storm_harpy'],
    maxMonsters: 20,
    connections: [
      { to: 'a3_peaks', label: 'Frostspire Peaks' },
      { to: 'a3_throne', label: 'The Ashen Throne' },
    ],
    groundColor: '#7a8a9a',
    wallColor: '#3a4652',
    accentColor: '#c0dcf0',
  },
  a3_throne: {
    id: 'a3_throne',
    name: 'The Ashen Throne',
    act: 3,
    kind: 'boss',
    zoneLevel: 28,
    width: 24,
    height: 24,
    monsterPool: [],
    bossId: 'boss_ashen_monarch',
    maxMonsters: 1,
    connections: [{ to: 'a3_citadel', label: 'The Frozen Citadel' }],
    groundColor: '#3a2a28',
    wallColor: '#1e1414',
    accentColor: '#e06a3a',
  },
};

export const ZONE_LIST: ZoneDef[] = Object.values(ZONES);
export const ACT_ORDER = [1, 2, 3];
