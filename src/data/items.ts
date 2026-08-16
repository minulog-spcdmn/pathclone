import type { DamageType } from '../core/types.ts';

export type ItemSlot =
  | 'weapon'
  | 'offhand'
  | 'helmet'
  | 'body'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'amulet'
  | 'ring'
  | 'flask'
  | 'gem';

export type DefenseArchetype = 'armor' | 'evasion' | 'es' | 'armor_evasion' | 'armor_es' | 'evasion_es';

export interface ItemBaseDef {
  id: string;
  name: string;
  slot: ItemSlot;
  gridW: number;
  gridH: number;
  reqLevel: number;
  reqAttrs: { strength?: number; dexterity?: number; intelligence?: number };
  icon: string; // simple shape key used by the renderer
  color: string;
  // weapon-only
  weaponClass?: string;
  damageMin?: number;
  damageMax?: number;
  damageType?: DamageType;
  attackTime?: number; // seconds per attack at 100% speed
  critChance?: number; // base %
  isTwoHanded?: boolean;
  // armor-only
  archetype?: DefenseArchetype;
  armorBase?: number;
  evasionBase?: number;
  esBase?: number;
  // flask-only
  flaskKind?: 'life' | 'mana';
  flaskLife?: number;
  flaskMana?: number;
  flaskDuration?: number;
  // gem-only
  gemKind?: 'skill' | 'support';
}

export const ITEM_BASES: Record<string, ItemBaseDef> = {
  // ---- Warrior: two-handed maces ----
  two_hand_mace_t1: { id: 'two_hand_mace_t1', name: 'Rusted Greatmace', slot: 'weapon', gridW: 2, gridH: 4, reqLevel: 1, reqAttrs: { strength: 18 }, icon: 'mace', color: '#8a7a6a', weaponClass: 'mace', damageMin: 8, damageMax: 15, damageType: 'physical', attackTime: 1.55, critChance: 5, isTwoHanded: true },
  two_hand_mace_t2: { id: 'two_hand_mace_t2', name: 'Warhammer', slot: 'weapon', gridW: 2, gridH: 4, reqLevel: 14, reqAttrs: { strength: 44 }, icon: 'mace', color: '#9c8a72', weaponClass: 'mace', damageMin: 22, damageMax: 38, damageType: 'physical', attackTime: 1.6, critChance: 5, isTwoHanded: true },
  two_hand_mace_t3: { id: 'two_hand_mace_t3', name: 'Colossus Maul', slot: 'weapon', gridW: 2, gridH: 4, reqLevel: 30, reqAttrs: { strength: 88 }, icon: 'mace', color: '#b8a482', weaponClass: 'mace', damageMin: 48, damageMax: 79, damageType: 'physical', attackTime: 1.65, critChance: 5, isTwoHanded: true },
  // ---- Monk: quarterstaves ----
  quarterstaff_t1: { id: 'quarterstaff_t1', name: 'Ashen Quarterstaff', slot: 'weapon', gridW: 1, gridH: 4, reqLevel: 1, reqAttrs: { dexterity: 16 }, icon: 'staff', color: '#7a6a5a', weaponClass: 'quarterstaff', damageMin: 5, damageMax: 9, damageType: 'physical', attackTime: 1.05, critChance: 6, isTwoHanded: true },
  quarterstaff_t2: { id: 'quarterstaff_t2', name: 'Serpent Quarterstaff', slot: 'weapon', gridW: 1, gridH: 4, reqLevel: 14, reqAttrs: { dexterity: 40 }, icon: 'staff', color: '#6a8a6a', weaponClass: 'quarterstaff', damageMin: 14, damageMax: 24, damageType: 'physical', attackTime: 1.0, critChance: 6, isTwoHanded: true },
  quarterstaff_t3: { id: 'quarterstaff_t3', name: "Windwalker's Staff", slot: 'weapon', gridW: 1, gridH: 4, reqLevel: 30, reqAttrs: { dexterity: 80 }, icon: 'staff', color: '#8ac0b0', weaponClass: 'quarterstaff', damageMin: 30, damageMax: 50, damageType: 'physical', attackTime: 0.95, critChance: 7, isTwoHanded: true },
  // ---- Ranger: bows ----
  shortbow_t1: { id: 'shortbow_t1', name: 'Hunter Shortbow', slot: 'weapon', gridW: 2, gridH: 4, reqLevel: 1, reqAttrs: { dexterity: 18 }, icon: 'bow', color: '#8a6a4a', weaponClass: 'bow', damageMin: 6, damageMax: 12, damageType: 'physical', attackTime: 1.15, critChance: 6, isTwoHanded: true },
  shortbow_t2: { id: 'shortbow_t2', name: 'Recurve Bow', slot: 'weapon', gridW: 2, gridH: 4, reqLevel: 14, reqAttrs: { dexterity: 44 }, icon: 'bow', color: '#a08050', weaponClass: 'bow', damageMin: 18, damageMax: 30, damageType: 'physical', attackTime: 1.1, critChance: 6, isTwoHanded: true },
  shortbow_t3: { id: 'shortbow_t3', name: 'Stormwood Longbow', slot: 'weapon', gridW: 2, gridH: 4, reqLevel: 30, reqAttrs: { dexterity: 88 }, icon: 'bow', color: '#b09060', weaponClass: 'bow', damageMin: 38, damageMax: 62, damageType: 'physical', attackTime: 1.05, critChance: 7, isTwoHanded: true },
  // ---- Sorceress: sceptres ----
  sceptre_t1: { id: 'sceptre_t1', name: 'Novice Sceptre', slot: 'weapon', gridW: 1, gridH: 3, reqLevel: 1, reqAttrs: { intelligence: 18 }, icon: 'sceptre', color: '#6a5a9a', weaponClass: 'sceptre', damageMin: 3, damageMax: 6, damageType: 'physical', attackTime: 1.3, critChance: 6, isTwoHanded: false },
  sceptre_t2: { id: 'sceptre_t2', name: 'Ember Sceptre', slot: 'weapon', gridW: 1, gridH: 3, reqLevel: 14, reqAttrs: { intelligence: 44 }, icon: 'sceptre', color: '#8a5aaa', weaponClass: 'sceptre', damageMin: 8, damageMax: 15, damageType: 'physical', attackTime: 1.25, critChance: 6, isTwoHanded: false },
  sceptre_t3: { id: 'sceptre_t3', name: 'Archon Sceptre', slot: 'weapon', gridW: 1, gridH: 3, reqLevel: 30, reqAttrs: { intelligence: 88 }, icon: 'sceptre', color: '#aa5ac0', weaponClass: 'sceptre', damageMin: 16, damageMax: 28, damageType: 'physical', attackTime: 1.2, critChance: 6, isTwoHanded: false },
  // ---- Witch: wands ----
  wand_t1: { id: 'wand_t1', name: 'Driftwood Wand', slot: 'weapon', gridW: 1, gridH: 3, reqLevel: 1, reqAttrs: { intelligence: 18 }, icon: 'wand', color: '#5a4a7a', weaponClass: 'wand', damageMin: 3, damageMax: 5, damageType: 'physical', attackTime: 1.0, critChance: 7, isTwoHanded: false },
  wand_t2: { id: 'wand_t2', name: 'Bone Wand', slot: 'weapon', gridW: 1, gridH: 3, reqLevel: 14, reqAttrs: { intelligence: 44 }, icon: 'wand', color: '#7a6a9a', weaponClass: 'wand', damageMin: 7, damageMax: 13, damageType: 'physical', attackTime: 0.95, critChance: 7, isTwoHanded: false },
  wand_t3: { id: 'wand_t3', name: 'Voidwood Wand', slot: 'weapon', gridW: 1, gridH: 3, reqLevel: 30, reqAttrs: { intelligence: 88 }, icon: 'wand', color: '#9a7ac0', weaponClass: 'wand', damageMin: 14, damageMax: 24, damageType: 'physical', attackTime: 0.9, critChance: 7, isTwoHanded: false },
  // ---- Mercenary: crossbows ----
  crossbow_t1: { id: 'crossbow_t1', name: 'Field Crossbow', slot: 'weapon', gridW: 2, gridH: 3, reqLevel: 1, reqAttrs: { dexterity: 14, intelligence: 12 }, icon: 'crossbow', color: '#5a6a4a', weaponClass: 'crossbow', damageMin: 7, damageMax: 13, damageType: 'physical', attackTime: 1.2, critChance: 6, isTwoHanded: true },
  crossbow_t2: { id: 'crossbow_t2', name: 'Repeating Crossbow', slot: 'weapon', gridW: 2, gridH: 3, reqLevel: 14, reqAttrs: { dexterity: 34, intelligence: 30 }, icon: 'crossbow', color: '#6a8a5a', weaponClass: 'crossbow', damageMin: 19, damageMax: 32, damageType: 'physical', attackTime: 1.1, critChance: 6, isTwoHanded: true },
  crossbow_t3: { id: 'crossbow_t3', name: 'Siege Crossbow', slot: 'weapon', gridW: 2, gridH: 3, reqLevel: 30, reqAttrs: { dexterity: 68, intelligence: 60 }, icon: 'crossbow', color: '#8ac07a', weaponClass: 'crossbow', damageMin: 40, damageMax: 66, damageType: 'physical', attackTime: 1.05, critChance: 7, isTwoHanded: true },
  // ---- Generic loot-only weapons for variety ----
  one_hand_sword_t1: { id: 'one_hand_sword_t1', name: 'Rusted Shortsword', slot: 'weapon', gridW: 1, gridH: 3, reqLevel: 1, reqAttrs: { strength: 12, dexterity: 12 }, icon: 'sword', color: '#a0a0a0', weaponClass: 'sword', damageMin: 5, damageMax: 9, damageType: 'physical', attackTime: 1.0, critChance: 6, isTwoHanded: false },
  dagger_t1: { id: 'dagger_t1', name: 'Glass Shiv', slot: 'weapon', gridW: 1, gridH: 3, reqLevel: 1, reqAttrs: { dexterity: 20 }, icon: 'dagger', color: '#c0c8d0', weaponClass: 'dagger', damageMin: 3, damageMax: 6, damageType: 'physical', attackTime: 0.7, critChance: 8, isTwoHanded: false },
  claw_t1: { id: 'claw_t1', name: 'Sharktooth Claw', slot: 'weapon', gridW: 1, gridH: 3, reqLevel: 1, reqAttrs: { dexterity: 18 }, icon: 'claw', color: '#d0c0a0', weaponClass: 'claw', damageMin: 4, damageMax: 7, damageType: 'physical', attackTime: 0.75, critChance: 7, isTwoHanded: false },
  battle_staff_t1: { id: 'battle_staff_t1', name: 'Gnarled Battle Staff', slot: 'weapon', gridW: 1, gridH: 4, reqLevel: 1, reqAttrs: { strength: 20, intelligence: 20 }, icon: 'staff', color: '#7a7a5a', weaponClass: 'staff', damageMin: 9, damageMax: 16, damageType: 'physical', attackTime: 1.4, critChance: 5, isTwoHanded: true },

  // ---- Offhands ----
  shield_t1: { id: 'shield_t1', name: 'Splintered Buckler', slot: 'offhand', gridW: 2, gridH: 2, reqLevel: 1, reqAttrs: { strength: 16 }, icon: 'shield', color: '#8a7a5a', archetype: 'armor', armorBase: 40 },
  quiver_t1: { id: 'quiver_t1', name: 'Fletcher Quiver', slot: 'offhand', gridW: 1, gridH: 2, reqLevel: 1, reqAttrs: { dexterity: 14 }, icon: 'quiver', color: '#6a5a3a' },
  focus_t1: { id: 'focus_t1', name: 'Arcane Focus', slot: 'offhand', gridW: 1, gridH: 2, reqLevel: 1, reqAttrs: { intelligence: 16 }, icon: 'focus', color: '#5a6ac0', archetype: 'es', esBase: 15 },

  // ---- Armor: helmet / body / gloves / boots, x3 archetypes ----
  helmet_str_t1: { id: 'helmet_str_t1', name: 'Iron Greathelm', slot: 'helmet', gridW: 2, gridH: 2, reqLevel: 1, reqAttrs: { strength: 16 }, icon: 'helmet', color: '#8a8a8a', archetype: 'armor', armorBase: 35 },
  helmet_dex_t1: { id: 'helmet_dex_t1', name: 'Leather Cap', slot: 'helmet', gridW: 2, gridH: 2, reqLevel: 1, reqAttrs: { dexterity: 16 }, icon: 'helmet', color: '#8a6a4a', archetype: 'evasion', evasionBase: 40 },
  helmet_int_t1: { id: 'helmet_int_t1', name: 'Silk Coif', slot: 'helmet', gridW: 2, gridH: 2, reqLevel: 1, reqAttrs: { intelligence: 16 }, icon: 'helmet', color: '#6a5a9a', archetype: 'es', esBase: 18 },
  body_str_t1: { id: 'body_str_t1', name: 'Plate Vest', slot: 'body', gridW: 2, gridH: 3, reqLevel: 1, reqAttrs: { strength: 20 }, icon: 'body', color: '#7a7a7a', archetype: 'armor', armorBase: 70 },
  body_dex_t1: { id: 'body_dex_t1', name: 'Padded Jerkin', slot: 'body', gridW: 2, gridH: 3, reqLevel: 1, reqAttrs: { dexterity: 20 }, icon: 'body', color: '#7a5a3a', archetype: 'evasion', evasionBase: 80 },
  body_int_t1: { id: 'body_int_t1', name: 'Silken Robe', slot: 'body', gridW: 2, gridH: 3, reqLevel: 1, reqAttrs: { intelligence: 20 }, icon: 'body', color: '#5a4a8a', archetype: 'es', esBase: 34 },
  body_hybrid_t1: { id: 'body_hybrid_t1', name: 'Scaled Hauberk', slot: 'body', gridW: 2, gridH: 3, reqLevel: 6, reqAttrs: { strength: 16, dexterity: 16 }, icon: 'body', color: '#6a7a5a', archetype: 'armor_evasion', armorBase: 40, evasionBase: 40 },
  gloves_str_t1: { id: 'gloves_str_t1', name: 'Iron Gauntlets', slot: 'gloves', gridW: 2, gridH: 2, reqLevel: 1, reqAttrs: { strength: 14 }, icon: 'gloves', color: '#8a8a8a', archetype: 'armor', armorBase: 22 },
  gloves_dex_t1: { id: 'gloves_dex_t1', name: 'Rawhide Gloves', slot: 'gloves', gridW: 2, gridH: 2, reqLevel: 1, reqAttrs: { dexterity: 14 }, icon: 'gloves', color: '#8a6a4a', archetype: 'evasion', evasionBase: 26 },
  gloves_int_t1: { id: 'gloves_int_t1', name: 'Silk Gloves', slot: 'gloves', gridW: 2, gridH: 2, reqLevel: 1, reqAttrs: { intelligence: 14 }, icon: 'gloves', color: '#6a5a9a', archetype: 'es', esBase: 12 },
  boots_str_t1: { id: 'boots_str_t1', name: 'Iron Greaves', slot: 'boots', gridW: 2, gridH: 2, reqLevel: 1, reqAttrs: { strength: 14 }, icon: 'boots', color: '#8a8a8a', archetype: 'armor', armorBase: 26 },
  boots_dex_t1: { id: 'boots_dex_t1', name: 'Rawhide Boots', slot: 'boots', gridW: 2, gridH: 2, reqLevel: 1, reqAttrs: { dexterity: 14 }, icon: 'boots', color: '#8a6a4a', archetype: 'evasion', evasionBase: 30 },
  boots_int_t1: { id: 'boots_int_t1', name: 'Silk Slippers', slot: 'boots', gridW: 2, gridH: 2, reqLevel: 1, reqAttrs: { intelligence: 14 }, icon: 'boots', color: '#6a5a9a', archetype: 'es', esBase: 14 },

  // ---- Jewellery ----
  belt_t1: { id: 'belt_t1', name: 'Leather Belt', slot: 'belt', gridW: 2, gridH: 1, reqLevel: 1, reqAttrs: {}, icon: 'belt', color: '#6a4a2a' },
  amulet_t1: { id: 'amulet_t1', name: 'Bronze Amulet', slot: 'amulet', gridW: 1, gridH: 1, reqLevel: 1, reqAttrs: {}, icon: 'amulet', color: '#c0a050' },
  ring_t1: { id: 'ring_t1', name: 'Iron Ring', slot: 'ring', gridW: 1, gridH: 1, reqLevel: 1, reqAttrs: {}, icon: 'ring', color: '#a0a0a0' },

  // ---- Flasks: exactly two kinds exist, one per fixed flask slot (Life on 1, Mana on 2) ----
  flask_life_t1: { id: 'flask_life_t1', name: 'Small Life Flask', slot: 'flask', gridW: 1, gridH: 2, reqLevel: 1, reqAttrs: {}, icon: 'flask', color: '#c04040', flaskKind: 'life', flaskLife: 80, flaskDuration: 3 },
  flask_life_t2: { id: 'flask_life_t2', name: 'Medium Life Flask', slot: 'flask', gridW: 1, gridH: 2, reqLevel: 12, reqAttrs: {}, icon: 'flask', color: '#d05050', flaskKind: 'life', flaskLife: 180, flaskDuration: 4 },
  flask_life_t3: { id: 'flask_life_t3', name: 'Large Life Flask', slot: 'flask', gridW: 1, gridH: 2, reqLevel: 28, reqAttrs: {}, icon: 'flask', color: '#e06060', flaskKind: 'life', flaskLife: 380, flaskDuration: 5 },
  flask_mana_t1: { id: 'flask_mana_t1', name: 'Small Mana Flask', slot: 'flask', gridW: 1, gridH: 2, reqLevel: 1, reqAttrs: {}, icon: 'flask', color: '#4040c0', flaskKind: 'mana', flaskMana: 60, flaskDuration: 3 },
  flask_mana_t2: { id: 'flask_mana_t2', name: 'Medium Mana Flask', slot: 'flask', gridW: 1, gridH: 2, reqLevel: 12, reqAttrs: {}, icon: 'flask', color: '#5050d0', flaskKind: 'mana', flaskMana: 130, flaskDuration: 4 },
  flask_mana_t3: { id: 'flask_mana_t3', name: 'Large Mana Flask', slot: 'flask', gridW: 1, gridH: 2, reqLevel: 28, reqAttrs: {}, icon: 'flask', color: '#6060e0', flaskKind: 'mana', flaskMana: 260, flaskDuration: 5 },

  // ---- Gems: found uncut, then cut into a chosen skill/support when socketed ----
  uncut_skill_gem: { id: 'uncut_skill_gem', name: 'Uncut Skill Gem', slot: 'gem', gridW: 1, gridH: 1, reqLevel: 1, reqAttrs: {}, icon: 'gem', color: '#7ae0a8', gemKind: 'skill' },
  uncut_support_gem: { id: 'uncut_support_gem', name: 'Uncut Support Gem', slot: 'gem', gridW: 1, gridH: 1, reqLevel: 1, reqAttrs: {}, icon: 'gem', color: '#e07ab0', gemKind: 'support' },
};

export const ITEM_BASE_LIST: ItemBaseDef[] = Object.values(ITEM_BASES);

export interface UniqueDef {
  id: string;
  baseId: string;
  name: string;
  flavorText: string;
  stats: Record<string, number>;
  levelReq: number;
}

export const UNIQUES: Record<string, UniqueDef> = {
  unique_maul: {
    id: 'unique_maul',
    baseId: 'two_hand_mace_t2',
    name: "Kaom's Fist",
    flavorText: 'The mountain does not forgive.',
    stats: { physDamageInc: 60, life: 80, stunThresholdInc: 40, attackSpeedInc: -10 },
    levelReq: 14,
  },
  unique_bow: {
    id: 'unique_bow',
    baseId: 'shortbow_t2',
    name: "Windrunner's Call",
    flavorText: 'Faster than the eye can follow.',
    stats: { projectileDamageInc: 45, attackSpeedInc: 20, movementSpeedInc: 10, accuracy: 60 },
    levelReq: 14,
  },
  unique_wand: {
    id: 'unique_wand',
    baseId: 'wand_t2',
    name: 'The Void Ember',
    flavorText: 'It hums with a hunger older than the world.',
    stats: { spellDamageInc: 50, chaosDamageInc: 30, mana: 40, castSpeedInc: 12 },
    levelReq: 14,
  },
  unique_body: {
    id: 'unique_body',
    baseId: 'body_hybrid_t1',
    name: 'Cinderplate',
    flavorText: 'Forged in the fires of a dying star.',
    stats: { armorInc: 40, evasionInc: 40, fireRes: 25, life: 60 },
    levelReq: 10,
  },
  unique_amulet: {
    id: 'unique_amulet',
    baseId: 'amulet_t1',
    name: 'The Exile’s Oath',
    flavorText: 'Every step forward is a step away from home.',
    stats: { allAttributes: 20, damageInc: 15, movementSpeedInc: 5 },
    levelReq: 8,
  },
  unique_ring: {
    id: 'unique_ring',
    baseId: 'ring_t1',
    name: 'Coilheart Band',
    flavorText: 'It beats in time with your own pulse.',
    stats: { lifeRegenPercent: 15, chaosRes: 30, leechPercent: 2 },
    levelReq: 6,
  },
};
