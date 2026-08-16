export type DamageType = 'physical' | 'fire' | 'cold' | 'lightning' | 'chaos';
export const DAMAGE_TYPES: DamageType[] = ['physical', 'fire', 'cold', 'lightning', 'chaos'];

export type Attribute = 'strength' | 'dexterity' | 'intelligence';

export type Team = 'player' | 'enemy';

export type AilmentType = 'ignite' | 'chill' | 'freeze' | 'shock' | 'poison' | 'bleed';

/**
 * Flat additive stat bag. Keys ending in "Inc" are "increased/reduced" percentages
 * that sum together then apply as a single multiplier (PoE-style additive %% stacking).
 * Keys ending in "More" are "more/less" percentage multipliers that each apply
 * independently and multiplicatively (rarer, used by strong support gems / keystones).
 */
export type StatMap = Partial<Record<string, number>>;

export function mergeStats(...maps: (StatMap | undefined)[]): StatMap {
  const out: StatMap = {};
  for (const m of maps) {
    if (!m) continue;
    for (const k in m) {
      const v = m[k];
      if (v === undefined) continue;
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

export function stat(map: StatMap, key: string): number {
  return map[key] ?? 0;
}

/** Apply PoE-style layered scaling: (base + flatAdds) * (1 + sumIncreased/100) * product(moreMultipliers). */
export function scaled(base: number, flat: number, incPercent: number, moreEntries: number[] = []): number {
  let v = (base + flat) * (1 + incPercent / 100);
  for (const m of moreEntries) v *= 1 + m / 100;
  return v;
}

export interface DamageRoll {
  min: number;
  max: number;
  type: DamageType;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Percent life/mana/ES thresholds etc share this shape. */
export interface Resource {
  current: number;
  max: number;
}
