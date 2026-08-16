export type AffixPlacement = 'prefix' | 'suffix';
export type AffixTag = 'weapon' | 'armor' | 'jewellery' | 'boots' | 'shield' | 'quiver' | 'gloves' | 'helmet';

export interface AffixDef {
  id: string;
  name: string;
  group: string; // only one affix per group can roll on an item
  placement: AffixPlacement;
  tags: AffixTag[];
  minLevel: number;
  weight: number;
  statKey: string;
  min: number;
  max: number;
  format: (v: number) => string;
}

function pct(label: string) {
  return (v: number) => `${v}% ${label}`;
}
function flat(label: string) {
  return (v: number) => `+${v} ${label}`;
}

export const AFFIXES: AffixDef[] = [
  // ---- Prefixes: weapon damage ----
  { id: 'pfx_phys', name: 'Heavy', group: 'phys_damage', placement: 'prefix', tags: ['weapon'], minLevel: 1, weight: 100, statKey: 'physDamageInc', min: 10, max: 35, format: pct('increased Physical Damage') },
  { id: 'pfx_phys_t2', name: 'Brutal', group: 'phys_damage', placement: 'prefix', tags: ['weapon'], minLevel: 20, weight: 60, statKey: 'physDamageInc', min: 36, max: 65, format: pct('increased Physical Damage') },
  { id: 'pfx_fire', name: 'Heated', group: 'fire_damage', placement: 'prefix', tags: ['weapon'], minLevel: 1, weight: 80, statKey: 'fireDamageInc', min: 10, max: 30, format: pct('increased Fire Damage') },
  { id: 'pfx_cold', name: 'Chilling', group: 'cold_damage', placement: 'prefix', tags: ['weapon'], minLevel: 1, weight: 80, statKey: 'coldDamageInc', min: 10, max: 30, format: pct('increased Cold Damage') },
  { id: 'pfx_light', name: 'Shocking', group: 'light_damage', placement: 'prefix', tags: ['weapon'], minLevel: 1, weight: 80, statKey: 'lightningDamageInc', min: 10, max: 30, format: pct('increased Lightning Damage') },
  { id: 'pfx_spell', name: 'Arcane', group: 'spell_damage', placement: 'prefix', tags: ['weapon'], minLevel: 1, weight: 90, statKey: 'spellDamageInc', min: 12, max: 34, format: pct('increased Spell Damage') },
  { id: 'pfx_attackspeed', name: 'Quick', group: 'attack_speed', placement: 'prefix', tags: ['weapon'], minLevel: 1, weight: 70, statKey: 'attackSpeedInc', min: 6, max: 16, format: pct('increased Attack Speed') },

  // ---- Prefixes: armor / life ----
  { id: 'pfx_life', name: 'Vigorous', group: 'life', placement: 'prefix', tags: ['armor', 'jewellery'], minLevel: 1, weight: 120, statKey: 'life', min: 15, max: 45, format: flat('to maximum Life') },
  { id: 'pfx_life_t2', name: 'Vital', group: 'life', placement: 'prefix', tags: ['armor', 'jewellery'], minLevel: 22, weight: 60, statKey: 'life', min: 46, max: 90, format: flat('to maximum Life') },
  { id: 'pfx_armor', name: 'Reinforced', group: 'defense', placement: 'prefix', tags: ['armor'], minLevel: 1, weight: 90, statKey: 'armorInc', min: 15, max: 40, format: pct('increased Armour') },
  { id: 'pfx_evasion', name: 'Nimble', group: 'defense', placement: 'prefix', tags: ['armor'], minLevel: 1, weight: 90, statKey: 'evasionInc', min: 15, max: 40, format: pct('increased Evasion Rating') },
  { id: 'pfx_es', name: 'Warded', group: 'defense', placement: 'prefix', tags: ['armor'], minLevel: 1, weight: 90, statKey: 'energyShieldInc', min: 15, max: 40, format: pct('increased Energy Shield') },
  { id: 'pfx_mana', name: 'Mindful', group: 'mana', placement: 'prefix', tags: ['armor', 'jewellery'], minLevel: 1, weight: 70, statKey: 'mana', min: 15, max: 40, format: flat('to maximum Mana') },

  // ---- Suffixes: resistances ----
  { id: 'sfx_fireres', name: 'of the Ember', group: 'fire_res', placement: 'suffix', tags: ['armor', 'jewellery', 'shield'], minLevel: 1, weight: 100, statKey: 'fireRes', min: 8, max: 24, format: pct('to Fire Resistance') },
  { id: 'sfx_coldres', name: 'of the Glacier', group: 'cold_res', placement: 'suffix', tags: ['armor', 'jewellery', 'shield'], minLevel: 1, weight: 100, statKey: 'coldRes', min: 8, max: 24, format: pct('to Cold Resistance') },
  { id: 'sfx_lightres', name: 'of the Storm', group: 'light_res', placement: 'suffix', tags: ['armor', 'jewellery', 'shield'], minLevel: 1, weight: 100, statKey: 'lightningRes', min: 8, max: 24, format: pct('to Lightning Resistance') },
  { id: 'sfx_chaosres', name: 'of the Void', group: 'chaos_res', placement: 'suffix', tags: ['armor', 'jewellery'], minLevel: 12, weight: 60, statKey: 'chaosRes', min: 6, max: 18, format: pct('to Chaos Resistance') },

  // ---- Suffixes: attributes / utility ----
  { id: 'sfx_str', name: 'of the Bear', group: 'attr_str', placement: 'suffix', tags: ['armor', 'jewellery', 'weapon'], minLevel: 1, weight: 70, statKey: 'strength', min: 6, max: 18, format: flat('to Strength') },
  { id: 'sfx_dex', name: 'of the Fox', group: 'attr_dex', placement: 'suffix', tags: ['armor', 'jewellery', 'weapon'], minLevel: 1, weight: 70, statKey: 'dexterity', min: 6, max: 18, format: flat('to Dexterity') },
  { id: 'sfx_int', name: 'of the Owl', group: 'attr_int', placement: 'suffix', tags: ['armor', 'jewellery', 'weapon'], minLevel: 1, weight: 70, statKey: 'intelligence', min: 6, max: 18, format: flat('to Intelligence') },
  { id: 'sfx_accuracy', name: 'of Precision', group: 'accuracy', placement: 'suffix', tags: ['weapon', 'jewellery'], minLevel: 1, weight: 70, statKey: 'accuracy', min: 20, max: 60, format: flat('to Accuracy Rating') },
  { id: 'sfx_critmult', name: 'of Slaughter', group: 'crit_mult', placement: 'suffix', tags: ['weapon'], minLevel: 10, weight: 50, statKey: 'critMultiplier', min: 10, max: 30, format: pct('to Critical Strike Multiplier') },
  { id: 'sfx_critchance', name: 'of the Assassin', group: 'crit_chance', placement: 'suffix', tags: ['weapon'], minLevel: 10, weight: 50, statKey: 'critChanceInc', min: 15, max: 35, format: pct('to Critical Strike Chance') },
  { id: 'sfx_moveseed', name: 'of the Wind', group: 'move_speed', placement: 'suffix', tags: ['boots'], minLevel: 1, weight: 100, statKey: 'movementSpeedInc', min: 8, max: 25, format: pct('increased Movement Speed') },
  { id: 'sfx_block', name: 'of Warding', group: 'block', placement: 'suffix', tags: ['shield'], minLevel: 1, weight: 80, statKey: 'blockChance', min: 4, max: 12, format: pct('to Block Chance') },
  { id: 'sfx_manaregen', name: 'of Clarity', group: 'mana_regen', placement: 'suffix', tags: ['jewellery', 'armor'], minLevel: 1, weight: 60, statKey: 'manaRegenPercent', min: 10, max: 30, format: pct('increased Mana Regeneration Rate') },
  { id: 'sfx_liferegen', name: 'of Renewal', group: 'life_regen', placement: 'suffix', tags: ['jewellery', 'armor'], minLevel: 8, weight: 50, statKey: 'lifeRegenPercent', min: 4, max: 12, format: pct('of Life Regenerated per second') },
];

export function affixesForTags(tags: AffixTag[], placement: AffixPlacement, itemLevel: number): AffixDef[] {
  return AFFIXES.filter(
    (a) => a.placement === placement && a.minLevel <= itemLevel && a.tags.some((t) => tags.includes(t)),
  );
}
