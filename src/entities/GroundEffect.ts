import { Entity } from './Entity.ts';
import type { Vec2 } from '../engine/Vec2.ts';
import type { HitInstance } from './Projectile.ts';

/** Persistent area hazard: meteor impact zone, rain of arrows, ground fire, etc. */
export class GroundEffect extends Entity {
  hit: HitInstance;
  radius: number;
  delay: number; // seconds before it starts dealing damage (telegraph)
  duration: number; // seconds it remains active after delay
  tickInterval: number;
  tickTimer = 0;
  elapsed = 0;
  hasTriggered = false;
  color: string;

  constructor(pos: Vec2, radius: number, hit: HitInstance, delay: number, duration: number, tickInterval: number, color = '#ff8844') {
    super(pos);
    this.radius = radius;
    this.hit = hit;
    this.delay = delay;
    this.duration = duration;
    this.tickInterval = tickInterval;
    this.color = color;
    this.team = hit.sourceIsPlayer ? 'player' : 'enemy';
  }
}
