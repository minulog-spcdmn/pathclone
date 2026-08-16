import type { SkillDef, SupportDef } from '../data/skills.ts';
import { SUPPORTS } from '../data/skills.ts';
import type { StatMap } from '../core/types.ts';
import { stat } from '../core/types.ts';
import type { DerivedStats } from '../core/stats.ts';
import type { Vec2 } from '../engine/Vec2.ts';
import { fromAngle, angleTo } from '../engine/Vec2.ts';
import type { HitInstance } from '../entities/Projectile.ts';
import type { Team } from '../core/types.ts';
import type { Rng } from '../engine/Random.ts';

export interface SkillContext {
  now: number;
  rng: Rng;
  spawnProjectile(pos: Vec2, velocity: Vec2, hit: HitInstance, team: Team, opts: { pierce?: number; chain?: number; color?: string }): void;
  spawnGroundEffect(pos: Vec2, radius: number, hit: HitInstance, delay: number, duration: number, tickInterval: number, color: string): void;
  spawnMinion(summonId: string, pos: Vec2, ownerId: number, statMult: { life: number; damage: number }): void;
  damageInRadius(center: Vec2, radius: number, hitTeam: Team, hit: HitInstance): void;
  isWalkable(pos: Vec2, radius: number): boolean;
}

export interface CastResult {
  manaCost: number;
  lifeCost: number;
  success: boolean;
}

/** Cheap pre-cast affordability check: only depends on which supports are slotted. */
export function getSkillManaCost(skill: SkillDef, supportIds: (string | null)[]): number {
  let manaMultiplier = 1;
  for (const id of supportIds) {
    if (!id) continue;
    const s = SUPPORTS[id];
    if (!s) continue;
    if (s.requiresTags.length > 0 && !s.requiresTags.some((t) => skill.tags.includes(t))) continue;
    manaMultiplier *= s.manaMultiplier;
  }
  return Math.round(skill.manaCost * manaMultiplier);
}

function projColor(type: string): string {
  switch (type) {
    case 'fire':
      return '#ff7a33';
    case 'cold':
      return '#66ccff';
    case 'lightning':
      return '#ffe866';
    case 'chaos':
      return '#c866ff';
    default:
      return '#e8e0c8';
  }
}

interface EffectiveSkill {
  minDamage: number;
  maxDamage: number;
  extraFlatByType: HitInstance['extraFlatByType'];
  manaMultiplier: number;
  moreMultiplier: number;
  radius: number;
  extraProjectiles: number;
  pierce: boolean;
  chain: number;
  leechPercent: number;
  noAilments: boolean;
  castTimeMultiplier: number;
}

function computeEffectiveSkill(skill: SkillDef, supportIds: (string | null)[], stats: StatMap, derived: DerivedStats): EffectiveSkill {
  const supports: SupportDef[] = supportIds
    .filter((id): id is string => !!id)
    .map((id) => SUPPORTS[id])
    .filter((s) => s && (s.requiresTags.length === 0 || s.requiresTags.some((t) => skill.tags.includes(t))));

  let manaMultiplier = 1;
  let moreMultiplier = 1;
  let radiusPercent = 0;
  let extraProjectiles = 0;
  let extraChains = 0;
  let forcePierce = skill.pierce ?? false;
  let leechPercent = 0;
  let noAilments = false;
  const addedPercentByType: Partial<Record<string, number>> = {};

  for (const s of supports) {
    manaMultiplier *= s.manaMultiplier;
    if (s.moreMultiplier) moreMultiplier *= 1 + s.moreMultiplier / 100;
    for (const [k, v] of Object.entries(s.statMods)) {
      if (k === 'radiusPercent') radiusPercent += v;
      else if (k === 'extraProjectiles') extraProjectiles += v;
      else if (k === 'extraChains') extraChains += v;
      else if (k === 'forcePierce') forcePierce = true;
      else if (k === 'leechPercent') leechPercent += v;
      else if (k === 'noAilments') noAilments = true;
      else if (k.startsWith('added') && k.endsWith('DamagePercent')) {
        addedPercentByType[k] = (addedPercentByType[k] ?? 0) + v;
      }
    }
  }

  let incPercent = stat(stats, 'damageInc');
  if (skill.tags.includes('melee')) incPercent += stat(stats, 'meleeDamageInc');
  if (skill.tags.includes('projectile')) incPercent += stat(stats, 'projectileDamageInc');
  if (skill.tags.includes('spell')) incPercent += stat(stats, 'spellDamageInc');
  if (skill.tags.includes('attack')) incPercent += stat(stats, 'physDamageInc') * (skill.damageType === 'physical' ? 1 : 0);
  incPercent += stat(stats, `${skill.damageType}DamageInc`);

  const dmgMultiplier = (1 + incPercent / 100) * moreMultiplier;
  const minDamage = Math.max(1, Math.round(skill.baseDamageMin * (skill.effectiveness / 100) * dmgMultiplier));
  const maxDamage = Math.max(minDamage, Math.round(skill.baseDamageMax * (skill.effectiveness / 100) * dmgMultiplier));

  const extraFlatByType: HitInstance['extraFlatByType'] = {};
  if (addedPercentByType.addedFireDamagePercent) {
    extraFlatByType.fire = ((minDamage + maxDamage) / 2) * (addedPercentByType.addedFireDamagePercent / 100);
  }
  if (addedPercentByType.addedColdDamagePercent) {
    extraFlatByType.cold = ((minDamage + maxDamage) / 2) * (addedPercentByType.addedColdDamagePercent / 100);
  }

  const castSpeedBonus = skill.tags.includes('spell') ? derived.castSpeed : skill.tags.includes('attack') ? derived.attackSpeed : 1;

  return {
    minDamage,
    maxDamage,
    extraFlatByType,
    manaMultiplier,
    moreMultiplier,
    radius: (skill.radius ?? 0) * (1 + radiusPercent / 100),
    extraProjectiles,
    pierce: forcePierce,
    chain: (skill.chain ?? 0) + extraChains,
    leechPercent,
    noAilments,
    castTimeMultiplier: 1 / Math.max(0.2, castSpeedBonus),
  };
}

export function castSkill(
  ctx: SkillContext,
  caster: { pos: Vec2; id: number; facing: number },
  aimPoint: Vec2,
  skill: SkillDef,
  supportIds: (string | null)[],
  stats: StatMap,
  derived: DerivedStats,
  team: Team,
): { effectiveManaCost: number; effectiveLifeCost: number; castTime: number } {
  const eff = computeEffectiveSkill(skill, supportIds, stats, derived);
  const dir = angleTo(caster.pos, aimPoint);
  const hitTeam: Team = team === 'player' ? 'enemy' : 'player';

  const baseHit: Omit<HitInstance, 'min' | 'max'> = {
    type: skill.damageType,
    critChance: derived.critChance,
    critMultiplier: derived.critMultiplier,
    accuracy: derived.accuracy,
    sourceIsPlayer: team === 'player',
    ownerId: caster.id,
    tags: skill.tags,
    extraFlatByType: eff.extraFlatByType,
    leechPercent: eff.leechPercent,
  };

  switch (skill.behavior) {
    case 'melee_hit': {
      const range = skill.range ?? 1.5;
      const center: Vec2 = { x: caster.pos.x + Math.cos(dir) * range * 0.6, y: caster.pos.y + Math.sin(dir) * range * 0.6 };
      ctx.damageInRadius(center, eff.radius || 1.5, hitTeam, { ...baseHit, min: eff.minDamage, max: eff.maxDamage });
      break;
    }
    case 'nova': {
      ctx.damageInRadius(caster.pos, eff.radius || 3, hitTeam, { ...baseHit, min: eff.minDamage, max: eff.maxDamage });
      break;
    }
    case 'ground_aoe': {
      const range = skill.range ?? 6;
      const dx = aimPoint.x - caster.pos.x;
      const dy = aimPoint.y - caster.pos.y;
      const dist = Math.min(range, Math.hypot(dx, dy));
      const target: Vec2 = { x: caster.pos.x + Math.cos(dir) * dist, y: caster.pos.y + Math.sin(dir) * dist };
      ctx.spawnGroundEffect(target, eff.radius || 2, { ...baseHit, min: eff.minDamage, max: eff.maxDamage }, 0.5, 0.3, 0.3, projColor(skill.damageType));
      break;
    }
    case 'projectile': {
      const count = (skill.projectileCount ?? 1) + eff.extraProjectiles;
      const spread = skill.spreadDeg ?? (count > 1 ? 20 : 0);
      const speed = skill.projectileSpeed ?? 12;
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : i / (count - 1) - 0.5;
        const angle = dir + (spread * Math.PI / 180) * t;
        const vel = fromAngle(angle, speed);
        ctx.spawnProjectile(
          { ...caster.pos },
          vel,
          { ...baseHit, min: eff.minDamage, max: eff.maxDamage },
          team,
          { pierce: eff.pierce ? 99 : 0, chain: eff.chain, color: projColor(skill.damageType) },
        );
      }
      break;
    }
    case 'summon': {
      const count = skill.summonCount ?? 1;
      for (let i = 0; i < count; i++) {
        const offsetAngle = ctx.rng.range(0, Math.PI * 2);
        const spawnPos: Vec2 = { x: caster.pos.x + Math.cos(offsetAngle) * 0.8, y: caster.pos.y + Math.sin(offsetAngle) * 0.8 };
        const life = 1 + stat(stats, 'minionLifeInc') / 100;
        const dmg = 1 + stat(stats, 'minionDamageInc') / 100;
        ctx.spawnMinion(skill.summonId ?? 'summon_skeleton', spawnPos, caster.id, { life, damage: dmg });
      }
      break;
    }
    case 'dash': {
      // handled by caller (needs to mutate caster position); we still damage along the path here.
      ctx.damageInRadius(caster.pos, eff.radius || 1, hitTeam, { ...baseHit, min: eff.minDamage, max: eff.maxDamage });
      break;
    }
    case 'self_buff':
      break;
  }

  const manaCost = Math.round(skill.manaCost * eff.manaMultiplier);
  return { effectiveManaCost: manaCost, effectiveLifeCost: 0, castTime: skill.castTime * eff.castTimeMultiplier };
}
