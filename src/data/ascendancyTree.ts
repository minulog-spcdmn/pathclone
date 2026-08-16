import type { StatMap } from '../core/types.ts';

export interface AscNode {
  id: string;
  name: string;
  desc: string;
  stats: StatMap;
}

/** Each ascendancy is a linear chain of 6 nodes; node i requires node i-1 allocated. */
export const ASCENDANCY_NODES: Record<string, AscNode[]> = {
  titan: [
    { id: 'asc_col_1', name: 'Unbreakable', desc: '+20% increased Armour, +10% increased maximum Life', stats: { armorInc: 20, lifeInc: 10 } },
    { id: 'asc_col_2', name: 'Seismic Force', desc: '30% increased Area of Effect for Slam Skills', stats: { areaOfEffectInc: 30 } },
    { id: 'asc_col_3', name: 'Thick Skin', desc: '+10% to all Elemental Resistances', stats: { fireRes: 10, coldRes: 10, lightningRes: 10 } },
    { id: 'asc_col_4', name: "Juggernaut's Resolve", desc: 'Immune to Slow effects, +10% Movement Speed', stats: { movementSpeedInc: 10, tenacious: 1 } },
    { id: 'asc_col_5', name: "Mountain's Endurance", desc: '+40% increased Stun Threshold', stats: { stunThresholdInc: 40 } },
    { id: 'asc_col_6', name: 'Colossus Ascendant', desc: '+40% increased Armour, +120 to maximum Life', stats: { armorInc: 40, life: 120 } },
  ],
  warbringer: [
    { id: 'asc_war_1', name: 'Totemic Fury', desc: '+25% increased Melee Damage', stats: { meleeDamageInc: 25 } },
    { id: 'asc_war_2', name: 'War Cry', desc: '+15% increased Attack Speed after using a Warcry', stats: { attackSpeedInc: 15 } },
    { id: 'asc_war_3', name: 'Sundering Blows', desc: '+20% increased Physical Damage', stats: { physDamageInc: 20 } },
    { id: 'asc_war_4', name: "Berserker's Blood", desc: '+15% increased maximum Life, +10% Life Regenerated per second', stats: { lifeInc: 15, lifeRegenPercent: 10 } },
    { id: 'asc_war_5', name: 'Earthshaker', desc: '+30% increased Area of Effect', stats: { areaOfEffectInc: 30 } },
    { id: 'asc_war_6', name: 'Avatar of War', desc: '+30% increased Melee Damage, +15% increased Attack Speed', stats: { meleeDamageInc: 30, attackSpeedInc: 15 } },
  ],
  invoker: [
    { id: 'asc_inv_1', name: 'Flowing Strikes', desc: '+15% increased Attack Speed', stats: { attackSpeedInc: 15 } },
    { id: 'asc_inv_2', name: 'Dual Infusion', desc: '+15% increased Elemental Damage', stats: { fireDamageInc: 15, coldDamageInc: 15, lightningDamageInc: 15 } },
    { id: 'asc_inv_3', name: 'Combo Mastery', desc: '+20% increased Damage with Combo Finishers', stats: { comboDamageInc: 20 } },
    { id: 'asc_inv_4', name: "Serpent's Grace", desc: '+10% increased Evasion Rating, +8% chance to Dodge Attacks', stats: { evasionInc: 10, dodgeChance: 8 } },
    { id: 'asc_inv_5', name: 'Focused Chi', desc: '+20% increased Critical Strike Chance', stats: { critChanceInc: 20 } },
    { id: 'asc_inv_6', name: 'Master of Forms', desc: '+25% increased Melee Damage, +25% increased Elemental Damage', stats: { meleeDamageInc: 25, fireDamageInc: 25, coldDamageInc: 25, lightningDamageInc: 25 } },
  ],
  acolyte: [
    { id: 'asc_aco_1', name: 'Winter Palm', desc: '+25% increased Cold Damage', stats: { coldDamageInc: 25 } },
    { id: 'asc_aco_2', name: 'Frozen Focus', desc: '+15% increased Cast Speed', stats: { castSpeedInc: 15 } },
    { id: 'asc_aco_3', name: 'Deep Freeze', desc: '+20% increased Chill and Freeze effect', stats: { chillEffectInc: 20 } },
    { id: 'asc_aco_4', name: "Winter's Embrace", desc: '+15% increased maximum Energy Shield', stats: { energyShieldInc: 15 } },
    { id: 'asc_aco_5', name: 'Absolute Zero', desc: '+30% increased Cold Damage', stats: { coldDamageInc: 30 } },
    { id: 'asc_aco_6', name: 'Eternal Winter', desc: 'Enemies you Chill are also inflicted with 10% reduced Damage', stats: { coldDamageInc: 20, chillEffectInc: 20 } },
  ],
  deadeye: [
    { id: 'asc_dea_1', name: 'Far Shot', desc: '+20% increased Projectile Damage at range', stats: { projectileDamageInc: 20 } },
    { id: 'asc_dea_2', name: 'Fork', desc: 'Projectiles gain a chance to Fork on hit', stats: { forkChance: 25 } },
    { id: 'asc_dea_3', name: 'Gathering Wind', desc: '+15% increased Movement Speed, +10% increased Attack Speed', stats: { movementSpeedInc: 15, attackSpeedInc: 10 } },
    { id: 'asc_dea_4', name: "Hawk's Eye", desc: '+40 to Accuracy Rating, +10% increased Critical Strike Chance', stats: { accuracy: 40, critChanceInc: 10 } },
    { id: 'asc_dea_5', name: 'Piercing Shot', desc: 'Projectiles Pierce all Targets', stats: { pierceAll: 1 } },
    { id: 'asc_dea_6', name: 'Endless Munitions', desc: '+30% increased Projectile Damage', stats: { projectileDamageInc: 30 } },
  ],
  pathfinder: [
    { id: 'asc_pat_1', name: "Nature's Boon", desc: '+2 uses to Flasks carried', stats: { flaskCharges: 2 } },
    { id: 'asc_pat_2', name: 'Toxic Delivery', desc: '+25% increased Damage with Poison', stats: { poisonDamageInc: 25 } },
    { id: 'asc_pat_3', name: 'Master Alchemist', desc: 'Flask Effects apply to nearby Allies at 50% effect', stats: { flaskShare: 50 } },
    { id: 'asc_pat_4', name: 'Nature Walk', desc: '+15% increased Movement Speed while a Flask is active', stats: { movementSpeedInc: 15 } },
    { id: 'asc_pat_5', name: 'Deadly Toxins', desc: '+30% increased Chaos Damage', stats: { chaosDamageInc: 30 } },
    { id: 'asc_pat_6', name: 'Nature Dominion', desc: 'Permanently gain the effect of a Flask upon use', stats: { permaFlask: 1 } },
  ],
  stormcaller: [
    { id: 'asc_sto_1', name: 'Static Charge', desc: '+25% increased Lightning Damage', stats: { lightningDamageInc: 25 } },
    { id: 'asc_sto_2', name: 'Chain Lightning', desc: 'Lightning Spells Chain +1 additional time', stats: { chainCount: 1 } },
    { id: 'asc_sto_3', name: 'Temporal Flux', desc: '+15% increased Cast Speed', stats: { castSpeedInc: 15 } },
    { id: 'asc_sto_4', name: "Storm's Eye", desc: '+20% increased Critical Strike Multiplier with Lightning Skills', stats: { critMultiplier: 20 } },
    { id: 'asc_sto_5', name: 'Overcharge', desc: '+30% increased Lightning Damage', stats: { lightningDamageInc: 30 } },
    { id: 'asc_sto_6', name: 'Eye of the Storm', desc: 'Lightning Skills Shock enemies more effectively', stats: { shockEffectInc: 30 } },
  ],
  pyromancer: [
    { id: 'asc_pyr_1', name: 'Kindling', desc: '+25% increased Fire Damage', stats: { fireDamageInc: 25 } },
    { id: 'asc_pyr_2', name: 'Immolate', desc: '+20% increased Burning Damage', stats: { burningDamageInc: 20 } },
    { id: 'asc_pyr_3', name: "Wildfire's Reach", desc: '+20% increased Area of Effect', stats: { areaOfEffectInc: 20 } },
    { id: 'asc_pyr_4', name: 'Combustion', desc: '+15% increased Ignite effect', stats: { igniteEffectInc: 15 } },
    { id: 'asc_pyr_5', name: 'Scorched Earth', desc: '+30% increased Fire Damage', stats: { fireDamageInc: 30 } },
    { id: 'asc_pyr_6', name: 'Inferno', desc: 'Ignite you inflict spreads to nearby enemies on death', stats: { fireDamageInc: 20, igniteEffectInc: 20 } },
  ],
  necromancer: [
    { id: 'asc_bon_1', name: 'Grave Pact', desc: '+25% increased Minion Damage', stats: { minionDamageInc: 25 } },
    { id: 'asc_bon_2', name: 'Bolster', desc: '+25% increased Minion Life', stats: { minionLifeInc: 25 } },
    { id: 'asc_bon_3', name: 'Endless Ranks', desc: '+2 to maximum number of Skeletons', stats: { minionLimit: 2 } },
    { id: 'asc_bon_4', name: 'Dread Legion', desc: '+15 to Spirit', stats: { spirit: 15 } },
    { id: 'asc_bon_5', name: 'Undying Loyalty', desc: '+30% increased Minion Damage', stats: { minionDamageInc: 30 } },
    { id: 'asc_bon_6', name: 'Bone Speaker', desc: 'Minions have +20% increased Attack and Cast Speed', stats: { minionSpeedInc: 20 } },
  ],
  blightcaller: [
    { id: 'asc_bli_1', name: 'Virulence', desc: '+25% increased Chaos Damage', stats: { chaosDamageInc: 25 } },
    { id: 'asc_bli_2', name: 'Contagion', desc: '+20% increased Damage with Poison', stats: { poisonDamageInc: 20 } },
    { id: 'asc_bli_3', name: 'Withering Touch', desc: '+15% increased Area of Effect for Chaos Skills', stats: { areaOfEffectInc: 15 } },
    { id: 'asc_bli_4', name: "Plague Doctor's Sight", desc: '+30 to maximum Energy Shield', stats: { energyShield: 30 } },
    { id: 'asc_bli_5', name: 'Malignant Growth', desc: '+30% increased Chaos Damage', stats: { chaosDamageInc: 30 } },
    { id: 'asc_bli_6', name: 'Pandemic', desc: 'Poisons you inflict spread to nearby enemies when the target dies', stats: { poisonDamageInc: 25 } },
  ],
  gunslinger: [
    { id: 'asc_gun_1', name: 'Quickdraw', desc: '+15% increased Attack Speed with Crossbows', stats: { attackSpeedInc: 15 } },
    { id: 'asc_gun_2', name: 'Combo Loader', desc: '+20% increased Damage with Ammo Combos', stats: { comboDamageInc: 20 } },
    { id: 'asc_gun_3', name: 'Hair Trigger', desc: '+15% increased Critical Strike Chance', stats: { critChanceInc: 15 } },
    { id: 'asc_gun_4', name: 'Overcharged Rounds', desc: '+20% increased Elemental Damage', stats: { fireDamageInc: 20, coldDamageInc: 20, lightningDamageInc: 20 } },
    { id: 'asc_gun_5', name: 'Fanning the Hammer', desc: '+25% increased Attack Speed', stats: { attackSpeedInc: 25 } },
    { id: 'asc_gun_6', name: 'Perfect Reload', desc: '+30% increased Damage with Crossbow Skills', stats: { projectileDamageInc: 30 } },
  ],
  sapper: [
    { id: 'asc_sap_1', name: 'Demolitions', desc: '+25% increased Area of Effect for Grenade Skills', stats: { areaOfEffectInc: 25 } },
    { id: 'asc_sap_2', name: 'Shrapnel', desc: '+20% increased Physical Damage', stats: { physDamageInc: 20 } },
    { id: 'asc_sap_3', name: 'Volatile Payload', desc: '+20% increased Fire Damage', stats: { fireDamageInc: 20 } },
    { id: 'asc_sap_4', name: 'Chain Reaction', desc: '+15% increased Area of Effect', stats: { areaOfEffectInc: 15 } },
    { id: 'asc_sap_5', name: 'Big Ordnance', desc: '+30% increased Grenade Damage', stats: { grenadeDamageInc: 30 } },
    { id: 'asc_sap_6', name: 'Scorched Ground', desc: 'Explosions leave burning ground that Ignites enemies', stats: { fireDamageInc: 25, igniteEffectInc: 15 } },
  ],
};
