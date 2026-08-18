/**
 * Node-side plumbing shared by the tools. Nothing here is part of the
 * simulation; it reads files and hands bytes to `Substrate`, which is the same
 * class the browser uses.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Substrate, type DataFiles } from "../src/substrate/host.ts";

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Where the release wasm lands, and where `npm run sim:build` copies it. */
const WASM_CANDIDATES = [
  join(ROOT, "sim/target/wasm32-unknown-unknown/release/sim.wasm"),
  join(ROOT, "public/sim.wasm"),
];

export function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(join(ROOT, relative), "utf8")) as T;
}

export function loadData(): DataFiles {
  return {
    materials: readJson("data/materials.json"),
    forms: readJson("data/forms.json"),
    rules: readJson("data/rules.json"),
  };
}

export function loadWasm(): Uint8Array {
  for (const p of WASM_CANDIDATES) {
    if (existsSync(p)) return readFileSync(p);
  }
  throw new Error(
    `no sim.wasm found. Build it with:\n` +
      `  cargo build --release --target wasm32-unknown-unknown --manifest-path sim/Cargo.toml`,
  );
}

export async function createSubstrate(seed = 1n): Promise<Substrate> {
  return Substrate.create(loadWasm(), loadData(), seed);
}

// --- terminal formatting ---------------------------------------------------

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);

export const dim = wrap("2");
export const bold = wrap("1");
export const green = wrap("32");
export const red = wrap("31");
export const yellow = wrap("33");
export const cyan = wrap("36");

export function heading(text: string) {
  console.log(`\n${bold(text)}\n${dim("─".repeat(text.length))}`);
}

export function num(v: number, places = 2): string {
  return v.toFixed(places);
}
