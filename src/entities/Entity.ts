import type { Vec2 } from '../engine/Vec2.ts';
import type { Team } from '../core/types.ts';

let nextId = 1;

export type { Team };

export abstract class Entity {
  readonly id: number;
  pos: Vec2;
  radius = 0.4;
  facing = 0;
  dead = false;
  team: Team = 'enemy';

  constructor(pos: Vec2) {
    this.id = nextId++;
    this.pos = pos;
  }
}
