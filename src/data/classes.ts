export type ClassId = 'warrior' | 'monk' | 'ranger' | 'sorceress' | 'witch' | 'mercenary';

export interface AscendancyDef {
  id: string;
  name: string;
  description: string;
  /** Ids into the ascendancy-only mini passive tree (data/ascendancyTree.ts). */
  nodeIds: string[];
}

export interface ClassDef {
  id: ClassId;
  name: string;
  tagline: string;
  description: string;
  color: string;
  baseAttrs: { strength: number; dexterity: number; intelligence: number };
  baseResources: { life: number; mana: number; es: number; spirit: number };
  startWeaponId: string;
  startSkillId: string;
  /** Node id in the shared passive tree this class begins allocated at. */
  treeStartNodeId: string;
  ascendancies: AscendancyDef[];
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    tagline: 'Unshakable strength, earth-shattering force',
    description:
      'A hulking frontline fighter who wades into melee with two-handed maces and axes, ' +
      'breaking armor and stunning foes with seismic slams.',
    color: '#c0524a',
    baseAttrs: { strength: 32, dexterity: 14, intelligence: 10 },
    baseResources: { life: 70, mana: 30, es: 0, spirit: 0 },
    startWeaponId: 'two_hand_mace_t1',
    startSkillId: 'skill_earthbreaker',
    treeStartNodeId: 'start_warrior',
    ascendancies: [
      {
        id: 'titan',
        name: 'Colossus',
        description: 'Trades speed for overwhelming armor and stun threshold.',
        nodeIds: ['asc_col_1', 'asc_col_2', 'asc_col_3', 'asc_col_4', 'asc_col_5', 'asc_col_6'],
      },
      {
        id: 'warbringer',
        name: 'Warbringer',
        description: 'Channels totemic fury for area devastation and self-buffs.',
        nodeIds: ['asc_war_1', 'asc_war_2', 'asc_war_3', 'asc_war_4', 'asc_war_5', 'asc_war_6'],
      },
    ],
  },
  monk: {
    id: 'monk',
    name: 'Monk',
    tagline: 'Fluid strikes, elemental infusion',
    description:
      'A martial artist wielding quarterstaves, weaving rapid melee combos with elemental ' +
      'infusions and acrobatic evasion.',
    color: '#4aa3c0',
    baseAttrs: { strength: 16, dexterity: 28, intelligence: 20 },
    baseResources: { life: 55, mana: 45, es: 10, spirit: 10 },
    startWeaponId: 'quarterstaff_t1',
    startSkillId: 'skill_rising_wave',
    treeStartNodeId: 'start_monk',
    ascendancies: [
      {
        id: 'invoker',
        name: 'Invoker',
        description: 'Masters both physical and elemental strike combos.',
        nodeIds: ['asc_inv_1', 'asc_inv_2', 'asc_inv_3', 'asc_inv_4', 'asc_inv_5', 'asc_inv_6'],
      },
      {
        id: 'acolyte',
        name: 'Acolyte of Winter',
        description: 'Specializes in cold infusion and crowd freezing.',
        nodeIds: ['asc_aco_1', 'asc_aco_2', 'asc_aco_3', 'asc_aco_4', 'asc_aco_5', 'asc_aco_6'],
      },
    ],
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    tagline: 'Precision at range, deadly in the wild',
    description:
      'A sharpshooter who blankets the battlefield with arrows, laying traps and calling on ' +
      'nature to control the field before enemies close the distance.',
    color: '#6ec06a',
    baseAttrs: { strength: 14, dexterity: 32, intelligence: 12 },
    baseResources: { life: 58, mana: 32, es: 0, spirit: 8 },
    startWeaponId: 'shortbow_t1',
    startSkillId: 'skill_splitting_arrow',
    treeStartNodeId: 'start_ranger',
    ascendancies: [
      {
        id: 'deadeye',
        name: 'Deadeye',
        description: 'Projectiles fork, chain and pierce further than should be possible.',
        nodeIds: ['asc_dea_1', 'asc_dea_2', 'asc_dea_3', 'asc_dea_4', 'asc_dea_5', 'asc_dea_6'],
      },
      {
        id: 'pathfinder',
        name: 'Pathfinder',
        description: 'Utility flasks and ailments become a ranger’s greatest weapon.',
        nodeIds: ['asc_pat_1', 'asc_pat_2', 'asc_pat_3', 'asc_pat_4', 'asc_pat_5', 'asc_pat_6'],
      },
    ],
  },
  sorceress: {
    id: 'sorceress',
    name: 'Sorceress',
    tagline: 'Elemental annihilation from afar',
    description:
      'A spellcaster who commands fire, cold and lightning through staves and wands, ' +
      'raining devastating area spells on anything foolish enough to approach.',
    color: '#c07a4a',
    baseAttrs: { strength: 10, dexterity: 14, intelligence: 36 },
    baseResources: { life: 50, mana: 55, es: 20, spirit: 12 },
    startWeaponId: 'sceptre_t1',
    startSkillId: 'skill_firebolt',
    treeStartNodeId: 'start_sorceress',
    ascendancies: [
      {
        id: 'stormcaller',
        name: 'Stormcaller',
        description: 'Chains lightning and manipulates time between casts.',
        nodeIds: ['asc_sto_1', 'asc_sto_2', 'asc_sto_3', 'asc_sto_4', 'asc_sto_5', 'asc_sto_6'],
      },
      {
        id: 'pyromancer',
        name: 'Pyromancer',
        description: 'Ignites the battlefield with escalating burning damage.',
        nodeIds: ['asc_pyr_1', 'asc_pyr_2', 'asc_pyr_3', 'asc_pyr_4', 'asc_pyr_5', 'asc_pyr_6'],
      },
    ],
  },
  witch: {
    id: 'witch',
    name: 'Witch',
    tagline: 'Command the dead, wield forbidden chaos',
    description:
      'A summoner and chaos-wielder who raises the dead to fight on her behalf while ' +
      'poisoning and cursing anything left standing.',
    color: '#8a4ac0',
    baseAttrs: { strength: 10, dexterity: 12, intelligence: 38 },
    baseResources: { life: 48, mana: 58, es: 25, spirit: 20 },
    startWeaponId: 'wand_t1',
    startSkillId: 'skill_raise_skeleton',
    treeStartNodeId: 'start_witch',
    ascendancies: [
      {
        id: 'necromancer',
        name: 'Bone Speaker',
        description: 'Commands an ever-growing legion of the reanimated dead.',
        nodeIds: ['asc_bon_1', 'asc_bon_2', 'asc_bon_3', 'asc_bon_4', 'asc_bon_5', 'asc_bon_6'],
      },
      {
        id: 'blightcaller',
        name: 'Blightcaller',
        description: 'Spreads poison and chaos damage over time across packs.',
        nodeIds: ['asc_bli_1', 'asc_bli_2', 'asc_bli_3', 'asc_bli_4', 'asc_bli_5', 'asc_bli_6'],
      },
    ],
  },
  mercenary: {
    id: 'mercenary',
    name: 'Mercenary',
    tagline: 'Gunpowder, grenades and cold precision',
    description:
      'A gun-for-hire wielding an experimental crossbow rigged with elemental and ' +
      'explosive ammunition, swapping loadouts to answer any threat.',
    color: '#c0b04a',
    baseAttrs: { strength: 18, dexterity: 26, intelligence: 18 },
    baseResources: { life: 56, mana: 38, es: 5, spirit: 6 },
    startWeaponId: 'crossbow_t1',
    startSkillId: 'skill_bolt_barrage',
    treeStartNodeId: 'start_mercenary',
    ascendancies: [
      {
        id: 'gunslinger',
        name: 'Gunslinger',
        description: 'Rapid reloads and combo ammunition chains.',
        nodeIds: ['asc_gun_1', 'asc_gun_2', 'asc_gun_3', 'asc_gun_4', 'asc_gun_5', 'asc_gun_6'],
      },
      {
        id: 'sapper',
        name: 'Sapper',
        description: 'Explosive grenadier specializing in area denial.',
        nodeIds: ['asc_sap_1', 'asc_sap_2', 'asc_sap_3', 'asc_sap_4', 'asc_sap_5', 'asc_sap_6'],
      },
    ],
  },
};

export const CLASS_LIST: ClassDef[] = Object.values(CLASSES);
