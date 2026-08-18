//! The acceptance criteria of DESIGN.md §15 M0 and M1, as tests.
//!
//! These run against the same packed blobs the browser loads, so a change to
//! `data/materials.json` can fail the build without anyone touching Rust —
//! which is the point of §12.5. Run `node tools/pack.ts` first; the tests skip
//! with a clear message rather than failing if the blobs are absent, because a
//! missing build step is not a broken simulation.

use sim::body::{Body, Part};
use sim::ecs::{Effectors, V3};
use sim::fixed::Fx;
use sim::form::FormTable;
use sim::impulse::Impulse;
use sim::material::MaterialTable;
use sim::scenarios;
use sim::sim::{Rules, Sim};

const DATA: &str = "../build";

/// Load a world with the shipped data, or `None` if it has not been packed.
fn world(seed: u64) -> Option<Sim> {
    let materials = MaterialTable::decode(&std::fs::read(format!("{DATA}/materials.bin")).ok()?).ok()?;
    let forms = FormTable::decode(&std::fs::read(format!("{DATA}/forms.bin")).ok()?).ok()?;
    let rules = Rules::decode(&std::fs::read(format!("{DATA}/rules.bin")).ok()?).ok()?;
    let mut s = Sim::new(seed);
    s.materials = materials;
    s.forms = forms;
    s.rules = rules;
    Some(s)
}

macro_rules! sim_or_skip {
    ($seed:expr) => {
        match world($seed) {
            Some(s) => s,
            None => {
                eprintln!("skipping: run `node tools/pack.ts` to produce {DATA}/*.bin");
                return;
            }
        }
    };
}

/// §15 M1: "§4.4 ship gate passes — 20 distinct, useful, unanticipated tactical
/// outcomes ... If this fails, stop and fix the material table. Do not proceed."
#[test]
fn ship_gate_demonstrates_twenty_outcomes() {
    let base = sim_or_skip!(1);
    let scenarios = scenarios::all();
    assert_eq!(
        scenarios.len(),
        20,
        "§4.4 asks for 20 demonstrated outcomes; the suite has {}",
        scenarios.len()
    );

    let mut failed = Vec::new();
    for s in scenarios {
        let mut sim = Sim::new(base.seed);
        sim.materials = base.materials.clone();
        sim.forms = base.forms.clone();
        sim.rules = base.rules;
        let obs = (s.run)(&mut sim);
        if !obs.passed {
            failed.push(format!("  {} — {}", s.name, obs.note));
        }
    }
    assert!(
        failed.is_empty(),
        "the ship gate is closed:\n{}",
        failed.join("\n")
    );
}

/// §4.3: "Resolution must be order-independent: gather all impulses for a tick,
/// then apply. Otherwise multiplayer desyncs and hit-order exploits appear."
#[test]
fn impulse_resolution_is_order_independent() {
    let base = sim_or_skip!(7);

    // A spread of impulses over a spread of parts, deliberately including
    // several landing on the same part in one tick.
    let recipe: Vec<(usize, u16, Impulse)> = vec![
        (0, 0, Impulse::kinetic(Fx::from_int(6), Fx::from_ratio(1, 10))),
        (0, 0, Impulse::thermal(Fx::from_int(400))),
        (0, 1, Impulse::charge(Fx::from_int(30))),
        (1, 0, Impulse::corrosive(Fx::from_int(2), 1 << 1)),
        (1, 0, Impulse::kinetic(Fx::from_int(3), Fx::ONE)),
        (2, 0, Impulse::thermal(Fx::from_int(-500))),
        (2, 0, Impulse::kinetic(Fx::from_int(9), Fx::from_ratio(3, 100))),
        (1, 1, Impulse::charge(Fx::from_int(12))),
        (0, 0, Impulse::corrosive(Fx::from_int(1), 1)),
        (2, 0, Impulse::charge(Fx::from_int(8))),
    ];

    let build = |base: &Sim| -> (Sim, Vec<u32>) {
        let mut s = Sim::new(base.seed);
        s.materials = base.materials.clone();
        s.forms = base.forms.clone();
        s.rules = base.rules;
        let mut targets = Vec::new();
        for (i, name) in ["cold_iron", "flesh", "hoarfrost_quartz"].iter().enumerate() {
            let id = s.material_id(name).expect("material missing from the table");
            let mut body = Body::new();
            body.parts.push(Part::new(0, id, Fx::ONE));
            body.parts.push(Part::new(1, id, Fx::from_ratio(1, 2)));
            body.add_link(0, 1);
            let t = s.rules.ambient_temp;
            let e = s.spawn_at_temp(body, V3::new(Fx::from_int(i as i32 * 2), Fx::ZERO, Fx::ZERO), t);
            targets.push(e);
        }
        (s, targets)
    };

    let run = |order: &[usize]| -> u64 {
        let (mut s, targets) = build(&base);
        for &i in order {
            let (target, part, imp) = recipe[i];
            s.inject(targets[target], part, imp);
        }
        s.run(20);
        s.state_hash()
    };

    let forward: Vec<usize> = (0..recipe.len()).collect();
    let expected = run(&forward);

    // Several orderings, including reversed and a couple of shuffles from a
    // seeded generator so the test itself stays deterministic.
    let mut rng = sim::rng::Rng::seeded(99, 1);
    for attempt in 0..12 {
        let mut order = forward.clone();
        if attempt == 0 {
            order.reverse();
        } else {
            for i in (1..order.len()).rev() {
                let j = rng.below((i + 1) as u32) as usize;
                order.swap(i, j);
            }
        }
        assert_eq!(
            run(&order),
            expected,
            "hit order changed the outcome (attempt {attempt}, order {order:?})"
        );
    }
}

/// §12.4 rule 6, natively. The cross-host half lives in `tools/determinism.ts`;
/// this half catches a regression without needing a browser.
#[test]
fn the_soak_is_reproducible() {
    let mut a = sim_or_skip!(1);
    let mut b = sim_or_skip!(1);
    scenarios::soak(&mut a, 2_000);
    scenarios::soak(&mut b, 2_000);
    assert_eq!(a.state_hash(), b.state_hash(), "same seed, different result");

    let mut c = sim_or_skip!(2);
    scenarios::soak(&mut c, 2_000);
    assert_ne!(
        a.state_hash(),
        c.state_hash(),
        "different seeds produced identical worlds, so the seed is not reaching the simulation"
    );
}

/// §4.3: "total energy must be conservative-or-lossy, never generative."
#[test]
fn energy_is_never_generated() {
    let mut s = sim_or_skip!(3);
    let baseline = s.stored_energy();
    scenarios::soak(&mut s, 3_000);
    let audit = s.audit(baseline);
    assert!(
        audit.is_conservative(Fx::ONE),
        "the world gained {:?} of unexplained energy over 3000 ticks (injected {:?}, released {:?}, absorbed {:?}, dissipated {:?})",
        audit.excess,
        audit.injected,
        audit.released,
        audit.absorbed,
        audit.dissipated
    );
}

/// §4.3 bounds cascades "to guarantee termination". A pathological arrangement
/// — a dense cluster of highly conductive parts, massively overcharged — must
/// still finish the tick.
#[test]
fn cascades_terminate() {
    let mut s = sim_or_skip!(5);
    let copper = match s.material_id("copper") {
        Some(m) => m,
        None => return,
    };
    let mut ids = Vec::new();
    for i in 0..40 {
        ids.push(s.spawn_lump(
            copper,
            Fx::ONE,
            V3::new(Fx::from_ratio(i as i64, 4), Fx::ZERO, Fx::ZERO),
        ));
    }
    for id in &ids {
        s.inject(*id, 0, Impulse::charge(Fx::from_int(5_000)));
    }
    // If the cascade bound were missing this would not return.
    s.run(50);
    assert!(s.pending_count() == 0, "impulses were still in flight after the tick");
}

/// §P1: "A designer can take any property of the player character ... and give
/// it to a rock, without writing code."
///
/// The strongest form of this the crate can assert: an entity that is nothing
/// but a lump of stone, handed the same `Effectors` component a person has,
/// swings a sword and does damage through the identical code path.
#[test]
fn a_rock_can_wield_a_sword() {
    let mut s = sim_or_skip!(11);
    let (granite, iron, hide) = match (
        s.material_id("granite"),
        s.material_id("cold_iron"),
        s.material_id("boarhide"),
    ) {
        (Some(a), Some(b), Some(c)) => (a, b, c),
        _ => return,
    };
    let form = match s.form_id("blade_straight_single_edge") {
        Some(f) => f,
        None => return,
    };
    let sword = s
        .forms
        .assemble(form, &[iron, iron, hide])
        .map(|b| s.spawn(b, V3::ZERO))
        .expect("form assembly failed");

    let rock = s.spawn_lump(granite, Fx::from_int(2), V3::ZERO);
    s.ecs.effectors.insert(
        rock,
        Effectors {
            strength: Fx::from_ratio(7, 2),
            wielded: Some(sword),
        },
    );

    let target = s.spawn_lump(
        s.material_id("flesh").expect("flesh missing"),
        Fx::ONE,
        V3::new(Fx::from_int(2), Fx::ZERO, Fx::ZERO),
    );
    let profile = s.strike(rock, target, 0).expect("the rock could not swing");
    s.run(1);

    assert!(
        profile.kinetic > Fx::ZERO,
        "the swing delivered no energy"
    );
    let hurt = s
        .ecs
        .body
        .get(target)
        .map(|b| b.parts[0].integrity < Fx::ONE)
        .unwrap_or(false)
        || !s.ecs.is_alive(target);
    assert!(hurt, "the target was untouched by a rock holding a sword");
}

/// §4.1: "if a system needs to know 'is this a player?', the system is designed
/// wrong." A cheap structural check that no such branch has crept in.
#[test]
fn no_system_asks_what_kind_of_entity_it_is_looking_at() {
    let mut offenders = Vec::new();
    for entry in std::fs::read_dir("src").expect("src is readable") {
        let path = entry.expect("readable entry").path();
        if path.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }
        // The scenarios file is arena setup, not simulation, and names things
        // freely; everything else is the substrate.
        if path.file_name().and_then(|n| n.to_str()) == Some("scenarios.rs") {
            continue;
        }
        let text = std::fs::read_to_string(&path).expect("readable file");
        for (n, line) in text.lines().enumerate() {
            let code = line.split("//").next().unwrap_or("");
            for needle in ["is_player", "is_enemy", "is_item", "EntityKind", "entity_type"] {
                if code.contains(needle) {
                    offenders.push(format!("{}:{} {}", path.display(), n + 1, line.trim()));
                }
            }
        }
    }
    assert!(
        offenders.is_empty(),
        "§4.1 forbids type-discriminating code in the substrate:\n{}",
        offenders.join("\n")
    );
}
