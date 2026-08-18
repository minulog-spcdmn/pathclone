/**
 * A first breath: load the data, build two objects, hit one with the other,
 * and print what the Readout saw. If this prints nothing interesting, the
 * pipeline is broken somewhere between `materials.json` and the resolver.
 */

import { createSubstrate, heading, num, dim, cyan } from "./lib.ts";

const sim = await createSubstrate();

heading("data");
console.log(`materials  ${sim.materials.names.length}`);
console.log(`forms      ${sim.forms.docs.length}`);
console.log(`tags       ${[...sim.materials.tagBits.keys()].join(", ")}`);

heading("a sword, a body, one swing");
const sword = sim.assemble("blade_straight_single_edge", ["cold_iron", "cold_iron", "boarhide"]);
const target = sim.assemble(
  "body_bipedal",
  ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"],
  { x: 1, y: 0, z: 0 },
);
const wielder = sim.assemble(
  "body_bipedal",
  ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"],
  { x: 0, y: 0, z: 0 },
);
sim.setEffectors(wielder, 6, sword);

const delivered = sim.strike(wielder, target, 0);
sim.step(1);

console.log(`delivered kinetic  ${num(delivered)}`);
console.log(`torso integrity    ${num(sim.partIntegrity(target, 0), 3)}`);
console.log(`blade integrity    ${num(sim.partIntegrity(sword, 0), 3)}`);
console.log(`entities           ${sim.entityCount}`);

heading("readout");
for (const e of sim.events()) {
  console.log(
    `  t${e.tick} ${cyan(e.kind.padEnd(10))} e${e.entity}:${e.part} ` +
      dim(`${sim.materialName(e.materialBefore)} -> ${sim.materialName(e.materialAfter)}`) +
      `  a=${num(e.a, 3)} b=${num(e.b, 3)}`,
  );
}

heading("state");
console.log(`tick   ${sim.tick}`);
console.log(`hash   0x${sim.hash().toString(16)}`);
console.log(`energy ${num(sim.storedEnergy())}`);
