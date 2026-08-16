import { Entity } from './Entity.ts';
import type { Vec2 } from '../engine/Vec2.ts';
import type { ItemInstance } from '../core/item.ts';

export class ItemDrop extends Entity {
  item: ItemInstance | null; // null means this is a gold/currency pile
  gold = 0;
  currency: { kind: string; amount: number } | null = null;
  bobPhase: number;
  spawnTime: number;

  constructor(pos: Vec2, item: ItemInstance | null, time: number) {
    super(pos);
    this.item = item;
    this.radius = 0.35;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.spawnTime = time;
  }
}
