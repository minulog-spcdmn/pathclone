import type { StatMap } from './types.ts';
import type { ItemBaseDef } from '../data/items.ts';

export type Rarity = 'normal' | 'magic' | 'rare' | 'unique';

export const RARITY_COLOR: Record<Rarity, string> = {
  normal: '#c8c8c8',
  magic: '#8888ff',
  rare: '#e6e600',
  unique: '#d9822b',
};

export interface RolledAffix {
  affixId: string;
  group: string;
  name: string;
  placement: 'prefix' | 'suffix';
  statKey: string;
  value: number;
  text: string;
}

export interface ItemInstance {
  instanceId: string;
  baseId: string;
  name: string;
  rarity: Rarity;
  itemLevel: number;
  affixes: RolledAffix[];
  uniqueId?: string;
  flavorText?: string;
  identified: boolean;
  /** cached merged stat contribution of this item (base defenses/damage + affixes) */
  stats: StatMap;
}

export function slotToAffixTags(base: ItemBaseDef): ('weapon' | 'armor' | 'jewellery' | 'boots' | 'shield' | 'quiver' | 'gloves' | 'helmet')[] {
  switch (base.slot) {
    case 'weapon':
      return ['weapon'];
    case 'offhand':
      return base.icon === 'shield' ? ['shield', 'armor'] : ['jewellery'];
    case 'helmet':
      return ['armor', 'helmet'];
    case 'body':
      return ['armor'];
    case 'gloves':
      return ['armor', 'gloves'];
    case 'boots':
      return ['armor', 'boots'];
    case 'belt':
    case 'amulet':
    case 'ring':
      return ['jewellery'];
    default:
      return ['jewellery'];
  }
}

export function baseGridCells(base: ItemBaseDef): number {
  return base.gridW * base.gridH;
}
