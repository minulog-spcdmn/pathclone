/**
 * The §4.4 ship gate, as a build step.
 *
 *   "Before any content work begins, the team must be able to demonstrate 20
 *    distinct, useful, unanticipated tactical outcomes produced solely by the
 *    material table and the impulse resolver in a bare test arena."
 *
 * §15 M1 is blunt about what happens if this fails: "stop and fix the material
 * table. Do not proceed." So it exits non-zero, and it is meant to be the thing
 * that blocks the branch — not a report someone reads later.
 *
 *   node tools/shipgate.ts [--verbose]
 */

import { createSubstrate, heading, bold, dim, green, red, cyan } from "./lib.ts";

const verbose = process.argv.includes("--verbose");

const sim = await createSubstrate();
const scenarios = sim.scenarios();

heading(`§4.4 ship gate — ${scenarios.length} tactical outcomes`);
console.log(
  dim(
    "  Each row is a claim about play, checked against a bare arena.\n" +
      "  Nothing below is implemented anywhere: it is materials.json meeting the resolver.\n",
  ),
);

let passed = 0;
const failures: string[] = [];

for (const s of scenarios) {
  const result = sim.runScenario(s.index);
  const mark = result.passed ? green("✓") : red("✗");
  console.log(`  ${mark} ${bold(s.name)}`);
  console.log(`      ${cyan(s.claim)}`);
  console.log(`      ${dim(result.note)}`);
  if (verbose) {
    const events = sim.events();
    const tally = new Map<string, number>();
    for (const e of events) tally.set(e.kind, (tally.get(e.kind) ?? 0) + 1);
    console.log(
      `      ${dim(
        [...tally].map(([k, v]) => `${k}:${v}`).join("  ") || "no events",
      )}`,
    );
  }
  console.log();
  if (result.passed) passed++;
  else failures.push(s.name);
}

const required = 20;
heading("result");
console.log(`  ${passed} of ${scenarios.length} claims held`);

if (failures.length) {
  console.log(`  ${red("not demonstrated:")} ${failures.join(", ")}`);
}

if (passed < required) {
  console.log(
    red(
      `\n  GATE CLOSED. §15 M1: "If this fails, stop and fix the material table. Do not proceed."\n` +
        `  ${required} outcomes are required; ${passed} were demonstrated.\n`,
    ),
  );
  process.exit(1);
}

console.log(green(`\n  GATE OPEN. ${passed} outcomes demonstrated, none of them implemented.\n`));
