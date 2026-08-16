import { Entity } from './Entity.ts';
import type { Vec2 } from '../engine/Vec2.ts';
import type { DamageType, Team } from '../core/types.ts';

export interface HitInstance {
  min: number;
  max: number;
  type: DamageType;
  critChance: number;
  critMultiplier: number;
  accuracy: number;
  sourceIsPlayer: boolean;
  ownerId: number;
  tags: string[];
  extraFlatByType?: Partial<Record<DamageType, number>>;
  leechPercent?: number;
}

export class Projectile extends Entity {
  velocity: Vec2;
  hit: HitInstance;
  pierceRemaining: number;
  chainRemaining: number;
  life = 4;
  hitEntities = new Set<number>();
  radius = 0.18;
  color = '#ffcc66';
  onExpire?: (p: Projectile) => void;

  constructor(pos: Vec2, velocity: Vec2, hit: HitInstance, team: Team, opts: { pierce?: number; chain?: number; color?: string } = {}) {
    super(pos);
    this.velocity = velocity;
    this.hit = hit;
    this.team = team;
    this.pierceRemaining = opts.pierce ?? 0;
    this.chainRemaining = opts.chain ?? 0;
    if (opts.color) this.color = opts.color;
  }
}
