/**
 * Build the simulation crate for the browser and put the module where the
 * arena can fetch it.
 *
 * The wasm is committed so `npm install && npm run dev` works without a Rust
 * toolchain; this script is what regenerates it after a change to the crate.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = join(ROOT, "sim/Cargo.toml");
const artifact = join(ROOT, "sim/target/wasm32-unknown-unknown/release/sim.wasm");
const destination = join(ROOT, "public/sim.wasm");

const run = (cmd, args) => {
  process.stdout.write(`  ${cmd} ${args.join(" ")}\n`);
  execFileSync(cmd, args, { stdio: "inherit", cwd: ROOT });
};

try {
  // `cargo rustc --crate-type cdylib` rather than a cdylib declaration in
  // Cargo.toml: the crate is an rlib for native builds and tests, and only
  // becomes a dynamic module when it is being built for the browser.
  run("cargo", [
    "rustc",
    "--release",
    "--lib",
    "--crate-type",
    "cdylib",
    "--target",
    "wasm32-unknown-unknown",
    "--manifest-path",
    manifest,
  ]);
} catch {
  console.error(
    "\ncargo failed. The wasm32 target may be missing:\n" +
      "  rustup target add wasm32-unknown-unknown\n",
  );
  process.exit(1);
}

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(artifact, destination);

const kb = (statSync(destination).size / 1024).toFixed(1);
console.log(`\n  public/sim.wasm  ${kb} kB`);
console.log(`  (§12.2 budgets the whole initial download at 20 MB, so this is comfortable)\n`);
