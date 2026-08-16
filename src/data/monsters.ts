import type { DamageType } from '../core/types.ts';

export type MonsterBehavior = 'melee' | 'ranged' | 'caster';

export interface MonsterDef {
  id: string;
  name: string;
  behavior: MonsterBehavior;
  baseLife: number;
  baseDamageMin: number;
  baseDamageMax: number;
  damageType: DamageType;
  attackRange: number;
  attackCooldown: number;
  moveSpeed: number;
  xpValue: number;
  armor: number;
  evasion: number;
  fireRes: number;
  coldRes: number;
  lightningRes: number;
  chaosRes: number;
  aggroRadius: number;
  radius: number;
  color: string;
  icon: 'blob' | 'wolf' | 'skeleton' | 'archer' | 'caster' | 'brute' | 'boss';
  isBoss?: boolean;
  projectileSpeed?: number;
  lootTier: number;
}

export const MONSTERS: Record<string, MonsterDef> = {
  // ---- Act 1: The Blighted Coast ----
  rot_hound: { id: 'rot_hound', name: 'Rot Hound', behavior: 'melee', baseLife: 32, baseDamageMin: 3, baseDamageMax: 6, damageType: 'physical', attackRange: 1.1, attackCooldown: 1.1, moveSpeed: 3.4, xpValue: 6, armor: 0, evasion: 20, fireRes: 0, coldRes: 0, lightningRes: 0, chaosRes: 0, aggroRadius: 7, radius: 0.4, color: '#7a6a4a', icon: 'wolf', lootTier: 1 },
  bog_crawler: { id: 'bog_crawler', name: 'Bog Crawler', behavior: 'melee', baseLife: 48, baseDamageMin: 4, baseDamageMax: 8, damageType: 'physical', attackRange: 1.2, attackCooldown: 1.3, moveSpeed: 2.2, xpValue: 8, armor: 10, evasion: 0, fireRes: 0, coldRes: -10, lightningRes: 0, chaosRes: 20, aggroRadius: 6, radius: 0.5, color: '#4a6a4a', icon: 'blob', lootTier: 1 },
  drowned_thrall: { id: 'drowned_thrall', name: 'Drowned Thrall', behavior: 'melee', baseLife: 40, baseDamageMin: 4, baseDamageMax: 7, damageType: 'physical', attackRange: 1.1, attackCooldown: 1.0, moveSpeed: 2.6, xpValue: 7, armor: 5, evasion: 5, fireRes: 0, coldRes: 0, lightningRes: 0, chaosRes: 0, aggroRadius: 6.5, radius: 0.4, color: '#5a7a7a', icon: 'skeleton', lootTier: 1 },
  tide_archer: { id: 'tide_archer', name: 'Tide Raider Archer', behavior: 'ranged', baseLife: 26, baseDamageMin: 3, baseDamageMax: 6, damageType: 'physical', attackRange: 7, attackCooldown: 1.4, moveSpeed: 2.6, xpValue: 8, armor: 0, evasion: 25, fireRes: 0, coldRes: 0, lightningRes: 0, chaosRes: 0, aggroRadius: 9, radius: 0.4, color: '#8a7a5a', icon: 'archer', projectileSpeed: 12, lootTier: 1 },
  tide_shaman: { id: 'tide_shaman', name: 'Tide Shaman', behavior: 'caster', baseLife: 30, baseDamageMin: 5, baseDamageMax: 9, damageType: 'cold', attackRange: 7, attackCooldown: 1.8, moveSpeed: 2.2, xpValue: 10, armor: 0, evasion: 10, fireRes: 0, coldRes: 40, lightningRes: 0, chaosRes: 0, aggroRadius: 8, radius: 0.4, color: '#4a7a9a', icon: 'caster', projectileSpeed: 9, lootTier: 1 },
  boss_drowned_king: {
    id: 'boss_drowned_king', name: 'The Drowned King', behavior: 'melee', baseLife: 900, baseDamageMin: 14, baseDamageMax: 24, damageType: 'physical', attackRange: 1.8, attackCooldown: 1.2, moveSpeed: 2.4, xpValue: 400, armor: 30, evasion: 0, fireRes: 20, coldRes: 40, lightningRes: 0, chaosRes: 20, aggroRadius: 14, radius: 0.9, color: '#3a5a6a', icon: 'boss', isBoss: true, lootTier: 3,
  },

  // ---- Act 2: The Sunscorched Dunes ----
  sand_scorpion: { id: 'sand_scorpion', name: 'Sand Scorpion', behavior: 'melee', baseLife: 70, baseDamageMin: 8, baseDamageMax: 14, damageType: 'physical', attackRange: 1.2, attackCooldown: 1.1, moveSpeed: 3.2, xpValue: 16, armor: 20, evasion: 10, fireRes: 20, coldRes: 0, lightningRes: 0, chaosRes: 30, aggroRadius: 7, radius: 0.45, color: '#c0a050', icon: 'blob', lootTier: 2 },
  dune_stalker: { id: 'dune_stalker', name: 'Dune Stalker', behavior: 'melee', baseLife: 60, baseDamageMin: 9, baseDamageMax: 15, damageType: 'physical', attackRange: 1.1, attackCooldown: 0.9, moveSpeed: 4.2, xpValue: 15, armor: 0, evasion: 40, fireRes: 10, coldRes: 0, lightningRes: 0, chaosRes: 0, aggroRadius: 8, radius: 0.4, color: '#a08050', icon: 'wolf', lootTier: 2 },
  bone_legionnaire: { id: 'bone_legionnaire', name: 'Bone Legionnaire', behavior: 'melee', baseLife: 90, baseDamageMin: 10, baseDamageMax: 17, damageType: 'physical', attackRange: 1.3, attackCooldown: 1.3, moveSpeed: 2.4, xpValue: 18, armor: 40, evasion: 0, fireRes: 0, coldRes: 0, lightningRes: 0, chaosRes: 0, aggroRadius: 7, radius: 0.5, color: '#c0c0a0', icon: 'skeleton', lootTier: 2 },
  cinder_slinger: { id: 'cinder_slinger', name: 'Cinder Slinger', behavior: 'ranged', baseLife: 55, baseDamageMin: 8, baseDamageMax: 13, damageType: 'fire', attackRange: 8, attackCooldown: 1.5, moveSpeed: 2.8, xpValue: 17, armor: 0, evasion: 20, fireRes: 60, coldRes: 0, lightningRes: 0, chaosRes: 0, aggroRadius: 9, radius: 0.4, color: '#c06a3a', icon: 'archer', projectileSpeed: 11, lootTier: 2 },
  dune_witch: { id: 'dune_witch', name: 'Dune Witch', behavior: 'caster', baseLife: 60, baseDamageMin: 11, baseDamageMax: 18, damageType: 'chaos', attackRange: 7.5, attackCooldown: 1.7, moveSpeed: 2.3, xpValue: 20, armor: 0, evasion: 15, fireRes: 0, coldRes: 0, lightningRes: 0, chaosRes: 50, aggroRadius: 8.5, radius: 0.4, color: '#8a5a9a', icon: 'caster', projectileSpeed: 10, lootTier: 2 },
  boss_sand_tyrant: {
    id: 'boss_sand_tyrant', name: 'The Sand Tyrant', behavior: 'melee', baseLife: 2400, baseDamageMin: 24, baseDamageMax: 38, damageType: 'physical', attackRange: 2.2, attackCooldown: 1.1, moveSpeed: 2.8, xpValue: 1400, armor: 60, evasion: 20, fireRes: 50, coldRes: 0, lightningRes: 0, chaosRes: 30, aggroRadius: 16, radius: 1.1, color: '#b08040', icon: 'boss', isBoss: true, lootTier: 4,
  },

  // ---- Act 3: Frostspire Peaks ----
  frost_wolf: { id: 'frost_wolf', name: 'Frost Wolf', behavior: 'melee', baseLife: 110, baseDamageMin: 14, baseDamageMax: 22, damageType: 'cold', attackRange: 1.2, attackCooldown: 1.0, moveSpeed: 4.0, xpValue: 30, armor: 10, evasion: 30, fireRes: 0, coldRes: 60, lightningRes: 0, chaosRes: 0, aggroRadius: 8, radius: 0.45, color: '#a0c0e0', icon: 'wolf', lootTier: 3 },
  frozen_revenant: { id: 'frozen_revenant', name: 'Frozen Revenant', behavior: 'melee', baseLife: 150, baseDamageMin: 16, baseDamageMax: 25, damageType: 'physical', attackRange: 1.3, attackCooldown: 1.2, moveSpeed: 2.2, xpValue: 32, armor: 50, evasion: 0, fireRes: 0, coldRes: 40, lightningRes: 0, chaosRes: 0, aggroRadius: 7, radius: 0.5, color: '#c0d8e8', icon: 'skeleton', lootTier: 3 },
  storm_harpy: { id: 'storm_harpy', name: 'Storm Harpy', behavior: 'ranged', baseLife: 95, baseDamageMin: 13, baseDamageMax: 20, damageType: 'lightning', attackRange: 8.5, attackCooldown: 1.4, moveSpeed: 3.6, xpValue: 34, armor: 0, evasion: 40, fireRes: 0, coldRes: 20, lightningRes: 70, chaosRes: 0, aggroRadius: 10, radius: 0.4, color: '#8aa0c0', icon: 'archer', projectileSpeed: 14, lootTier: 3 },
  glacial_construct: { id: 'glacial_construct', name: 'Glacial Construct', behavior: 'melee', baseLife: 220, baseDamageMin: 20, baseDamageMax: 32, damageType: 'cold', attackRange: 1.6, attackCooldown: 1.6, moveSpeed: 1.8, xpValue: 40, armor: 80, evasion: 0, fireRes: -20, coldRes: 80, lightningRes: 0, chaosRes: 0, aggroRadius: 6, radius: 0.6, color: '#c0e0f0', icon: 'brute', lootTier: 3 },
  rime_conjurer: { id: 'rime_conjurer', name: 'Rime Conjurer', behavior: 'caster', baseLife: 100, baseDamageMin: 18, baseDamageMax: 28, damageType: 'cold', attackRange: 8, attackCooldown: 1.9, moveSpeed: 2.4, xpValue: 38, armor: 0, evasion: 20, fireRes: 0, coldRes: 60, lightningRes: 0, chaosRes: 0, aggroRadius: 9, radius: 0.4, color: '#6a9ac0', icon: 'caster', projectileSpeed: 10, lootTier: 3 },
  boss_ashen_monarch: {
    id: 'boss_ashen_monarch', name: 'The Ashen Monarch', behavior: 'caster', baseLife: 6000, baseDamageMin: 40, baseDamageMax: 65, damageType: 'fire', attackRange: 9, attackCooldown: 1.3, moveSpeed: 2.6, xpValue: 5000, armor: 40, evasion: 20, fireRes: 70, coldRes: 30, lightningRes: 30, chaosRes: 30, aggroRadius: 20, radius: 1.3, color: '#e0603a', icon: 'boss', isBoss: true, projectileSpeed: 13, lootTier: 5,
  },
};

export function scaledMonsterLife(def: MonsterDef, zoneLevel: number): number {
  return Math.round(def.baseLife * (1 + (zoneLevel - 1) * 0.13));
}
export function scaledMonsterDamage(def: MonsterDef, zoneLevel: number): [number, number] {
  const mult = 1 + (zoneLevel - 1) * 0.11;
  return [Math.round(def.baseDamageMin * mult), Math.round(def.baseDamageMax * mult)];
}
