import { Entity } from './Entity.ts';
import type { Vec2 } from '../engine/Vec2.ts';
import type { MonsterDef } from '../data/monsters.ts';
import { scaledMonsterLife, scaledMonsterDamage } from '../data/monsters.ts';
import type { StatusEffect } from '../systems/StatusEffects.ts';

export type AiState = 'idle' | 'aggro' | 'attack_windup' | 'cooldown' | 'dead';

export class Monster extends Entity {
  def: MonsterDef;
  zoneLevel: number;
  life: number;
  maxLife: number;
  damageMin: number;
  damageMax: number;
  aiState: AiState = 'idle';
  attackTimer = 0;
  windupTimer = 0;
  target: Entity | null = null;
  homePos: Vec2;
  statusEffects: StatusEffect[] = [];
  isMinion = false;
  minionOwnerId?: number;

  constructor(def: MonsterDef, pos: Vec2, zoneLevel: number) {
    super(pos);
    this.def = def;
    this.zoneLevel = zoneLevel;
    this.team = 'enemy';
    this.radius = def.radius;
    this.maxLife = scaledMonsterLife(def, zoneLevel);
    this.life = this.maxLife;
    const [dmin, dmax] = scaledMonsterDamage(def, zoneLevel);
    this.damageMin = dmin;
    this.damageMax = dmax;
    this.homePos = { ...pos };
  }
}
