import { Rng } from '../engine/Random.ts';
import type { MonsterDef } from '../data/monsters.ts';
import { ITEM_BASE_LIST } from '../data/items.ts';
import { UNIQUES } from '../data/items.ts';
import { generateItem, rollRarity } from './ItemGen.ts';
import type { ItemInstance } from '../core/item.ts';
import type { Currencies } from '../entities/Player.ts';

export interface LootRoll {
  gold: number;
  items: ItemInstance[];
  currency: Partial<Record<keyof Currencies, number>>;
}

function pickBaseForLevel(rng: Rng, zoneLevel: number): string {
  const eligible = ITEM_BASE_LIST.filter((b) => b.reqLevel <= zoneLevel + 3 && b.reqLevel >= Math.max(1, zoneLevel - 12));
  const pool = eligible.length > 0 ? eligible : ITEM_BASE_LIST;
  return rng.pick(pool).id;
}

const CURRENCY_KEYS: (keyof Currencies)[] = ['transmutation', 'augmentation', 'alteration', 'regal', 'chaos', 'alchemy', 'exalted'];
const CURRENCY_WEIGHTS: Record<keyof Currencies, number> = {
  transmutation: 40,
  alteration: 30,
  augmentation: 22,
  regal: 10,
  alchemy: 6,
  chaos: 4,
  exalted: 1,
};

export function rollMonsterLoot(def: MonsterDef, zoneLevel: number, rng: Rng): LootRoll {
  const gold = Math.round(rng.range(1, 4) * def.lootTier * (1 + zoneLevel * 0.15));
  const items: ItemInstance[] = [];
  const currency: Partial<Record<keyof Currencies, number>> = {};

  const itemDropChance = def.isBoss ? 1 : 0.16 + def.lootTier * 0.02;
  const itemRolls = def.isBoss ? 5 + Math.floor(rng.range(0, 3)) : rng.chance(itemDropChance) ? 1 : 0;

  for (let i = 0; i < itemRolls; i++) {
    const rarity = def.isBoss && i === 0 ? (rng.chance(0.35) ? 'unique' : 'rare') : rollRarity(rng, def.isBoss ? 60 : 0);
    if (rarity === 'unique') {
      const uniqueIds = Object.keys(UNIQUES).filter((id) => UNIQUES[id].levelReq <= zoneLevel + 6);
      if (uniqueIds.length > 0) {
        const uid = rng.pick(uniqueIds);
        items.push(generateItem(UNIQUES[uid].baseId, zoneLevel, 'unique', rng, uid));
        continue;
      }
    }
    const baseId = pickBaseForLevel(rng, zoneLevel);
    items.push(generateItem(baseId, zoneLevel, rarity, rng));
  }

  const currencyChance = def.isBoss ? 1 : 0.1 + def.lootTier * 0.015;
  const currencyRolls = def.isBoss ? 3 : rng.chance(currencyChance) ? 1 : 0;
  for (let i = 0; i < currencyRolls; i++) {
    const key = rng.weighted(CURRENCY_KEYS.map((k) => [k, CURRENCY_WEIGHTS[k]] as const));
    currency[key] = (currency[key] ?? 0) + 1;
  }

  return { gold, items, currency };
}
