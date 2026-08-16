import { Rng } from '../engine/Random.ts';
import { ITEM_BASES, UNIQUES } from '../data/items.ts';
import { affixesForTags } from '../data/affixes.ts';
import { slotToAffixTags } from '../core/item.ts';
import type { ItemInstance, Rarity, RolledAffix } from '../core/item.ts';
import type { StatMap } from '../core/types.ts';

let counter = 0;
function nextInstanceId(): string {
  counter += 1;
  return `item_${Date.now().toString(36)}_${counter}`;
}

function rollAffix(pool: ReturnType<typeof affixesForTags>, usedGroups: Set<string>, rng: Rng): RolledAffix | undefined {
  const available = pool.filter((a) => !usedGroups.has(a.group));
  if (available.length === 0) return undefined;
  const chosen = rng.weighted(available.map((a) => [a, a.weight] as const));
  usedGroups.add(chosen.group);
  const value = Math.round(rng.range(chosen.min, chosen.max) * 10) / 10;
  return {
    affixId: chosen.id,
    group: chosen.group,
    name: chosen.name,
    placement: chosen.placement,
    statKey: chosen.statKey,
    value,
    text: chosen.format(value),
  };
}

export function generateItem(baseId: string, itemLevel: number, rarity: Rarity, rng: Rng, forceUniqueId?: string): ItemInstance {
  const base = ITEM_BASES[baseId];
  if (!base) throw new Error(`Unknown item base ${baseId}`);
  const tags = slotToAffixTags(base);
  const affixes: RolledAffix[] = [];
  const usedGroups = new Set<string>();

  if (rarity === 'magic') {
    if (rng.chance(0.85)) {
      const a = rollAffix(affixesForTags(tags, 'prefix', itemLevel), usedGroups, rng);
      if (a) affixes.push(a);
    }
    if (affixes.length === 0 || rng.chance(0.85)) {
      const a = rollAffix(affixesForTags(tags, 'suffix', itemLevel), usedGroups, rng);
      if (a) affixes.push(a);
    }
  } else if (rarity === 'rare') {
    const prefixCount = 1 + rng.int(0, 3);
    const suffixCount = 1 + rng.int(0, 3);
    for (let i = 0; i < prefixCount; i++) {
      const a = rollAffix(affixesForTags(tags, 'prefix', itemLevel), usedGroups, rng);
      if (a) affixes.push(a);
    }
    for (let i = 0; i < suffixCount; i++) {
      const a = rollAffix(affixesForTags(tags, 'suffix', itemLevel), usedGroups, rng);
      if (a) affixes.push(a);
    }
  }

  const statMap: StatMap = {};
  applyBaseStats(statMap, base);
  for (const a of affixes) statMap[a.statKey] = (statMap[a.statKey] ?? 0) + a.value;

  let name = base.name;
  let flavorText: string | undefined;
  let uniqueId: string | undefined;

  if (rarity === 'unique') {
    const uniqueDef = forceUniqueId ? UNIQUES[forceUniqueId] : undefined;
    if (uniqueDef) {
      uniqueId = uniqueDef.id;
      name = uniqueDef.name;
      flavorText = uniqueDef.flavorText;
      for (const [k, v] of Object.entries(uniqueDef.stats)) {
        statMap[k] = (statMap[k] ?? 0) + v;
      }
    }
  } else if (rarity === 'rare') {
    name = generateRareName(rng);
  } else if (rarity === 'magic') {
    const prefix = affixes.find((a) => a.placement === 'prefix');
    const suffix = affixes.find((a) => a.placement === 'suffix');
    name = `${prefix ? prefix.name + ' ' : ''}${base.name}${suffix ? ' ' + suffix.name : ''}`;
  }

  return {
    instanceId: nextInstanceId(),
    baseId,
    name,
    rarity,
    itemLevel,
    affixes,
    uniqueId,
    flavorText,
    identified: rarity !== 'rare' && rarity !== 'unique',
    stats: statMap,
  };
}

function applyBaseStats(map: StatMap, base: ReturnType<typeof getBase>): void {
  if (base.armorBase) map.armor = (map.armor ?? 0) + base.armorBase;
  if (base.evasionBase) map.evasion = (map.evasion ?? 0) + base.evasionBase;
  if (base.esBase) map.energyShield = (map.energyShield ?? 0) + base.esBase;
}
function getBase(id: string) {
  return ITEM_BASES[id];
}

const RARE_PREFIXES = ['Doom', 'Grim', 'Storm', 'Shadow', 'Blood', 'Iron', 'Ember', 'Frost', 'Void', 'Sun'];
const RARE_SUFFIXES = ['fang', 'bane', 'wraith', 'reaver', 'crest', 'thorn', 'grasp', 'edge', 'heart', 'call'];
function generateRareName(rng: Rng): string {
  return `${rng.pick(RARE_PREFIXES)}${rng.pick(RARE_SUFFIXES)}`;
}

/** Weighted rarity roll typical of an ARPG loot table. */
export function rollRarity(rng: Rng, magicFindPercent = 0): Rarity {
  const mf = 1 + magicFindPercent / 100;
  const roll = rng.next();
  const rareChance = 0.03 * mf;
  const magicChance = 0.22 * mf;
  if (roll < rareChance) return 'rare';
  if (roll < rareChance + magicChance) return 'magic';
  return 'normal';
}

function rebuild(item: ItemInstance, base: ReturnType<typeof getBase>): void {
  const statMap: StatMap = {};
  applyBaseStats(statMap, base);
  for (const a of item.affixes) statMap[a.statKey] = (statMap[a.statKey] ?? 0) + a.value;
  if (item.uniqueId) {
    const uniqueDef = UNIQUES[item.uniqueId];
    if (uniqueDef) for (const [k, v] of Object.entries(uniqueDef.stats)) statMap[k] = (statMap[k] ?? 0) + v;
  }
  item.stats = statMap;
  if (item.rarity === 'magic') {
    const prefix = item.affixes.find((a) => a.placement === 'prefix');
    const suffix = item.affixes.find((a) => a.placement === 'suffix');
    item.name = `${prefix ? prefix.name + ' ' : ''}${base.name}${suffix ? ' ' + suffix.name : ''}`;
  }
}

export type CraftAction = 'transmutation' | 'augmentation' | 'alteration' | 'regal' | 'chaos' | 'alchemy' | 'exalted';

/** Returns whether `action` currency can legally be used on this item, mirroring PoE crafting currency rules. */
export function canApplyCraft(item: ItemInstance, action: CraftAction): boolean {
  if (item.rarity === 'unique') return false;
  switch (action) {
    case 'transmutation':
    case 'alchemy':
      return item.rarity === 'normal';
    case 'augmentation':
      return item.rarity === 'magic' && item.affixes.length < 2;
    case 'alteration':
      return item.rarity === 'magic';
    case 'regal':
      return item.rarity === 'magic';
    case 'chaos':
      return item.rarity === 'rare';
    case 'exalted':
      return item.rarity === 'rare' && item.affixes.length < 6;
  }
}

export function applyCraft(item: ItemInstance, action: CraftAction, rng: Rng): ItemInstance {
  const base = getBase(item.baseId);
  const tags = slotToAffixTags(base);
  const usedGroups = new Set(item.affixes.map((a) => a.group));

  switch (action) {
    case 'transmutation': {
      item.rarity = 'magic';
      item.affixes = [];
      const a = rollAffix(affixesForTags(tags, rng.chance(0.5) ? 'prefix' : 'suffix', item.itemLevel), new Set(), rng);
      if (a) item.affixes.push(a);
      break;
    }
    case 'alchemy': {
      item.rarity = 'rare';
      item.affixes = [];
      const pCount = 1 + rng.int(0, 3);
      const sCount = 1 + rng.int(0, 3);
      const used = new Set<string>();
      for (let i = 0; i < pCount; i++) {
        const a = rollAffix(affixesForTags(tags, 'prefix', item.itemLevel), used, rng);
        if (a) item.affixes.push(a);
      }
      for (let i = 0; i < sCount; i++) {
        const a = rollAffix(affixesForTags(tags, 'suffix', item.itemLevel), used, rng);
        if (a) item.affixes.push(a);
      }
      item.identified = false;
      break;
    }
    case 'augmentation': {
      const hasPrefix = item.affixes.some((a) => a.placement === 'prefix');
      const placement = hasPrefix ? 'suffix' : 'prefix';
      const a = rollAffix(affixesForTags(tags, placement, item.itemLevel), usedGroups, rng);
      if (a) item.affixes.push(a);
      break;
    }
    case 'alteration': {
      item.affixes = [];
      const pool: ('prefix' | 'suffix')[] = rng.chance(0.5) ? ['prefix', 'suffix'] : ['suffix', 'prefix'];
      const used = new Set<string>();
      for (const placement of pool) {
        if (item.affixes.length === 0 || rng.chance(0.85)) {
          const a = rollAffix(affixesForTags(tags, placement, item.itemLevel), used, rng);
          if (a) item.affixes.push(a);
        }
      }
      break;
    }
    case 'regal': {
      item.rarity = 'rare';
      const placement: 'prefix' | 'suffix' = rng.chance(0.5) ? 'prefix' : 'suffix';
      const a = rollAffix(affixesForTags(tags, placement, item.itemLevel), usedGroups, rng);
      if (a) item.affixes.push(a);
      item.name = generateRareName(rng);
      break;
    }
    case 'chaos': {
      item.affixes = [];
      const pCount = 1 + rng.int(0, 3);
      const sCount = 1 + rng.int(0, 3);
      const used = new Set<string>();
      for (let i = 0; i < pCount; i++) {
        const a = rollAffix(affixesForTags(tags, 'prefix', item.itemLevel), used, rng);
        if (a) item.affixes.push(a);
      }
      for (let i = 0; i < sCount; i++) {
        const a = rollAffix(affixesForTags(tags, 'suffix', item.itemLevel), used, rng);
        if (a) item.affixes.push(a);
      }
      item.name = generateRareName(rng);
      break;
    }
    case 'exalted': {
      const hasPrefix3 = item.affixes.filter((a) => a.placement === 'prefix').length >= 3;
      const placement: 'prefix' | 'suffix' = hasPrefix3 ? 'suffix' : rng.chance(0.5) ? 'prefix' : 'suffix';
      const a = rollAffix(affixesForTags(tags, placement, item.itemLevel), usedGroups, rng);
      if (a) item.affixes.push(a);
      break;
    }
  }
  rebuild(item, base);
  return item;
}

export function itemVendorValue(item: ItemInstance): number {
  const rarityMult: Record<Rarity, number> = { normal: 1, magic: 3, rare: 8, unique: 20 };
  return Math.round((4 + item.itemLevel * 0.6) * rarityMult[item.rarity]);
}
