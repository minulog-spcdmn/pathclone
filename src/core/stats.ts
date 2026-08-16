import type { StatMap } from './types.ts';
import { stat } from './types.ts';

export interface DerivedStats {
  maxLife: number;
  maxMana: number;
  maxEnergyShield: number;
  maxSpirit: number;
  lifeRegen: number;
  manaRegen: number;
  armor: number;
  evasion: number;
  fireRes: number;
  coldRes: number;
  lightningRes: number;
  chaosRes: number;
  movementSpeed: number; // multiplier, 1 = 100%
  attackSpeed: number; // multiplier
  castSpeed: number; // multiplier
  critChance: number; // 0..1
  critMultiplier: number; // 1.5 = 150%
  accuracy: number;
  blockChance: number; // 0..1
  strength: number;
  dexterity: number;
  intelligence: number;
  chaosInoculation: boolean;
  ironReflexes: boolean; // converts evasion rating to armor
  resoluteTechnique: boolean; // always hit, never crit
}

const RES_CAP = 75;

export function computeDerived(
  level: number,
  baseAttrs: { strength: number; dexterity: number; intelligence: number },
  baseResources: { life: number; mana: number; es: number; spirit: number },
  mods: StatMap,
): DerivedStats {
  const strength = baseAttrs.strength + stat(mods, 'strength');
  const dexterity = baseAttrs.dexterity + stat(mods, 'dexterity');
  const intelligence = baseAttrs.intelligence + stat(mods, 'intelligence');

  const ironReflexes = stat(mods, 'keystoneIronReflexes') > 0;
  const resoluteTechnique = stat(mods, 'keystoneResoluteTechnique') > 0;
  const chaosInoculation = stat(mods, 'keystoneChaosInoculation') > 0;

  const lifeFromStr = strength * 0.5;
  const manaFromInt = intelligence * 0.5;
  const evasionFromDex = 1 + (dexterity / 5) * 0.2; // fractional "increased" from dex, applied below

  const flatLife = baseResources.life + stat(mods, 'life') + lifeFromStr + level * 8;
  const incLife = stat(mods, 'lifeInc');
  const maxLife = chaosInoculation ? 1 : Math.round(flatLife * (1 + incLife / 100));

  const flatMana = baseResources.mana + stat(mods, 'mana') + manaFromInt + level * 2;
  const incMana = stat(mods, 'manaInc');
  const maxMana = Math.round(flatMana * (1 + incMana / 100));

  const flatEs = baseResources.es + stat(mods, 'energyShield');
  const incEs = stat(mods, 'energyShieldInc') + intelligence * 0.1;
  const maxEnergyShield = chaosInoculation
    ? Math.round((flatEs + maxLife * 2) * (1 + incEs / 100))
    : Math.round(flatEs * (1 + incEs / 100));

  const maxSpirit = Math.round(baseResources.spirit + stat(mods, 'spirit'));

  let armor = Math.round((stat(mods, 'armor')) * (1 + (stat(mods, 'armorInc') + strength * 0.2) / 100));
  let evasion = Math.round(
    (stat(mods, 'evasion')) * (1 + (stat(mods, 'evasionInc') + (evasionFromDex - 1) * 100) / 100),
  );
  if (ironReflexes) {
    armor += evasion;
    evasion = 0;
  }

  const fireRes = Math.min(RES_CAP, stat(mods, 'fireRes'));
  const coldRes = Math.min(RES_CAP, stat(mods, 'coldRes'));
  const lightningRes = Math.min(RES_CAP, stat(mods, 'lightningRes'));
  const chaosRes = Math.min(RES_CAP, stat(mods, 'chaosRes'));

  const movementSpeed = 1 + stat(mods, 'movementSpeedInc') / 100;
  const attackSpeed = 1 + stat(mods, 'attackSpeedInc') / 100;
  const castSpeed = 1 + stat(mods, 'castSpeedInc') / 100;

  const critChance = resoluteTechnique
    ? 0
    : Math.min(1, Math.max(0, (5 + stat(mods, 'critChanceInc')) / 100));
  const critMultiplier = 1.5 + stat(mods, 'critMultiplier') / 100;

  const accuracy = Math.max(0, stat(mods, 'accuracy') + dexterity * 2 + level * 3);
  const blockChance = Math.min(0.75, Math.max(0, stat(mods, 'blockChance') / 100));

  return {
    maxLife,
    maxMana,
    maxEnergyShield,
    maxSpirit,
    lifeRegen: (stat(mods, 'lifeRegen') + maxLife * (stat(mods, 'lifeRegenPercent') / 100)) || 0,
    manaRegen: stat(mods, 'manaRegen') + maxMana * (0.5 + stat(mods, 'manaRegenPercent') / 100) * 0.01,
    armor,
    evasion,
    fireRes,
    coldRes,
    lightningRes,
    chaosRes,
    movementSpeed,
    attackSpeed,
    castSpeed,
    critChance,
    critMultiplier,
    accuracy,
    blockChance,
    strength,
    dexterity,
    intelligence,
    chaosInoculation,
    ironReflexes,
    resoluteTechnique,
  };
}

/** PoE-accurate armor mitigation curve: bigger hits punch through armor harder. */
export function armorMitigation(armor: number, incomingPhysDamage: number): number {
  if (armor <= 0) return 0;
  return armor / (armor + 10 * incomingPhysDamage);
}

/** Chance the attack lands, given attacker accuracy vs defender evasion. Clamped [5%,95%]. */
export function chanceToHit(accuracy: number, evasion: number): number {
  const raw = accuracy / (accuracy + Math.pow(evasion / 4, 0.8) * 5 || 1);
  return Math.min(0.95, Math.max(0.05, evasion <= 0 ? 1 : raw));
}
