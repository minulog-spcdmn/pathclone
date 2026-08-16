import type { Vec2 } from '../engine/Vec2.ts';
import type { ZoneDef } from '../data/zones.ts';

export interface ZoneExit {
  toZoneId: string;
  label: string;
  pos: Vec2;
  radius: number;
}

export class Zone {
  def: ZoneDef;
  walkable: Uint8Array;
  spawnPoint: Vec2;
  waypointPos: Vec2;
  exits: ZoneExit[] = [];
  decorations: { pos: Vec2; kind: string }[] = [];

  constructor(def: ZoneDef, walkable: Uint8Array, spawnPoint: Vec2, waypointPos: Vec2) {
    this.def = def;
    this.walkable = walkable;
    this.spawnPoint = spawnPoint;
    this.waypointPos = waypointPos;
  }

  isWalkableTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.def.width || ty >= this.def.height) return false;
    return this.walkable[ty * this.def.width + tx] === 1;
  }

  isWalkableWorld(x: number, y: number, radius = 0): boolean {
    const pts: Vec2[] = [
      { x, y },
      { x: x - radius, y },
      { x: x + radius, y },
      { x, y: y - radius },
      { x, y: y + radius },
    ];
    for (const p of pts) {
      if (!this.isWalkableTile(Math.floor(p.x), Math.floor(p.y))) return false;
    }
    return true;
  }
}
