import { Entity } from './Entity.ts';
import type { Vec2 } from '../engine/Vec2.ts';
import type { ClassId } from '../data/classes.ts';
import { CLASSES } from '../data/classes.ts';
import { Inventory, emptyEquipment } from '../systems/Inventory.ts';
import type { Equipment } from '../systems/Inventory.ts';
import type { DerivedStats } from '../core/stats.ts';
import { computeDerived } from '../core/stats.ts';
import { mergeStats } from '../core/types.ts';
import type { StatMap } from '../core/types.ts';
import type { StatusEffect } from '../systems/StatusEffects.ts';

export interface SkillSlot {
  skillId: string | null;
  supportIds: (string | null)[];
}

export interface ActiveBuff {
  id: string;
  stats: StatMap;
  expiresAt: number; // game time seconds
  label: string;
}

export interface Currencies {
  transmutation: number;
  augmentation: number;
  alteration: number;
  regal: number;
  chaos: number;
  alchemy: number;
  exalted: number;
}

export function emptyCurrencies(): Currencies {
  return { transmutation: 0, augmentation: 0, alteration: 0, regal: 0, chaos: 0, alchemy: 0, exalted: 0 };
}

const XP_TABLE: number[] = (() => {
  const arr = [0];
  for (let lvl = 1; lvl <= 100; lvl++) {
    arr.push(Math.round(arr[lvl - 1] + 60 * Math.pow(lvl, 1.85)));
  }
  return arr;
})();

export function xpForLevel(level: number): number {
  return XP_TABLE[Math.min(level, XP_TABLE.length - 1)];
}

export class Player extends Entity {
  saveId: string;
  name: string;
  createdAt: number;
  classId: ClassId;
  level = 1;
  xp = 0;
  passivePoints = 0;
  ascendancyPoints = 0;
  allocatedNodes: Set<string>;
  ascendancyId: string | null = null;
  allocatedAscNodes = new Set<string>();

  equipment: Equipment = emptyEquipment();
  inventory = new Inventory();
  stash = new Inventory(12, 10);
  gold = 0;
  currencies: Currencies = emptyCurrencies();

  /** 7 slots matching the keybinds: LMB, MMB, RMB, Q, E, R, T. */
  skillSlots: SkillSlot[] = Array.from({ length: 7 }, () => ({ skillId: null, supportIds: [null, null] }));

  life = 1;
  maxLife = 1;
  mana = 1;
  maxMana = 1;
  energyShield = 0;
  maxEnergyShield = 0;
  spiritUsed = 0;

  buffs: ActiveBuff[] = [];
  cooldowns = new Map<string, number>();
  derived: DerivedStats;
  statusEffects: StatusEffect[] = [];
  flaskHeals: { type: 'life' | 'mana'; remaining: number; perSecond: number }[] = [];
  flaskCooldowns = new Map<string, number>();

  moveTarget: Vec2 | null = null;
  velocity: Vec2 = { x: 0, y: 0 };
  dodgeCooldown = 0;
  dodgeTimer = 0;
  dodgeDir: Vec2 = { x: 0, y: 0 };
  isDodging = false;
  attackCooldown = 0;
  lastMoveDir: Vec2 = { x: 1, y: 0 };

  currentZoneId = 'hub_town';
  wayointsUnlocked = new Set<string>(['hub_town']);
  killCount = 0;
  deaths = 0;

  constructor(classId: ClassId, pos: Vec2, name = 'Exile', saveId?: string) {
    super(pos);
    this.saveId = saveId ?? `char_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6).toString(36)}`;
    this.name = name;
    this.createdAt = Date.now();
    this.classId = classId;
    this.team = 'player';
    this.radius = 0.4;
    this.allocatedNodes = new Set<string>([`start_${classId}`]);
    const def = CLASSES[classId];
    this.skillSlots[0].skillId = def.startSkillId;
    this.derived = computeDerived(this.level, def.baseAttrs, def.baseResources, {});
    this.maxLife = this.derived.maxLife;
    this.life = this.maxLife;
    this.maxMana = this.derived.maxMana;
    this.mana = this.maxMana;
    this.maxEnergyShield = this.derived.maxEnergyShield;
    this.energyShield = this.maxEnergyShield;
  }

  get classDef() {
    return CLASSES[this.classId];
  }

  gainXp(amount: number): number {
    this.xp += amount;
    let levels = 0;
    while (this.level < 100 && this.xp >= xpForLevel(this.level + 1)) {
      this.level += 1;
      this.passivePoints += 1;
      levels += 1;
    }
    return levels;
  }

  equipmentStats(): StatMap {
    const maps: StatMap[] = [];
    for (const key of Object.keys(this.equipment) as (keyof Equipment)[]) {
      const item = this.equipment[key];
      if (item) maps.push(item.stats);
    }
    return mergeStats(...maps);
  }

  buffStats(): StatMap {
    return mergeStats(...this.buffs.map((b) => b.stats));
  }
}
