/**
 * The §6.4 spreadsheet, executable.
 *
 * "Concretely, the design team's core artifact is not a document — it is a
 * spreadsheet of ~40 materials x ~8 property axes, plus a tag-reaction table,
 * tuned until the derived behaviours are interesting."
 *
 * This prints what actually happens when each weapon meets each target, so the
 * tuning loop is "read the matrix, change a number in materials.json, read it
 * again" rather than "play for an hour and form an impression".
 *
 *   node tools/matrix.ts [--targets a,b] [--weapons a,b]
 */

import { createSubstrate, heading, bold, dim, green, yellow, red, cyan } from "./lib.ts";

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, "").split("=");
  args.set(k, v ?? "");
}

const WEAPONS: Array<{ form: string; label: string; materials: string[] }> = [
  { form: "blade_straight_single_edge", label: "iron sword", materials: ["cold_iron", "cold_iron", "boarhide"] },
  { form: "blade_straight_single_edge", label: "obsidian sword", materials: ["obsidian", "cold_iron", "boarhide"] },
  { form: "blade_straight_single_edge", label: "quartz sword", materials: ["hoarfrost_quartz", "cold_iron", "boarhide"] },
  { form: "blade_straight_single_edge", label: "meteoric sword", materials: ["meteoric_steel", "cold_iron", "boarhide"] },
  { form: "dagger_leaf", label: "iron dagger", materials: ["cold_iron", "boarhide"] },
  { form: "spear_point_shaft", label: "iron spear", materials: ["cold_iron", "heartwood", "boarhide"] },
  { form: "axe_head_haft", label: "iron axe", materials: ["cold_iron", "heartwood", "boarhide"] },
  { form: "maul_head_haft", label: "iron maul", materials: ["cold_iron", "heartwood", "boarhide"] },
  { form: "maul_head_haft", label: "lead maul", materials: ["lead_grey", "heartwood", "boarhide"] },
];

const TARGETS = [
  "flesh",
  "frozen_flesh",
  "boarhide",
  "spider_silk",
  "chitin",
  "bone",
  "ice",
  "cold_iron",
  "bronze",
  "meteoric_steel",
  "granite",
  "obsidian",
  "heartwood",
];

const STRENGTH = Number(args.get("strength") ?? 3.5);
const weapons = args.has("weapons")
  ? WEAPONS.filter((w) => args.get("weapons")!.split(",").includes(w.label))
  : WEAPONS;
const targets = args.has("targets") ? args.get("targets")!.split(",") : TARGETS;

const sim = await createSubstrate();

/** One swing, from a clean world, reported as what the Readout saw. */
function trial(weapon: (typeof WEAPONS)[number], targetMaterial: string) {
  sim.reset();
  const w = sim.assemble(weapon.form, weapon.materials);
  const target = sim.assemble(
    "plate_segment",
    [targetMaterial, "boarhide"],
    { x: 1, y: 0, z: 0 },
  );
  const wielder = sim.assemble(
    "body_bipedal",
    ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"],
    { x: 0, y: 0, z: 0 },
  );
  sim.setEffectors(wielder, STRENGTH, w);
  const delivered = sim.strike(wielder, target, 0);
  sim.step(1);

  const events = sim.events();
  const on = (entity: number, kind: string) =>
    events.find((e) => e.entity === entity && e.kind === kind);

  const targetBroke = on(target, "fractured");
  const weaponBroke = on(w, "fractured");
  const deform = on(target, "deformed");

  return {
    delivered,
    stress: on(target, "impact")?.b ?? 0,
    integrityLost: deform?.a ?? 0,
    targetBroke: !!targetBroke,
    fragments: targetBroke?.detail ?? 0,
    weaponBroke: !!weaponBroke,
    weaponIntegrity: sim.partIntegrity(w, 0),
  };
}

heading(`weapon x target, wielder strength ${STRENGTH}`);
console.log(
  dim("  break = target fractured   self = weapon fractured   dent = integrity lost, no break\n"),
);

const width = Math.max(...targets.map((t) => t.length)) + 1;
console.log("  " + " ".repeat(16) + targets.map((t) => t.slice(0, 6).padEnd(7)).join(""));

for (const weapon of weapons) {
  const cells: string[] = [];
  for (const t of targets) {
    const r = trial(weapon, t);
    // Both can happen in one swing: the spear goes through the plate and the
    // point snaps. Showing only one of them hides the trade the player is
    // actually making.
    const hit = r.targetBroke
      ? green(`brk${r.fragments}`)
      : r.integrityLost > 0.005
        ? yellow(r.integrityLost.toFixed(2))
        : dim(" -  ");
    const cell = r.weaponBroke ? `${hit}${red("!")}` : `${hit} `;
    cells.push(cell + " ".repeat(Math.max(1, 8 - stripLen(cell))));
  }
  console.log("  " + bold(weapon.label.padEnd(16)) + cells.join(""));
}

function stripLen(s: string) {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

heading("derived weapon statistics (§8.1 — none of these are stored)");
console.log(
  "  " +
    ["weapon", "mass", "vel", "kinetic", "area", "swings/s"].map((h) => h.padEnd(14)).join(""),
);
for (const weapon of weapons) {
  sim.reset();
  const w = sim.assemble(weapon.form, weapon.materials);
  const wielder = sim.assemble(
    "body_bipedal",
    ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"],
  );
  sim.setEffectors(wielder, STRENGTH, w);
  const target = sim.spawnLump("granite", 4, { x: 2, y: 0, z: 0 });
  const kinetic = sim.strike(wielder, target, 0);
  const form = sim.forms.docs[sim.formId(weapon.form)];
  const mass = weapon.materials.reduce((sum, m, i) => {
    const density = sim.materials.docs[sim.materialId(m)].density;
    return sum + density * (form.parts[i]?.volume ?? 0);
  }, 0);
  const velocity = Math.min(form.max_speed, (STRENGTH * form.leverage) / mass);
  console.log(
    "  " +
      [
        weapon.label,
        mass.toFixed(2),
        velocity.toFixed(2),
        kinetic.toFixed(2),
        form.edge_area.toFixed(3),
        (velocity / form.reach).toFixed(2),
      ]
        .map((c) => String(c).padEnd(14))
        .join(""),
  );
}

heading("property space");
console.log(dim("  hardness vs toughness — the axis pair §6.2 says should usually anticorrelate"));
const rows = sim.materials.docs
  .filter((m) => m.hardness > 0)
  .sort((a, b) => b.hardness - a.hardness);
for (const m of rows) {
  const bar = "█".repeat(Math.max(1, Math.round(m.hardness * 3)));
  const tough = "▒".repeat(Math.max(1, Math.round(m.toughness * 24)));
  const outlier = m.hardness > 5 && m.toughness > 0.5 ? cyan(" <- anticorrelated") : "";
  console.log(
    `  ${m.id.padEnd(20)} ${m.hardness.toFixed(2).padStart(5)} ${bar.padEnd(28)}` +
      `${m.toughness.toFixed(2).padStart(5)} ${tough}${outlier}`,
  );
}
