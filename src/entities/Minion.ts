import { Entity } from './Entity.ts';
import type { Vec2 } from '../engine/Vec2.ts';
import type { StatusEffect } from '../systems/StatusEffects.ts';

export interface MinionDef {
  id: string;
  name: string;
  baseLife: number;
  baseDamageMin: number;
  baseDamageMax: number;
  attackRange: number;
  attackCooldown: number;
  moveSpeed: number;
  radius: number;
  color: string;
}

export const MINIONS: Record<string, MinionDef> = {
  summon_skeleton: {
    id: 'summon_skeleton',
    name: 'Skeleton Warrior',
    baseLife: 40,
    baseDamageMin: 4,
    baseDamageMax: 8,
    attackRange: 1.2,
    attackCooldown: 1.0,
    moveSpeed: 3.4,
    radius: 0.4,
    color: '#d8d8c0',
  },
};

export class Minion extends Entity {
  def: MinionDef;
  ownerId: number;
  life: number;
  maxLife: number;
  damageMin: number;
  damageMax: number;
  attackTimer = 0;
  target: Entity | null = null;
  expiresAt: number | null = null;
  statusEffects: StatusEffect[] = [];

  constructor(def: MinionDef, pos: Vec2, ownerId: number, statMult: { life: number; damage: number }) {
    super(pos);
    this.def = def;
    this.ownerId = ownerId;
    this.team = 'player';
    this.radius = def.radius;
    this.maxLife = Math.round(def.baseLife * statMult.life);
    this.life = this.maxLife;
    this.damageMin = Math.round(def.baseDamageMin * statMult.damage);
    this.damageMax = Math.round(def.baseDamageMax * statMult.damage);
  }
}
