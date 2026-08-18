/**
 * Compile the JSON data files into the packed blobs the simulation reads.
 *
 * Both hosts consume the *same bytes*: the browser uploads them through
 * `Substrate`, the native binary reads them off disk. A determinism test in
 * which each host parses its own JSON would be testing two JSON parsers, not
 * one simulation.
 *
 *   node tools/pack.ts [--out build]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { packForms, packMaterials, packRules } from "../src/substrate/pack.ts";
import { ROOT, loadData, heading, dim, green } from "./lib.ts";

const outArg = process.argv.find((a) => a.startsWith("--out="));
const outDir = join(ROOT, outArg ? outArg.slice("--out=".length) : "build");

const data = loadData();
mkdirSync(outDir, { recursive: true });

const blobs: Array<[string, Uint8Array]> = [
  ["materials.bin", packMaterials(data.materials)],
  ["forms.bin", packForms(data.forms)],
  ["rules.bin", packRules(data.rules)],
];

heading(`packed data -> ${outDir.replace(ROOT + "/", "")}`);
for (const [name, bytes] of blobs) {
  writeFileSync(join(outDir, name), bytes);
  console.log(`  ${green("✓")} ${name.padEnd(16)} ${dim(`${bytes.length} bytes`)}`);
}
console.log(
  `\n  ${dim(`${data.materials.materials.length} materials, ${data.forms.forms.length} forms`)}`,
);
