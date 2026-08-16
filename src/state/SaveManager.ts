import { Player, emptyCurrencies } from '../entities/Player.ts';
import type { Currencies, SkillSlot } from '../entities/Player.ts';
import { Inventory, emptyEquipment, EQUIPMENT_SLOT_KEYS } from '../systems/Inventory.ts';
import type { Equipment } from '../systems/Inventory.ts';
import type { ClassId } from '../data/classes.ts';
import { CLASSES } from '../data/classes.ts';
import { computeDerived } from '../core/stats.ts';

const STORAGE_KEY = 'cinderfall_characters_v2';
const MAX_CHARACTERS = 8;

interface SaveData {
  saveId: string;
  name: string;
  createdAt: number;
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

export interface CharacterSummary {
  saveId: string;
  name: string;
  classId: ClassId;
  level: number;
  createdAt: number;
}

function serializeItem(item: Equipment[keyof Equipment]) {
  return item ?? null;
}

function readStore(): Record<string, SaveData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SaveData>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, SaveData>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage unavailable (private browsing, quota) — silently skip persistence
  }
}

function toSaveData(player: Player): SaveData {
  const equipment: Record<string, ReturnType<typeof serializeItem>> = {};
  for (const key of EQUIPMENT_SLOT_KEYS) equipment[key] = serializeItem(player.equipment[key]);

  return {
    saveId: player.saveId,
    name: player.name,
    createdAt: player.createdAt,
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
}

function fromSaveData(data: SaveData): Player {
  const player = new Player(data.classId, { x: 0, y: 0 }, data.name, data.saveId);
  player.createdAt = data.createdAt;
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
}

export function saveCharacter(player: Player): void {
  const store = readStore();
  store[player.saveId] = toSaveData(player);
  writeStore(store);
}

export function listCharacters(): CharacterSummary[] {
  const store = readStore();
  return Object.values(store)
    .map((d) => ({ saveId: d.saveId, name: d.name, classId: d.classId, level: d.level, createdAt: d.createdAt }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function hasFreeCharacterSlot(): boolean {
  return listCharacters().length < MAX_CHARACTERS;
}

export function loadCharacter(saveId: string): Player | null {
  const store = readStore();
  const data = store[saveId];
  if (!data) return null;
  try {
    return fromSaveData(data);
  } catch {
    return null;
  }
}

export function deleteCharacter(saveId: string): void {
  const store = readStore();
  delete store[saveId];
  writeStore(store);
}
