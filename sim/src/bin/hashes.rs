//! Native half of the §12.4 rule 6 determinism test.
//!
//! Runs the same seeded soak the browser runs, on a completely different
//! target — x86-64 with a native code generator instead of wasm32 — and prints
//! the state hash at intervals. `tools/determinism.ts` runs the wasm half and
//! compares. If the two ever disagree, one of §12.4's six rules has been
//! broken, and the design is explicit that nothing else ships until it is
//! fixed.
//!
//! Usage: `hashes <data-dir> [ticks] [seed]`
//!
//! The data directory holds the packed blobs `tools/pack.ts` writes, so both
//! hosts read byte-identical input. That matters: a determinism test that lets
//! each host parse its own JSON is testing the parsers, not the simulation.

use std::env;
use std::fs;
use std::process::ExitCode;

use sim::form::FormTable;
use sim::material::MaterialTable;
use sim::scenarios;
use sim::sim::{Rules, Sim};

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    let dir = match args.get(1) {
        Some(d) => d.clone(),
        None => {
            eprintln!("usage: hashes <data-dir> [ticks] [seed]");
            eprintln!("       (run `node tools/pack.ts` first to produce the blobs)");
            return ExitCode::from(2);
        }
    };
    let ticks: u32 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(10_000);
    let seed: u64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(1);

    let read = |name: &str| -> Result<Vec<u8>, String> {
        fs::read(format!("{dir}/{name}")).map_err(|e| format!("{dir}/{name}: {e}"))
    };

    let materials = match read("materials.bin").map(|b| MaterialTable::decode(&b)) {
        Ok(Ok(t)) => t,
        Ok(Err(e)) => {
            eprintln!("materials.bin is not decodable: {e:?}");
            return ExitCode::FAILURE;
        }
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };
    let forms = match read("forms.bin").map(|b| FormTable::decode(&b)) {
        Ok(Ok(t)) => t,
        Ok(Err(e)) => {
            eprintln!("forms.bin is not decodable: {e:?}");
            return ExitCode::FAILURE;
        }
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };
    let rules = match read("rules.bin").map(|b| Rules::decode(&b)) {
        Ok(Ok(r)) => r,
        Ok(Err(e)) => {
            eprintln!("rules.bin is not decodable: {e:?}");
            return ExitCode::FAILURE;
        }
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };

    // Checkpoint every tenth of the run so a divergence can be bisected in
    // time rather than only reported at the end.
    let checkpoints = 10u32;
    let stride = (ticks / checkpoints).max(1);
    let mut s = Sim::new(seed);
    s.materials = materials;
    s.forms = forms;
    s.rules = rules;

    let mut done = 0u32;
    while done < ticks {
        let step = stride.min(ticks - done);
        scenarios::soak(&mut s, step);
        done += step;
        println!("{done} {:016x}", s.state_hash());
    }
    ExitCode::SUCCESS
}
