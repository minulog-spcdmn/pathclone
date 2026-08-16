import { Rng } from '../engine/Random.ts';
import type { StatMap } from '../core/types.ts';
import type { ClassId } from './classes.ts';

export type NodeKind = 'start' | 'small' | 'notable' | 'keystone';

export interface TreeNode {
  id: string;
  x: number;
  y: number;
  kind: NodeKind;
  name: string;
  desc: string;
  theme: number;
  stats: StatMap;
  neighbors: string[];
  classStart?: ClassId;
}

export interface PassiveTree {
  nodes: Map<string, TreeNode>;
}

const THEME_NAMES = [
  'Life & Strength',
  'Melee Combos',
  'Dexterity & Evasion',
  'Bow & Projectile',
  'Critical Strikes',
  'Speed & Utility',
  'Elemental Infusion',
  'Chaos & Poison',
  'Minion Command',
  'Spell Elemental',
  'Energy Shield & Mana',
  'Two-Handed Might',
];

interface StatOption {
  key: string;
  label: (v: number) => string;
  perRing: number; // magnitude granted per ring depth, for a small node
}

const THEME_POOLS: StatOption[][] = [
  // 0 Life & Strength
  [
    { key: 'life', label: (v) => `+${v} to maximum Life`, perRing: 4 },
    { key: 'strength', label: (v) => `+${v} to Strength`, perRing: 1.5 },
    { key: 'lifeRegenPercent', label: (v) => `${v.toFixed(1)}% of Life Regenerated per second`, perRing: 0.06 },
  ],
  // 1 Melee Combos
  [
    { key: 'meleeDamageInc', label: (v) => `${v}% increased Melee Damage`, perRing: 2.4 },
    { key: 'attackSpeedInc', label: (v) => `${v}% increased Attack Speed`, perRing: 1.1 },
    { key: 'stunThresholdInc', label: (v) => `${v}% increased Stun Threshold`, perRing: 2 },
  ],
  // 2 Dexterity & Evasion
  [
    { key: 'dexterity', label: (v) => `+${v} to Dexterity`, perRing: 1.5 },
    { key: 'evasion', label: (v) => `+${v} Evasion Rating`, perRing: 6 },
    { key: 'evasionInc', label: (v) => `${v}% increased Evasion Rating`, perRing: 2.2 },
  ],
  // 3 Bow & Projectile
  [
    { key: 'projectileDamageInc', label: (v) => `${v}% increased Projectile Damage`, perRing: 2.4 },
    { key: 'attackSpeedInc', label: (v) => `${v}% increased Attack Speed`, perRing: 1.1 },
    { key: 'accuracy', label: (v) => `+${v} to Accuracy Rating`, perRing: 5 },
  ],
  // 4 Critical Strikes
  [
    { key: 'critChanceInc', label: (v) => `+${v}% to Critical Strike Chance`, perRing: 0.5 },
    { key: 'critMultiplier', label: (v) => `+${v}% to Critical Strike Multiplier`, perRing: 1.8 },
  ],
  // 5 Speed & Utility
  [
    { key: 'movementSpeedInc', label: (v) => `${v}% increased Movement Speed`, perRing: 0.7 },
    { key: 'attackSpeedInc', label: (v) => `${v}% increased Attack Speed`, perRing: 1.0 },
    { key: 'castSpeedInc', label: (v) => `${v}% increased Cast Speed`, perRing: 1.0 },
  ],
  // 6 Elemental Infusion
  [
    { key: 'fireDamageInc', label: (v) => `${v}% increased Fire Damage`, perRing: 2.4 },
    { key: 'coldDamageInc', label: (v) => `${v}% increased Cold Damage`, perRing: 2.4 },
    { key: 'lightningDamageInc', label: (v) => `${v}% increased Lightning Damage`, perRing: 2.4 },
  ],
  // 7 Chaos & Poison
  [
    { key: 'chaosDamageInc', label: (v) => `${v}% increased Chaos Damage`, perRing: 2.4 },
    { key: 'poisonDamageInc', label: (v) => `${v}% increased Damage with Poison`, perRing: 2.6 },
    { key: 'chaosRes', label: (v) => `+${v}% to Chaos Resistance`, perRing: 1.1 },
  ],
  // 8 Minion Command
  [
    { key: 'minionDamageInc', label: (v) => `${v}% increased Minion Damage`, perRing: 2.8 },
    { key: 'minionLifeInc', label: (v) => `${v}% increased Minion Life`, perRing: 2.8 },
    { key: 'spirit', label: (v) => `+${v} to Spirit`, perRing: 0.6 },
  ],
  // 9 Spell Elemental
  [
    { key: 'spellDamageInc', label: (v) => `${v}% increased Spell Damage`, perRing: 2.4 },
    { key: 'castSpeedInc', label: (v) => `${v}% increased Cast Speed`, perRing: 1.1 },
    { key: 'intelligence', label: (v) => `+${v} to Intelligence`, perRing: 1.5 },
  ],
  // 10 Energy Shield & Mana
  [
    { key: 'energyShield', label: (v) => `+${v} to maximum Energy Shield`, perRing: 3.4 },
    { key: 'energyShieldInc', label: (v) => `${v}% increased Energy Shield`, perRing: 2.2 },
    { key: 'mana', label: (v) => `+${v} to maximum Mana`, perRing: 2.6 },
  ],
  // 11 Two-Handed Might
  [
    { key: 'physDamageInc', label: (v) => `${v}% increased Physical Damage`, perRing: 2.6 },
    { key: 'armor', label: (v) => `+${v} Armour`, perRing: 6 },
    { key: 'armorInc', label: (v) => `${v}% increased Armour`, perRing: 2.2 },
  ],
];

interface KeystoneDef {
  id: string;
  name: string;
  desc: string;
  theme: number;
  stats: StatMap;
}

export const KEYSTONES: KeystoneDef[] = [
  {
    id: 'ks_iron_reflexes',
    name: 'Iron Reflexes',
    desc: 'Converts all Evasion Rating to Armour.',
    theme: 11,
    stats: { keystoneIronReflexes: 1 },
  },
  {
    id: 'ks_resolute_technique',
    name: 'Resolute Technique',
    desc: 'Your hits can never be Evaded, and you cannot deal Critical Strikes.',
    theme: 1,
    stats: { keystoneResoluteTechnique: 1 },
  },
  {
    id: 'ks_chaos_inoculation',
    name: 'Chaos Inoculation',
    desc: 'Maximum Life becomes 1. Immune to Chaos Damage; Energy Shield covers everything.',
    theme: 7,
    stats: { keystoneChaosInoculation: 1 },
  },
  {
    id: 'ks_avatar_of_fire',
    name: 'Avatar of Fire',
    desc: '50% of Physical, Cold and Lightning Damage is converted to Fire Damage.',
    theme: 6,
    stats: { keystoneAvatarOfFire: 1, fireDamageInc: 20 },
  },
  {
    id: 'ks_blood_magic',
    name: 'Blood Magic',
    desc: 'Removes your Mana. Skills cost Life instead of Mana.',
    theme: 0,
    stats: { keystoneBloodMagic: 1, lifeInc: 15 },
  },
  {
    id: 'ks_acrobatics',
    name: 'Acrobatics',
    desc: '30% chance to Dodge Attacks and Spells. 30% less Armour and Evasion Rating.',
    theme: 2,
    stats: { dodgeChance: 30, spellDodgeChance: 30, keystoneAcrobatics: 1 },
  },
  {
    id: 'ks_elemental_overload',
    name: 'Elemental Overload',
    desc: 'Cannot deal Elemental Critical Strikes. 40% more Elemental Damage if you have Crit in the last 8s.',
    theme: 4,
    stats: { keystoneElementalOverload: 1 },
  },
  {
    id: 'ks_minion_instability',
    name: 'Minion Instability',
    desc: 'Your Minions explode when reduced to low Life, dealing Fire Damage to nearby enemies.',
    theme: 8,
    stats: { keystoneMinionInstability: 1, minionDamageInc: 20 },
  },
  {
    id: 'ks_zealots_oath',
    name: "Zealot's Oath",
    desc: 'Life Regeneration applies to Energy Shield instead of Life.',
    theme: 10,
    stats: { keystoneZealotsOath: 1 },
  },
  {
    id: 'ks_point_blank',
    name: 'Point Blank',
    desc: 'Projectile Attacks deal up to 50% more Damage to targets at close range, less at long range.',
    theme: 3,
    stats: { keystonePointBlank: 1 },
  },
  {
    id: 'ks_unwavering_stance',
    name: 'Unwavering Stance',
    desc: 'Cannot Evade Attacks. Immune to Stun.',
    theme: 11,
    stats: { keystoneUnwaveringStance: 1 },
  },
  {
    id: 'ks_ghost_dance',
    name: 'Ghost Reaver',
    desc: 'Life Leech effects instead Leech to Energy Shield.',
    theme: 9,
    stats: { keystoneGhostReaver: 1 },
  },
  {
    id: 'ks_crimson_dance',
    name: 'Crimson Dance',
    desc: 'Bleeding you inflict can stack up to 8 times on an enemy.',
    theme: 1,
    stats: { keystoneCrimsonDance: 1, bleedDamageInc: 30 },
  },
  {
    id: 'ks_wind_dancer',
    name: 'Wind Dancer',
    desc: '25% increased Movement Speed while at full Life. 10% reduced Damage taken while moving.',
    theme: 5,
    stats: { keystoneWindDancer: 1 },
  },
];

const RINGS = 13;
const RING_STEP = 68;
const START_RADIUS = 46;

const CLASS_ANGLES: Record<ClassId, number> = {
  warrior: 0,
  monk: 60,
  ranger: 120,
  mercenary: 180,
  witch: 240,
  sorceress: 300,
};

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

function themeForAngle(angleDeg: number): number {
  const norm = ((angleDeg % 360) + 360) % 360;
  return Math.floor(norm / 30) % 12;
}

function nodeId(ring: number, slot: number): string {
  return `n_${ring}_${slot}`;
}

export function generatePassiveTree(seed = 1337): PassiveTree {
  const rng = new Rng(seed);
  const nodes = new Map<string, TreeNode>();
  const ringSlots: number[] = [];
  for (let r = 1; r <= RINGS; r++) {
    ringSlots.push(12 + r * 3);
  }

  // Class start nodes sit at a small inner ring (ring 0).
  for (const [cls, angle] of Object.entries(CLASS_ANGLES) as [ClassId, number][]) {
    const rad = deg2rad(angle);
    const id = `start_${cls}`;
    nodes.set(id, {
      id,
      x: Math.cos(rad) * START_RADIUS,
      y: Math.sin(rad) * START_RADIUS,
      kind: 'start',
      name: `${cls[0].toUpperCase()}${cls.slice(1)} Origin`,
      desc: 'Your journey begins here.',
      theme: themeForAngle(angle),
      stats: {},
      neighbors: [],
      classStart: cls,
    });
  }

  // Generate ring nodes.
  for (let r = 1; r <= RINGS; r++) {
    const slots = ringSlots[r - 1];
    const radius = START_RADIUS + r * RING_STEP;
    const offset = r % 2 === 0 ? 0.5 : 0;
    for (let s = 0; s < slots; s++) {
      const angle = ((s + offset) / slots) * 360;
      const rad = deg2rad(angle);
      const id = nodeId(r, s);
      const theme = themeForAngle(angle);
      nodes.set(id, {
        id,
        x: Math.cos(rad) * radius,
        y: Math.sin(rad) * radius,
        kind: 'small',
        name: 'Minor Passive',
        desc: '',
        theme,
        stats: {},
        neighbors: [],
      });
    }
  }

  const addEdge = (a: string, b: string): void => {
    const na = nodes.get(a);
    const nb = nodes.get(b);
    if (!na || !nb) return;
    if (!na.neighbors.includes(b)) na.neighbors.push(b);
    if (!nb.neighbors.includes(a)) nb.neighbors.push(a);
  };

  // Tangential edges within a ring (with random gaps to create winding paths).
  for (let r = 1; r <= RINGS; r++) {
    const slots = ringSlots[r - 1];
    for (let s = 0; s < slots; s++) {
      if (rng.chance(0.72)) {
        addEdge(nodeId(r, s), nodeId(r, (s + 1) % slots));
      }
    }
  }

  // Radial edges connecting ring r to ring r+1 by nearest angle.
  for (let r = 0; r < RINGS; r++) {
    const innerIsStart = r === 0;
    const innerSlots = innerIsStart ? 6 : ringSlots[r - 1];
    const outerSlots = ringSlots[r];
    const outerOffset = (r + 1) % 2 === 0 ? 0.5 : 0;
    for (let s = 0; s < outerSlots; s++) {
      const outerAngle = ((s + outerOffset) / outerSlots) * 360;
      let bestInner = 0;
      let bestDiff = Infinity;
      for (let is = 0; is < innerSlots; is++) {
        const innerAngle = innerIsStart
          ? Object.values(CLASS_ANGLES)[is] ?? (is / innerSlots) * 360
          : ((is + (r % 2 === 0 ? 0.5 : 0)) / innerSlots) * 360;
        let diff = Math.abs(innerAngle - outerAngle) % 360;
        if (diff > 180) diff = 360 - diff;
        if (diff < bestDiff) {
          bestDiff = diff;
          bestInner = is;
        }
      }
      if (rng.chance(0.8)) {
        const innerId = innerIsStart
          ? `start_${(Object.keys(CLASS_ANGLES) as ClassId[])[bestInner]}`
          : nodeId(r, bestInner);
        addEdge(innerId, nodeId(r + 1, s));
      }
    }
  }

  // Guarantee connectivity: BFS from all start nodes, bridge any orphan components.
  ensureConnected(nodes);

  // Assign stats per node by theme.
  for (const node of nodes.values()) {
    if (node.kind === 'start') continue;
    const ring = ringDepthOf(node.id);
    const pool = THEME_POOLS[node.theme];
    const isNotable = ring > 1 && rng.chance(0.09);
    node.kind = isNotable ? 'notable' : 'small';
    const count = isNotable ? 2 + (rng.chance(0.4) ? 1 : 0) : 1;
    const chosen = new Set<number>();
    while (chosen.size < Math.min(count, pool.length)) {
      chosen.add(rng.int(0, pool.length));
    }
    const mag = isNotable ? 1.9 : 1;
    const stats: StatMap = {};
    const labels: string[] = [];
    for (const idx of chosen) {
      const opt = pool[idx];
      const value = Math.round(opt.perRing * ring * mag * 10) / 10;
      stats[opt.key] = (stats[opt.key] ?? 0) + value;
      labels.push(opt.label(value));
    }
    node.stats = stats;
    node.name = isNotable ? notableName(node.theme, rng) : THEME_NAMES[node.theme];
    node.desc = labels.join('\n');
  }

  // Place keystones at the outer rings, one near each theme's dominant sector.
  const outerRing = RINGS;
  const slots = ringSlots[outerRing - 1];
  let ksIndex = 0;
  const usedSlots = new Set<number>();
  for (const ks of KEYSTONES) {
    // find an outer-ring node whose theme matches and isn't already used
    let candidate: TreeNode | undefined;
    for (let s = 0; s < slots; s++) {
      if (usedSlots.has(s)) continue;
      const n = nodes.get(nodeId(outerRing, s));
      if (n && n.theme === ks.theme) {
        candidate = n;
        usedSlots.add(s);
        break;
      }
    }
    if (!candidate) {
      // fall back to any unused outer node
      for (let s = 0; s < slots; s++) {
        if (usedSlots.has(s)) continue;
        candidate = nodes.get(nodeId(outerRing, s));
        usedSlots.add(s);
        break;
      }
    }
    if (candidate) {
      candidate.kind = 'keystone';
      candidate.name = ks.name;
      candidate.desc = ks.desc;
      candidate.stats = ks.stats;
    }
    ksIndex++;
  }
  void ksIndex;

  return { nodes };
}

function ringDepthOf(id: string): number {
  const m = /^n_(\d+)_/.exec(id);
  return m ? parseInt(m[1], 10) : 1;
}

const NOTABLE_ADJECTIVES = ['Ancient', 'Grim', 'Storm', 'Blood', 'Iron', 'Shadow', 'Sacred', 'Feral', 'Sundered', 'Deep'];
function notableName(theme: number, rng: Rng): string {
  const adj = rng.pick(NOTABLE_ADJECTIVES);
  return `${adj} ${THEME_NAMES[theme]}`;
}

function ensureConnected(nodes: Map<string, TreeNode>): void {
  const ids = Array.from(nodes.keys());
  const visited = new Set<string>();
  const starts = ids.filter((id) => nodes.get(id)!.kind === 'start');
  const queue = [...starts];
  starts.forEach((s) => visited.add(s));
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of nodes.get(cur)!.neighbors) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  // Any node not visited is an orphan island; bridge it to its nearest visited node.
  for (const id of ids) {
    if (visited.has(id)) continue;
    const n = nodes.get(id)!;
    let best: TreeNode | undefined;
    let bestDist = Infinity;
    for (const vId of visited) {
      const v = nodes.get(vId)!;
      const d = (v.x - n.x) ** 2 + (v.y - n.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    if (best) {
      best.neighbors.push(id);
      n.neighbors.push(best.id);
      visited.add(id);
    }
  }
}
