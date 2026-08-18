/**
 * §14.4 rule 9, the desync test.
 *
 *   "CI desync test: run 10,000 ticks of a seeded scenario on server and client
 *    builds, assert identical state hashes. This test runs on every commit. If
 *    it goes red, nothing else ships."
 *
 * The two hosts here are genuinely different: wasm32 under a JavaScript engine,
 * and x86-64 native. Different code generators, different register allocation,
 * different everything except the arithmetic — which is the point. §14.4 rule 2
 * calls platform transcendentals "the single most common source of
 * cross-platform desync"; this run exercises `sqrt` on every distance test in
 * the soak, so a divergent one shows up here in seconds.
 *
 *   node tools/determinism.ts [--ticks 10000] [--seed 1]
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { ROOT, createSubstrate, heading, bold, dim, green, red, yellow } from "./lib.ts";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return Number(inline.split("=")[1]);
  return fallback;
}

const ticks = arg("ticks", 10_000);
const seed = arg("seed", 1);
const checkpoints = 10;
const stride = Math.max(1, Math.floor(ticks / checkpoints));

heading(`determinism — ${ticks.toLocaleString()} ticks, seed ${seed}`);

// --- host A: wasm32, via the same class the browser uses -------------------

const sim = await createSubstrate(BigInt(seed));
const wasmHashes: Array<[number, string]> = [];
{
  let done = 0;
  while (done < ticks) {
    const step = Math.min(stride, ticks - done);
    const h = sim.soak(step);
    done += step;
    wasmHashes.push([done, h.toString(16).padStart(16, "0")]);
  }
}
console.log(`  ${dim("wasm32   ")} ${wasmHashes.length} checkpoints, final ${wasmHashes.at(-1)![1]}`);

// --- host B: x86-64 native --------------------------------------------------

const nativeBin = join(ROOT, "sim/target/release/hashes");
if (!existsSync(nativeBin)) {
  console.log(
    yellow(
      `\n  The native half is not built, so this run compared wasm against nothing.\n` +
        `  Build it with:\n` +
        `    cargo build --release --bin hashes --manifest-path sim/Cargo.toml\n`,
    ),
  );
  process.exit(1);
}

const buildDir = join(ROOT, "build");
if (!existsSync(join(buildDir, "materials.bin"))) {
  console.log(yellow(`\n  Packed blobs missing. Run: node tools/pack.ts\n`));
  process.exit(1);
}

const raw = execFileSync(nativeBin, [buildDir, String(ticks), String(seed)], {
  encoding: "utf8",
});
const nativeHashes: Array<[number, string]> = raw
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [t, h] = line.trim().split(/\s+/);
    return [Number(t), h] as [number, string];
  });
console.log(
  `  ${dim("x86-64   ")} ${nativeHashes.length} checkpoints, final ${nativeHashes.at(-1)?.[1]}`,
);

// --- compare ----------------------------------------------------------------

console.log();
let diverged: number | null = null;
for (let i = 0; i < Math.max(wasmHashes.length, nativeHashes.length); i++) {
  const a = wasmHashes[i];
  const b = nativeHashes[i];
  if (!a || !b) {
    diverged = a?.[0] ?? b?.[0] ?? 0;
    break;
  }
  const same = a[1] === b[1];
  console.log(
    `  ${same ? green("✓") : red("✗")} tick ${String(a[0]).padStart(7)}  ` +
      `${dim("wasm")} ${a[1]}  ${dim("native")} ${b[1]}`,
  );
  if (!same && diverged === null) diverged = a[0];
}

if (diverged !== null) {
  console.log(
    red(
      `\n  DESYNC. The two hosts first disagree somewhere in the ${stride} ticks before ${diverged}.\n` +
        `  §14.4: "If it goes red, nothing else ships." Check the six rules — the usual\n` +
        `  culprit is a platform transcendental or an iteration order that is not stable.\n`,
    ),
  );
  process.exit(1);
}

console.log(
  green(`\n  ${bold("IDENTICAL")} — wasm32 and x86-64 agree on every checkpoint.\n`),
);
