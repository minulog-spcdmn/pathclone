import { Player, emptyCurrencies } from '../entities/Player.ts';
import type { Currencies, SkillSlot } from '../entities/Player.ts';
import { Inventory, emptyEquipment, EQUIPMENT_SLOT_KEYS } from '../systems/Inventory.ts';
import type { Equipment } from '../systems/Inventory.ts';
import type { ClassId } from '../data/classes.ts';
import { CLASSES } from '../data/classes.ts';
import { computeDerived } from '../core/stats.ts';

const SAVE_KEY = 'cinderfall_save_v1';

interface SaveData {
  classId: ClassId;
  level: number;
  xp: number;
  passivePoints: number;
  ascendancyPoints: number;
  allocatedNodes: string[];
  ascendancyId: string | null;
  allocatedAscNodes: string[];
  equipment: Record<string, ReturnType<typeof serializeItem>>;
  inventory: ReturnType<Inventory['toJSON']>;
  stash: ReturnType<Inventory['toJSON']>;
  gold: number;
  currencies: Currencies;
  skillSlots: SkillSlot[];
  life: number;
  mana: number;
  energyShield: number;
  currentZoneId: string;
  waypoints: string[];
  killCount: number;
  deaths: number;
}

function serializeItem(item: Equipment[keyof Equipment]) {
  return item ?? null;
}

export function saveGame(player: Player): void {
  const equipment: Record<string, ReturnType<typeof serializeItem>> = {};
  for (const key of EQUIPMENT_SLOT_KEYS) equipment[key] = serializeItem(player.equipment[key]);

  const data: SaveData = {
    classId: player.classId,
    level: player.level,
    xp: player.xp,
    passivePoints: player.passivePoints,
    ascendancyPoints: player.ascendancyPoints,
    allocatedNodes: Array.from(player.allocatedNodes),
    ascendancyId: player.ascendancyId,
    allocatedAscNodes: Array.from(player.allocatedAscNodes),
    equipment,
    inventory: player.inventory.toJSON(),
    stash: player.stash.toJSON(),
    gold: player.gold,
    currencies: player.currencies,
    skillSlots: player.skillSlots,
    life: player.life,
    mana: player.mana,
    energyShield: player.energyShield,
    currentZoneId: player.currentZoneId,
    waypoints: Array.from(player.wayointsUnlocked),
    killCount: player.killCount,
    deaths: player.deaths,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable (private browsing, quota) — silently skip persistence
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

export function loadGame(): Player | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SaveData;
    const player = new Player(data.classId, { x: 0, y: 0 });
    player.level = data.level;
    player.xp = data.xp;
    player.passivePoints = data.passivePoints;
    player.ascendancyPoints = data.ascendancyPoints;
    player.allocatedNodes = new Set(data.allocatedNodes);
    player.ascendancyId = data.ascendancyId;
    player.allocatedAscNodes = new Set(data.allocatedAscNodes);

    const equipment: Equipment = emptyEquipment();
    for (const key of EQUIPMENT_SLOT_KEYS) {
      const item = data.equipment[key];
      if (item) equipment[key] = item;
    }
    player.equipment = equipment;
    player.inventory = Inventory.fromJSON(data.inventory);
    player.stash = Inventory.fromJSON(data.stash, 12, 10);
    player.gold = data.gold;
    player.currencies = { ...emptyCurrencies(), ...data.currencies };
    player.skillSlots = data.skillSlots;
    player.currentZoneId = data.currentZoneId;
    player.wayointsUnlocked = new Set(data.waypoints);
    player.killCount = data.killCount;
    player.deaths = data.deaths;

    const classDef = CLASSES[data.classId];
    player.derived = computeDerived(player.level, classDef.baseAttrs, classDef.baseResources, player.equipmentStats());
    player.life = Math.min(data.life, player.derived.maxLife);
    player.mana = Math.min(data.mana, player.derived.maxMana);
    player.energyShield = Math.min(data.energyShield, player.derived.maxEnergyShield);

    return player;
  } catch {
    return null;
  }
}
