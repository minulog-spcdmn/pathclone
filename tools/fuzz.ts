/**
 * The material fuzzer of §13.
 *
 *   "Material property fuzzer — searches for degenerate reaction loops and
 *    energy-generating cascades."
 *
 * §4.3 names energy-generating loops as "the #1 exploit vector in this design",
 * and the honest way to close that is not an assertion that fires when someone
 * happens to be looking — it is to decide the question. Every phase transition
 * and every reaction is an edge in a directed graph over materials, each
 * carrying a known energy per unit volume. A cascade can only run forever if
 * that graph has a cycle, and it can only *pay* if the cycle sums positive. So
 * this enumerates the cycles and adds them up.
 *
 * It also reports two things the design asks a human to watch:
 *
 *   - §4.2's hardness/toughness anticorrelation, and which rows break it
 *     deliberately;
 *   - materials that are strictly dominated on every axis, which is §13's
 *     usage-concentration defect one level down: a row nobody will ever pick is
 *     dead content in a game that has no content.
 *
 *   node tools/fuzz.ts [--arenas 200] [--verbose]
 */

import {
  createSubstrate,
  loadData,
  heading,
  bold,
  dim,
  green,
  red,
  yellow,
  cyan,
  num,
} from "./lib.ts";
import type { MaterialDoc } from "../src/substrate/pack.ts";

const verbose = process.argv.includes("--verbose");
const arenaArg = process.argv.find((a) => a.startsWith("--arenas="));
const arenaCount = arenaArg ? Number(arenaArg.split("=")[1]) : 200;

const data = loadData();
const materials = data.materials.materials;
const byId = new Map(materials.map((m) => [m.id, m]));

/** Volumetric heat capacity: what one unit of volume holds per degree. */
function c(m: MaterialDoc): number {
  return m.density * m.heat_capacity;
}

interface Edge {
  from: string;
  to: string;
  /** Energy released into the world per unit volume converted. */
  energy: number;
  label: string;
}

/**
 * Energy booked when one unit of volume crosses an edge.
 *
 * These mirror `Sim::plateau` and `Sim::check_phase` exactly. Melting and
 * boiling pay the latent bank and settle at the threshold, so they also pay the
 * heat-capacity difference at that temperature; freezing is the same with the
 * sign flipped. Ignition preserves heat and adds its declared energy.
 */
function edgesOf(m: MaterialDoc): Edge[] {
  const out: Edge[] = [];
  const points = m.phase_points ?? {};
  const products = m.phase_products ?? {};
  const energies = m.phase_energy ?? {};

  for (const t of ["melt", "boil", "solidify", "ignite"] as const) {
    const temp = points[t];
    const product = products[t];
    if (temp === undefined || temp === null || !product) continue;
    const to = byId.get(product);
    if (!to) continue;
    const L = energies[t] ?? 0;
    let energy: number;
    if (t === "ignite") {
      energy = L;
    } else if (t === "solidify") {
      energy = temp * (c(to) - c(m)) + L;
    } else {
      energy = temp * (c(to) - c(m)) - L;
    }
    out.push({ from: m.id, to: product, energy, label: t });
  }

  for (const rx of m.reactions ?? []) {
    if (!byId.has(rx.produces)) continue;
    out.push({
      from: m.id,
      to: rx.produces,
      energy: rx.releases?.thermal ?? 0,
      label: `reacts with ${rx.with}`,
    });
  }
  return out;
}

const edges: Edge[] = materials.flatMap(edgesOf);
const adjacency = new Map<string, Edge[]>();
for (const e of edges) {
  if (e.from === e.to) continue;
  const list = adjacency.get(e.from) ?? [];
  list.push(e);
  adjacency.set(e.from, list);
}

// --- cycle enumeration ------------------------------------------------------

const cycles: Edge[][] = [];
const MAX_CYCLES = 500;

function walk(start: string, node: string, path: Edge[], onPath: Set<string>) {
  if (cycles.length >= MAX_CYCLES) return;
  for (const e of adjacency.get(node) ?? []) {
    if (e.to === start) {
      cycles.push([...path, e]);
      if (cycles.length >= MAX_CYCLES) return;
      continue;
    }
    // Only extend to nodes greater than `start` so each elementary cycle is
    // found exactly once, at its lexicographically smallest member.
    if (e.to < start || onPath.has(e.to)) continue;
    onPath.add(e.to);
    path.push(e);
    walk(start, e.to, path, onPath);
    path.pop();
    onPath.delete(e.to);
  }
}

for (const m of materials) {
  walk(m.id, m.id, [], new Set([m.id]));
}

heading("product graph");
console.log(
  `  ${materials.length} materials, ${edges.length} transitions and reactions, ` +
    `${cycles.length} cycle${cycles.length === 1 ? "" : "s"}`,
);

const TOLERANCE = 0.5;
const generative = cycles
  .map((cycle) => ({
    cycle,
    net: cycle.reduce((sum, e) => sum + e.energy, 0),
  }))
  .sort((a, b) => b.net - a.net);

if (cycles.length) {
  console.log(
    dim(
      "\n  A cycle is fine — matter goes round in the real world too. What is not\n" +
        "  fine is a cycle that pays: net energy per unit volume must not be positive,\n" +
        "  or a player can run it forever for free.\n",
    ),
  );
  for (const { cycle, net } of generative) {
    const bad = net > TOLERANCE;
    if (!bad && !verbose) continue;
    const path = cycle.map((e) => `${e.from} --${e.label}-->`).join(" ") + ` ${cycle[0].from}`;
    console.log(`  ${bad ? red("✗") : green("✓")} net ${num(net, 3).padStart(9)}  ${dim(path)}`);
    if (bad) {
      for (const e of cycle) {
        console.log(`        ${e.from} → ${e.to} (${e.label}): ${num(e.energy, 3)}`);
      }
    }
  }
}

const failures: string[] = [];
const worst = generative[0];
if (worst && worst.net > TOLERANCE) {
  failures.push(
    `a cycle through ${worst.cycle[0].from} nets +${num(worst.net, 3)} per unit volume`,
  );
}

// --- runtime energy soak ----------------------------------------------------

heading(`energy audit over ${arenaCount} randomised arenas`);

const sim = await createSubstrate();
let worstSurplus = -Infinity;
let worstSeed = 0;

for (let a = 0; a < arenaCount; a++) {
  sim.reset(BigInt(a + 1));
  // A handful of random materials, thrown together and then abused. The point
  // is coverage of combinations no scenario thought to try.
  const rng = mulberry32(a * 2654435761);
  const ids: number[] = [];
  for (let i = 0; i < 6; i++) {
    const id = Math.floor(rng() * materials.length);
    ids.push(sim.spawnLump(id, 0.5 + rng() * 2, { x: i * 1.5, y: 0, z: 0 }, 20));
  }
  const baseline = sim.storedEnergy();
  let injected = 0;
  for (let t = 0; t < 60; t++) {
    const target = ids[Math.floor(rng() * ids.length)];
    const roll = rng();
    if (roll < 0.3) {
      const thermal = (rng() - 0.3) * 800;
      sim.inject(target, 0, { thermal });
      injected += thermal;
    } else if (roll < 0.6) {
      const charge = rng() * 60;
      sim.inject(target, 0, { charge });
      injected += charge * sim.rules.charge_energy_coeff;
    } else if (roll < 0.85) {
      const corrosive = rng() * 4;
      const tag = [...sim.materials.tagBits.keys()][
        Math.floor(rng() * sim.materials.tagBits.size)
      ];
      sim.inject(target, 0, { corrosive, reagent: [tag] });
    } else {
      const kinetic = rng() * 20;
      sim.inject(target, 0, { kinetic, contactArea: 0.05 + rng() });
      injected += kinetic;
    }
    sim.step(1);
  }
  // The sim's own ledger is authoritative: released chemical energy is
  // legitimate and has to be on the accounted side, which is exactly what
  // §4.3's inequality says.
  const surplus = sim.auditExcess(baseline);
  void injected;
  if (surplus > worstSurplus) {
    worstSurplus = surplus;
    worstSeed = a + 1;
  }
}

// §4.3: "total system energy after resolution <= energy before + injected".
// Fixed-point rounding accumulates across thousands of part updates, so the
// bound is a small constant rather than zero; what matters is that it does not
// scale with how much happened.
const RUNTIME_BOUND = 1;
console.log(
  `  worst unexplained surplus: ${num(worstSurplus, 4)} (seed ${worstSeed}, tolerance ${RUNTIME_BOUND})`,
);
if (worstSurplus > RUNTIME_BOUND) {
  failures.push(
    `arena ${worstSeed} ended holding ${num(worstSurplus, 3)} of energy that was never injected or released`,
  );
}

// --- property space ---------------------------------------------------------

heading("property space (§4.2)");

const solid = materials.filter((m) => m.hardness > 0);
const meanH = solid.reduce((s, m) => s + m.hardness, 0) / solid.length;
const meanT = solid.reduce((s, m) => s + m.toughness, 0) / solid.length;
const cov =
  solid.reduce((s, m) => s + (m.hardness - meanH) * (m.toughness - meanT), 0) / solid.length;
const sdH = Math.sqrt(solid.reduce((s, m) => s + (m.hardness - meanH) ** 2, 0) / solid.length);
const sdT = Math.sqrt(solid.reduce((s, m) => s + (m.toughness - meanT) ** 2, 0) / solid.length);
const correlation = cov / (sdH * sdT);

console.log(
  `  hardness vs toughness correlation: ${num(correlation, 3)} ` +
    dim("(§4.2 wants this negative — hard and brittle is the norm)"),
);
if (correlation > -0.1) {
  failures.push(
    `hardness and toughness are not anticorrelated (r = ${num(correlation, 3)}); ` +
      `§4.2 calls that relationship the normal one, with outliers rare`,
  );
}

const outliers = solid.filter((m) => m.hardness > meanH + sdH && m.toughness > meanT + sdT);
console.log(
  `  deliberate outliers: ${outliers.length ? cyan(outliers.map((m) => m.id).join(", ")) : dim("none")}` +
    dim(" — these are §5.4's anomalies, and they should stay rare"),
);
for (const m of outliers) {
  const abundance = m.formation?.abundance;
  if (typeof abundance === "number" && abundance > 0.02) {
    failures.push(`${m.id} breaks the correlation but has abundance ${abundance}; §5.4 wants outliers rare`);
  }
}

// --- dominated rows ---------------------------------------------------------

const AXES = [
  "hardness",
  "toughness",
  "thermal_conductivity",
  "conductivity",
  "aether_capacity",
  "corrosion_resistance",
] as const;

const dominated: string[] = [];
for (const a of solid) {
  for (const b of solid) {
    if (a === b) continue;
    const strictlyBetter =
      AXES.every((axis) => (b as never as Record<string, number>)[axis] >= (a as never as Record<string, number>)[axis]) &&
      AXES.some((axis) => (b as never as Record<string, number>)[axis] > (a as never as Record<string, number>)[axis]);
    // Only a problem if the better row is also at least as easy to find:
    // a rare anomaly outclassing common stone is the design working.
    const aAbundance = a.formation?.abundance ?? 0;
    const bAbundance = b.formation?.abundance ?? 0;
    if (strictlyBetter && b.density <= a.density && bAbundance >= aAbundance) {
      dominated.push(`${a.id} is beaten on every axis by ${b.id}, which is no rarer`);
      break;
    }
  }
}

heading("dominated materials");
if (dominated.length === 0) {
  console.log(`  ${green("none")} — every material wins on something`);
} else {
  for (const d of dominated) console.log(`  ${yellow("!")} ${d}`);
  console.log(
    dim("\n  Not a build failure, but a row nobody will pick is dead weight in a game\n  whose whole content model is this table."),
  );
}

// --- verdict ----------------------------------------------------------------

heading("verdict");
if (failures.length === 0) {
  console.log(green(`  ${bold("CLEAN")} — no paying cycle, no runaway arena, property space well shaped.\n`));
} else {
  for (const f of failures) console.log(`  ${red("✗")} ${f}`);
  console.log(
    red(
      `\n  §13: "when something is overpowered, the correct fix is almost always to adjust\n` +
        `  a coefficient in a derivation or a property in the material table — never to add\n` +
        `  a special case."\n`,
    ),
  );
  process.exit(1);
}

/** Small deterministic PRNG so a failing arena can be reproduced by seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
