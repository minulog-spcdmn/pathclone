import type { HitInstance } from '../entities/Projectile.ts';
import type { DamageType } from '../core/types.ts';
import { DAMAGE_TYPES } from '../core/types.ts';
import { armorMitigation, chanceToHit } from '../core/stats.ts';
import { Rng } from '../engine/Random.ts';

export interface DefenseProfile {
  armor: number;
  evasion: number;
  fireRes: number;
  coldRes: number;
  lightningRes: number;
  chaosRes: number;
  dodgeChance: number;
  chaosInoculation: boolean;
}

export interface HitResult {
  landed: boolean;
  evaded: boolean;
  dodged: boolean;
  crit: boolean;
  totalDamage: number;
  byType: Partial<Record<DamageType, number>>;
  toLife: number;
  toEs: number;
  leech: number;
}

const resKey: Record<DamageType, keyof DefenseProfile | null> = {
  physical: null,
  fire: 'fireRes',
  cold: 'coldRes',
  lightning: 'lightningRes',
  chaos: 'chaosRes',
};

export function resolveHit(
  hit: HitInstance,
  defense: DefenseProfile,
  currentEs: number,
  rng: Rng,
): HitResult {
  const result: HitResult = { landed: false, evaded: false, dodged: false, crit: false, totalDamage: 0, byType: {}, toLife: 0, toEs: 0, leech: 0 };

  const landChance = accuracyVsEvasion(hit, defense);
  if (!rng.chance(landChance)) {
    result.evaded = true;
    return result;
  }
  if (defense.dodgeChance > 0 && rng.chance(defense.dodgeChance / 100)) {
    result.dodged = true;
    return result;
  }
  result.landed = true;

  const crit = rng.chance(hit.critChance);
  result.crit = crit;
  const critMult = crit ? hit.critMultiplier : 1;

  let total = 0;
  for (const type of DAMAGE_TYPES) {
    let raw = 0;
    if (type === hit.type) {
      raw = rng.range(hit.min, hit.max);
    }
    const extra = hit.extraFlatByType?.[type];
    if (extra) raw += extra;
    if (raw <= 0) continue;
    raw *= critMult;

    if (type === 'physical') {
      const mitigation = armorMitigation(defense.armor, raw);
      raw *= 1 - mitigation;
    } else {
      const key = resKey[type];
      const resVal = key ? (defense[key] as number) : 0;
      raw *= 1 - Math.max(-2, Math.min(0.75, resVal / 100));
    }
    raw = Math.max(0, Math.round(raw));
    if (raw > 0) {
      result.byType[type] = (result.byType[type] ?? 0) + raw;
      total += raw;
    }
  }

  result.totalDamage = total;

  const chaosDamage = result.byType.chaos ?? 0;
  if (defense.chaosInoculation) {
    // Chaos Inoculation: all damage (including chaos) hits ES first.
    const esAbsorb = Math.min(currentEs, total);
    result.toEs = esAbsorb;
    result.toLife = total - esAbsorb;
  } else {
    const nonChaos = total - chaosDamage;
    const esAbsorb = Math.min(currentEs, nonChaos);
    result.toEs = esAbsorb;
    result.toLife = total - esAbsorb;
  }

  if (hit.leechPercent) {
    result.leech = total * (hit.leechPercent / 100);
  }

  return result;
}

function accuracyVsEvasion(hit: HitInstance, defense: DefenseProfile): number {
  // Spells always land; only "attack"-tagged skills can be evaded.
  if (!hit.tags.includes('attack')) return 1;
  return chanceToHit(hit.accuracy, defense.evasion);
}
