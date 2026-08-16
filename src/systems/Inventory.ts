import type { ItemInstance } from '../core/item.ts';
import { ITEM_BASES } from '../data/items.ts';

export const INV_WIDTH = 12;
export const INV_HEIGHT = 5;

export interface Placement {
  x: number;
  y: number;
}

export class Inventory {
  items = new Map<string, ItemInstance>();
  placements = new Map<string, Placement>();
  private grid: (string | null)[][];
  width: number;
  height: number;

  constructor(width = INV_WIDTH, height = INV_HEIGHT) {
    this.width = width;
    this.height = height;
    this.grid = Array.from({ length: height }, () => new Array<string | null>(width).fill(null));
  }

  private dims(item: ItemInstance): { w: number; h: number } {
    const base = ITEM_BASES[item.baseId];
    return { w: base.gridW, h: base.gridH };
  }

  canPlace(item: ItemInstance, x: number, y: number, ignoreId?: string): boolean {
    const { w, h } = this.dims(item);
    if (x < 0 || y < 0 || x + w > this.width || y + h > this.height) return false;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const occ = this.grid[y + dy][x + dx];
        if (occ && occ !== ignoreId) return false;
      }
    }
    return true;
  }

  private paint(item: ItemInstance, x: number, y: number, id: string | null): void {
    const { w, h } = this.dims(item);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.grid[y + dy][x + dx] = id;
      }
    }
  }

  place(item: ItemInstance, x: number, y: number): boolean {
    if (!this.canPlace(item, x, y)) return false;
    this.items.set(item.instanceId, item);
    this.placements.set(item.instanceId, { x, y });
    this.paint(item, x, y, item.instanceId);
    return true;
  }

  findFreeSpot(item: ItemInstance): Placement | null {
    const { w, h } = this.dims(item);
    for (let y = 0; y <= this.height - h; y++) {
      for (let x = 0; x <= this.width - w; x++) {
        if (this.canPlace(item, x, y)) return { x, y };
      }
    }
    return null;
  }

  addItem(item: ItemInstance): boolean {
    const spot = this.findFreeSpot(item);
    if (!spot) return false;
    return this.place(item, spot.x, spot.y);
  }

  removeItem(instanceId: string): ItemInstance | null {
    const item = this.items.get(instanceId);
    if (!item) return null;
    const p = this.placements.get(instanceId);
    if (p) this.paint(item, p.x, p.y, null);
    this.items.delete(instanceId);
    this.placements.delete(instanceId);
    return item;
  }

  moveItem(instanceId: string, x: number, y: number): boolean {
    const item = this.items.get(instanceId);
    if (!item) return false;
    const old = this.placements.get(instanceId)!;
    this.paint(item, old.x, old.y, null);
    if (!this.canPlace(item, x, y, instanceId)) {
      this.paint(item, old.x, old.y, item.instanceId);
      return false;
    }
    this.paint(item, x, y, item.instanceId);
    this.placements.set(instanceId, { x, y });
    return true;
  }

  itemAt(x: number, y: number): ItemInstance | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const id = this.grid[y][x];
    return id ? (this.items.get(id) ?? null) : null;
  }

  hasSpaceFor(item: ItemInstance): boolean {
    return this.findFreeSpot(item) !== null;
  }

  toJSON(): { items: ItemInstance[]; placements: [string, Placement][] } {
    return {
      items: Array.from(this.items.values()),
      placements: Array.from(this.placements.entries()),
    };
  }

  static fromJSON(data: { items: ItemInstance[]; placements: [string, Placement][] }, width = INV_WIDTH, height = INV_HEIGHT): Inventory {
    const inv = new Inventory(width, height);
    const placeMap = new Map(data.placements);
    for (const item of data.items) {
      const p = placeMap.get(item.instanceId);
      if (p) inv.place(item, p.x, p.y);
    }
    return inv;
  }
}

export type EquipmentSlotKey =
  | 'weapon'
  | 'offhand'
  | 'helmet'
  | 'body'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'amulet'
  | 'ring1'
  | 'ring2'
  | 'flask1'
  | 'flask2'
  | 'flask3'
  | 'flask4';

export const EQUIPMENT_SLOT_KEYS: EquipmentSlotKey[] = [
  'weapon', 'offhand', 'helmet', 'body', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2',
  'flask1', 'flask2', 'flask3', 'flask4',
];

export type Equipment = Record<EquipmentSlotKey, ItemInstance | null>;

export function emptyEquipment(): Equipment {
  const eq = {} as Equipment;
  for (const k of EQUIPMENT_SLOT_KEYS) eq[k] = null;
  return eq;
}
