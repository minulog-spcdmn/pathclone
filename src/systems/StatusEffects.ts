import type { AilmentType, DamageType } from '../core/types.ts';
import type { Rng } from '../engine/Random.ts';

export interface StatusEffect {
  type: AilmentType;
  expiresAt: number;
  magnitude: number; // damage-per-second for dots, or % effect for chill/shock
  tickAt?: number;
  sourceHitDamage?: number;
}

export interface StatusHolder {
  statusEffects: StatusEffect[];
}

const IGNITE_PCT_PER_SEC = 0.2; // 20% of the triggering hit's fire damage per second
const POISON_PCT_PER_SEC = 0.3;
const BLEED_PCT_PER_SEC = 0.35;
const IGNITE_DURATION = 4;
const POISON_DURATION = 5;
const BLEED_DURATION = 5;
const CHILL_DURATION = 2;
const SHOCK_DURATION = 2;
const FREEZE_MAX_DURATION = 1.4;

export function maybeApplyAilments(
  target: StatusHolder,
  damageType: DamageType,
  amount: number,
  targetMaxLife: number,
  now: number,
  rng: Rng,
  opts: { noAilments?: boolean; forcePoison?: boolean; forceBleed?: boolean } = {},
): void {
  if (opts.noAilments || amount <= 0) return;

  if (damageType === 'fire' && rng.chance(0.35)) {
    applyOrRefresh(target, 'ignite', now, IGNITE_DURATION, amount * IGNITE_PCT_PER_SEC);
  }
  if (damageType === 'cold') {
    applyOrRefresh(target, 'chill', now, CHILL_DURATION, 20);
    const freezeChance = Math.min(0.5, amount / Math.max(1, targetMaxLife) * 2);
    if (rng.chance(freezeChance)) {
      applyOrRefresh(target, 'freeze', now, Math.min(FREEZE_MAX_DURATION, 0.3 + amount / Math.max(1, targetMaxLife) * 2), 100);
    }
  }
  if (damageType === 'lightning' && rng.chance(0.3)) {
    applyOrRefresh(target, 'shock', now, SHOCK_DURATION, 15);
  }
  if (damageType === 'chaos' && (opts.forcePoison || rng.chance(0.25))) {
    applyOrRefresh(target, 'poison', now, POISON_DURATION, amount * POISON_PCT_PER_SEC, true);
  }
  if (damageType === 'physical' && opts.forceBleed) {
    applyOrRefresh(target, 'bleed', now, BLEED_DURATION, amount * BLEED_PCT_PER_SEC);
  }
}

function applyOrRefresh(target: StatusHolder, type: AilmentType, now: number, duration: number, magnitude: number, stackable = false): void {
  if (!stackable) {
    const existing = target.statusEffects.find((s) => s.type === type);
    if (existing) {
      if (magnitude >= existing.magnitude) {
        existing.magnitude = magnitude;
        existing.expiresAt = now + duration;
      }
      return;
    }
  }
  target.statusEffects.push({ type, expiresAt: now + duration, magnitude, tickAt: now + 1 });
}

/** Returns total DoT damage to apply this tick and mutates/cleans the effect list. */
export function tickStatusEffects(target: StatusHolder, now: number, dt: number): { dotDamage: number; frozen: boolean; chillPercent: number; shockPercent: number } {
  let dotDamage = 0;
  let frozen = false;
  let chillPercent = 0;
  let shockPercent = 0;
  target.statusEffects = target.statusEffects.filter((s) => s.expiresAt > now);
  for (const s of target.statusEffects) {
    if (s.type === 'ignite' || s.type === 'poison' || s.type === 'bleed') {
      if (s.tickAt === undefined || now >= s.tickAt) {
        dotDamage += s.magnitude * (s.tickAt === undefined ? dt : 1);
        s.tickAt = now + 1;
      }
    } else if (s.type === 'freeze') {
      frozen = true;
    } else if (s.type === 'chill') {
      chillPercent = Math.max(chillPercent, s.magnitude);
    } else if (s.type === 'shock') {
      shockPercent = Math.max(shockPercent, s.magnitude);
    }
  }
  return { dotDamage, frozen, chillPercent, shockPercent };
}
