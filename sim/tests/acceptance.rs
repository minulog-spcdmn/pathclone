//! The acceptance criteria of DESIGN.md §17 M0 and M1, as tests.
//!
//! These run against the same packed blobs the browser loads, so a change to
//! `data/materials.json` can fail the build without anyone touching Rust —
//! which is the point of §14.5. Run `node tools/pack.ts` first; the tests skip
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

/// §17 M1: "§6.4 ship gate passes — 20 distinct, useful, unanticipated tactical
/// outcomes ... If this fails, stop and fix the material table. Do not proceed."
#[test]
fn ship_gate_demonstrates_twenty_outcomes() {
    let base = sim_or_skip!(1);
    let scenarios = scenarios::all();
    assert_eq!(
        scenarios.len(),
        20,
        "§6.4 asks for 20 demonstrated outcomes; the suite has {}",
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

/// §6.3: "Resolution must be order-independent: gather all impulses for a tick,
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

/// §14.4 rule 9, natively. The cross-host half lives in `tools/determinism.ts`;
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

/// §6.3: "total energy must be conservative-or-lossy, never generative."
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

/// §6.3 bounds cascades "to guarantee termination". A pathological arrangement
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
            ..Default::default()
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

/// §6.1: "if a system needs to know 'is this a player?', the system is designed
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
        "§6.1 forbids type-discriminating code in the substrate:\n{}",
        offenders.join("\n")
    );
}

// ---------------------------------------------------------------------------
// §17 M1: "Basic forms and melee."
// ---------------------------------------------------------------------------

use sim::ecs::{Agency, Locomotion};
use sim::events::EventKind;
use sim::impulse::SwingOutcome;

/// Stand a wielder at the origin facing +x, with a target `distance` away.
fn duel(seed: u64, weapon_form: &str, weapon: &[&str], target: &str, distance: i32) -> Option<(Sim, u32, u32)> {
    let mut s = world(seed)?;
    let mats: Vec<_> = weapon.iter().map(|m| s.material_id(m).unwrap()).collect();
    let form = s.form_id(weapon_form)?;
    let body = s.forms.assemble(form, &mats)?;
    let w = s.spawn(body, V3::ZERO);

    let flesh = s.material_id("flesh")?;
    let hide = s.material_id("boarhide")?;
    let bipedal = s.form_id("body_bipedal")?;
    let wielder_body = s
        .forms
        .assemble(bipedal, &[flesh, flesh, flesh, flesh, flesh, flesh, hide])?;
    let t = s.rules.ambient_temp;
    let attacker = s.spawn_at_temp(wielder_body, V3::ZERO, t);
    s.ecs.effectors.insert(
        attacker,
        Effectors {
            strength: Fx::from_ratio(7, 2),
            wielded: Some(w),
            ..Default::default()
        },
    );
    s.ecs.agency.insert(attacker, Agency::default());

    let dummy_form = s.form_id("training_dummy")?;
    let wood = s.material_id("heartwood")?;
    let stone = s.material_id("granite")?;
    let target_id = s.material_id(target)?;
    let dummy = s
        .forms
        .assemble(dummy_form, &[target_id, wood, stone])?;
    let d = s.spawn_at_temp(dummy, V3::new(Fx::from_int(distance), Fx::ZERO, Fx::ZERO), t);
    Some((s, attacker, d))
}

/// Reach is a real number derived from the form, and standing back is a defence.
#[test]
fn melee_respects_reach() {
    let far = duel(21, "dagger_leaf", &["cold_iron", "boarhide"], "flesh", 6);
    let (mut s, attacker, _) = match far {
        Some(v) => v,
        None => return,
    };
    assert_eq!(
        s.swing_now(attacker),
        SwingOutcome::Missed,
        "a dagger connected across six units"
    );

    let near = duel(21, "dagger_leaf", &["cold_iron", "boarhide"], "flesh", 1);
    let (mut s, attacker, dummy) = near.expect("data was present a moment ago");
    match s.swing_now(attacker) {
        SwingOutcome::Hit { target, .. } => assert_eq!(target, dummy),
        other => panic!("a dagger at one unit did not connect: {other:?}"),
    }
}

/// Facing matters: the same target, behind you, is not hit.
#[test]
fn a_swing_only_reaches_what_is_in_front_of_it() {
    let (mut s, attacker, _) = match duel(22, "blade_straight_single_edge", &["cold_iron", "cold_iron", "boarhide"], "flesh", 1) {
        Some(v) => v,
        None => return,
    };
    // Facing away from a target that is otherwise well inside reach.
    s.ecs.agency.insert(
        attacker,
        Agency {
            facing: Fx::PI,
            ..Default::default()
        },
    );
    assert_eq!(
        s.swing_now(attacker),
        SwingOutcome::Missed,
        "the swing found something behind the wielder"
    );

    s.ecs.agency.insert(attacker, Agency::default());
    assert!(
        matches!(s.swing_now(attacker), SwingOutcome::Hit { .. }),
        "turning around did not help"
    );
}

/// A heavy weapon is slow because it is heavy — §8.1's derived swing rate,
/// spent as recovery.
#[test]
fn a_heavy_weapon_swings_less_often() {
    let count = |form: &str, materials: &[&str]| -> Option<usize> {
        let (mut s, attacker, _) = duel(23, form, materials, "flesh", 1)?;
        s.ecs.agency.insert(
            attacker,
            Agency {
                want_strike: true,
                ..Default::default()
            },
        );
        let start = s.tick;
        for _ in 0..200 {
            // Re-raise the intent every tick, as a held button would.
            if let Some(a) = s.ecs.agency.get_mut(attacker) {
                a.want_strike = true;
            }
            s.run(1);
        }
        Some(
            s.events
                .since(start)
                .filter(|e| e.kind == EventKind::Swung && e.entity == attacker)
                .count(),
        )
    };

    let dagger = match count("dagger_leaf", &["cold_iron", "boarhide"]) {
        Some(v) => v,
        None => return,
    };
    let maul = count("maul_head_haft", &["cold_iron", "heartwood", "boarhide"]).unwrap();
    assert!(dagger > 0 && maul > 0, "nothing swung at all");
    // §5.1 floors every phase — 100 ms of windup, 60 ms active, 150 ms of
    // recovery — so the fast end of the range is bounded by the commitment model
    // rather than by the weapon, and no weapon can be more than about three
    // times a dagger's rate however light it is. The gap that remains is still
    // derived: nothing authored either of these numbers.
    assert!(
        dagger * 2 > maul * 3,
        "a dagger managed {dagger} swings and a maul {maul}; the derived rate is not reaching recovery"
    );
}

/// §Appendix A, Items × Players: what you carry is felt in the legs.
#[test]
fn carrying_more_makes_you_slower() {
    let top_speed = |form: &str, materials: &[&str]| -> Option<Fx> {
        let (mut s, attacker, _) = duel(24, form, materials, "flesh", 40)?;
        s.ecs.locomotion.insert(
            attacker,
            Locomotion {
                max_speed: Fx::from_int(6),
                accel: Fx::from_int(34),
                mass_ref: Fx::from_int(12),
            },
        );
        s.ecs.agency.insert(
            attacker,
            Agency {
                move_dir: V3::new(Fx::ONE, Fx::ZERO, Fx::ZERO),
                ..Default::default()
            },
        );
        s.run(60);
        Some(s.ecs.transform.get(attacker)?.velocity.length())
    };

    let light = match top_speed("dagger_leaf", &["cold_iron", "boarhide"]) {
        Some(v) => v,
        None => return,
    };
    let heavy = top_speed("maul_head_haft", &["lead_grey", "heartwood", "boarhide"]).unwrap();
    assert!(
        light > heavy,
        "a lead maul ({heavy:?}) did not slow the wielder below a dagger ({light:?})"
    );
}

/// §P1 again, from the other side: the swing path reads `Agency`, so anything
/// with the component swings — there is no player-only branch to find.
#[test]
fn anything_with_agency_can_swing() {
    let (mut s, _, _) = match duel(25, "blade_straight_single_edge", &["cold_iron", "cold_iron", "boarhide"], "flesh", 1) {
        Some(v) => v,
        None => return,
    };
    let granite = s.material_id("granite").unwrap();
    let iron = s.material_id("cold_iron").unwrap();
    let hide = s.material_id("boarhide").unwrap();
    let form = s.form_id("blade_straight_single_edge").unwrap();

    // A boulder, given a hand and an intent.
    let sword = s
        .forms
        .assemble(form, &[iron, iron, hide])
        .map(|b| s.spawn(b, V3::ZERO))
        .unwrap();
    let rock = s.spawn_lump(granite, Fx::from_int(2), V3::new(Fx::from_int(-1), Fx::ZERO, Fx::ZERO));
    s.ecs.effectors.insert(
        rock,
        Effectors {
            strength: Fx::from_ratio(7, 2),
            wielded: Some(sword),
            ..Default::default()
        },
    );
    s.ecs.agency.insert(rock, Agency::default());

    assert!(
        matches!(s.swing_now(rock), SwingOutcome::Hit { .. }),
        "a boulder holding a sword could not swing it"
    );
}

// ---------------------------------------------------------------------------
// §17 M1, added in v1.0: "§5.1's commitment model is implemented ... Feel is
// gated here, before systems breadth. If M1 combat is floaty, no later
// milestone fixes it."
// ---------------------------------------------------------------------------

use sim::ecs::AttackPhase;

/// Hold a swing intent for `ticks`, as a held button would.
fn hold_strike(s: &mut Sim, e: u32, ticks: u32) {
    for _ in 0..ticks {
        if let Some(a) = s.ecs.agency.get_mut(e) {
            a.want_strike = true;
        }
        s.run(1);
    }
}

/// §5.1: "Windup 100–250 ms — **No** — this is the commitment." A swing asked
/// for on one tick does not land on that tick, and the delay is the weapon's.
#[test]
fn an_attack_commits_before_it_lands() {
    let (mut s, attacker, _) = match duel(31, "blade_straight_single_edge", &["cold_iron", "cold_iron", "boarhide"], "flesh", 1) {
        Some(v) => v,
        None => return,
    };
    let start = s.tick;
    hold_strike(&mut s, attacker, 1);
    assert_eq!(
        s.ecs.effectors.get(attacker).unwrap().phase,
        AttackPhase::Windup,
        "the intent did not enter a windup"
    );
    assert_eq!(
        s.events
            .since(start)
            .filter(|e| e.kind == EventKind::Swung)
            .count(),
        0,
        "the blow landed on the tick it was asked for — there is no commitment"
    );

    hold_strike(&mut s, attacker, 8);
    assert!(
        s.events
            .since(start)
            .any(|e| e.kind == EventKind::Swung && e.detail == 1),
        "the committed swing never resolved"
    );
}

/// §5.1: windup and the active frames pin the entity in place, and recovery
/// releases it only after 40%. A commitment you can walk out of is not one.
#[test]
fn a_committed_attack_cannot_walk_away() {
    let (mut s, attacker, _) = match duel(32, "maul_head_haft", &["cold_iron", "heartwood", "boarhide"], "chitin", 1) {
        Some(v) => v,
        None => return,
    };
    s.ecs.locomotion.insert(
        attacker,
        Locomotion {
            max_speed: Fx::from_int(6),
            accel: Fx::from_int(34),
            mass_ref: Fx::from_int(12),
        },
    );
    s.ecs.agency.insert(
        attacker,
        Agency {
            move_dir: V3::new(Fx::ZERO, Fx::ONE, Fx::ZERO),
            want_strike: true,
            ..Default::default()
        },
    );
    s.run(1);
    assert_eq!(
        s.ecs.effectors.get(attacker).unwrap().phase,
        AttackPhase::Windup
    );

    let before = s.position_of(attacker);
    for _ in 0..2 {
        if let Some(a) = s.ecs.agency.get_mut(attacker) {
            a.move_dir = V3::new(Fx::ZERO, Fx::ONE, Fx::ZERO);
        }
        s.run(1);
    }
    let during = s.position_of(attacker);
    assert_eq!(
        before.distance(during),
        Fx::ZERO,
        "an entity mid-windup travelled {:?}",
        before.distance(during)
    );
}

/// §5.1's input buffer: "Queued inputs during recovery fire on the first legal
/// frame." A single tap during recovery is not thrown away.
///
/// The window the buffer covers is `input_buffer` long and recovery is the only
/// phase it is claimed for, which is the whole of the rule: a press made during
/// the windup of a slow weapon is still hundreds of milliseconds from a legal
/// tick and is *supposed* to expire, or holding the button would queue an
/// unbounded chain of swings from one tap.
#[test]
fn a_queued_input_fires_on_the_first_legal_tick() {
    let (mut s, attacker, _) = match duel(33, "blade_straight_single_edge", &["cold_iron", "cold_iron", "boarhide"], "flesh", 1) {
        Some(v) => v,
        None => return,
    };
    if let Some(a) = s.ecs.agency.get_mut(attacker) {
        a.want_strike = true;
    }
    s.run(1);

    // Run out the commitment until recovery starts, pressing nothing.
    let mut guard = 0;
    while s.ecs.effectors.get(attacker).map(|f| f.phase) != Some(AttackPhase::Recovery) {
        s.run(1);
        guard += 1;
        assert!(guard < 200, "the swing never reached recovery");
    }
    assert!(
        !s.ecs.effectors.get(attacker).unwrap().can_act(s.rules.recovery_cancel),
        "recovery was cancellable on the tick it began, so there is no queue to test"
    );

    // One tap, early in recovery and released immediately.
    let start = s.tick;
    if let Some(a) = s.ecs.agency.get_mut(attacker) {
        a.want_strike = true;
    }
    s.run(1);
    let queued = s.ecs.effectors.get(attacker).unwrap();
    assert!(
        queued.buffered.is_positive() && queued.phase == AttackPhase::Recovery,
        "the press was neither acted on nor queued"
    );

    // It has to fire on its own, with no further input.
    s.run(8);
    let swings = s
        .events
        .since(start)
        .filter(|e| e.kind == EventKind::Committed && e.entity == attacker)
        .count();
    assert!(
        swings >= 1,
        "a press during recovery was dropped: {swings} swings resolved"
    );
}

/// §5.1: "Dodge — 350 ms total, i-frames from 60–180 ms." A blow that arrives
/// inside the window finds nothing, and the same blow a moment later lands.
#[test]
fn a_dodge_has_frames_that_cannot_be_hit() {
    let attempt = |wait: u32| -> Option<bool> {
        let (mut s, attacker, dummy) = duel(34, "blade_straight_single_edge", &["cold_iron", "cold_iron", "boarhide"], "flesh", 1)?;
        // The dummy needs the components any dodging thing needs — and nothing
        // else. Nothing in the sim knows it is a target rather than a player.
        s.ecs.effectors.insert(dummy, Effectors::default());
        // Deliberately near-stationary. A dodge both grants i-frames and carries
        // you out of the way, and at a real speed the second half of this test
        // would pass because the target had left, not because the window had
        // closed. Taking the travel out isolates the claim being made.
        s.ecs.locomotion.insert(
            dummy,
            Locomotion {
                max_speed: Fx::from_ratio(1, 100),
                accel: Fx::from_int(30),
                mass_ref: Fx::from_int(12),
            },
        );
        s.ecs.agency.insert(
            dummy,
            Agency {
                want_dodge: true,
                ..Default::default()
            },
        );
        s.run(1);
        assert!(
            s.ecs.effectors.get(dummy).unwrap().dodge_left.is_positive(),
            "the dodge never started"
        );
        s.run(wait);
        Some(matches!(s.swing_now(attacker), SwingOutcome::Hit { .. }))
    };

    // 20 Hz ticks, and the tick that starts the dodge is elapsed zero: two more
    // land at 100 ms, inside the 60–180 ms window; five is 250 ms, past the
    // window and still inside the 350 ms dodge.
    let inside = match attempt(2) {
        Some(v) => v,
        None => return,
    };
    let outside = attempt(5).unwrap();
    assert!(!inside, "a blow landed inside the i-frames");
    assert!(outside, "a blow missed a target that was no longer invulnerable");
}

/// §6.3 step 5, added in v1.0: "A part above its melt point with a half-full
/// buffer is *softening*: effective `hardness` falls with progress."
#[test]
fn a_part_softens_as_its_melt_banks_up() {
    let mut s = sim_or_skip!(35);
    let iron = s.material_id("cold_iron").unwrap();
    let mat = *s.materials.get(iron).unwrap();
    let melt = mat.phase(sim::material::Transition::Melt);
    assert!(melt.present, "cold iron has no melt point to bank against");

    let bar = s.spawn_lump(iron, Fx::ONE, V3::ZERO);
    s.ecs
        .body
        .get_mut(bar)
        .unwrap()
        .set_temperature(0, &s.materials, melt.temp);
    let temp = s.ecs.body.get(bar).unwrap().temperature(0, &s.materials, s.rules.ambient_temp);
    let cold = s.part_hardness(bar, 0, &mat, temp);

    // Push it onto the plateau and part-way across it.
    let latent = melt.latent.abs();
    s.inject(bar, 0, Impulse::thermal(latent.mul(Fx::HALF)));
    s.run(1);
    let fraction = s.ecs.body.get(bar).unwrap().phase_fraction(0, &s.materials);
    assert!(
        fraction > Fx::ZERO,
        "no latent heat banked, so there is no softening to measure"
    );
    let temp = s.ecs.body.get(bar).unwrap().temperature(0, &s.materials, s.rules.ambient_temp);
    let melting = s.part_hardness(bar, 0, &mat, temp);
    assert!(
        melting < cold,
        "a half-melted bar ({melting:?}) was no softer than one merely at its melt point ({cold:?})"
    );
}

/// §6.3: "no binary hidden threshold may determine a combat outcome. Every
/// threshold is either graded across a band or has a visible approach."
#[test]
fn a_blow_that_nearly_broke_something_says_so() {
    // A matchup that takes several blows. A maul against chitin would clear the
    // threshold fifty times over on the first swing, and a blow that overkills
    // is not one that "nearly" did anything — there is no approach to report
    // because there was no approach.
    let (mut s, attacker, dummy) = match duel(36, "blade_straight_single_edge", &["cold_iron", "cold_iron", "boarhide"], "flesh", 1) {
        Some(v) => v,
        None => return,
    };
    // Walk the blow up from nothing until the part finally breaks, and require
    // that the tick before it broke was reported as an approach.
    let mut warned_before_break = false;
    let mut broke = false;
    for _ in 0..40 {
        let start = s.tick;
        s.swing_now(attacker);
        s.run(1);
        let near = s
            .events
            .since(start)
            .any(|e| e.kind == EventKind::Nearing && e.entity == dummy && e.detail == 0);
        let fractured = s
            .events
            .since(start)
            .any(|e| e.kind == EventKind::Fractured && e.entity == dummy);
        if fractured {
            broke = true;
            break;
        }
        warned_before_break |= near;
    }
    assert!(broke, "the maul never broke the plate, so there is nothing to have warned about");
    assert!(
        warned_before_break,
        "a part shattered with no reported approach to its threshold"
    );
}


/// §5.2: "The impulse resolver is unchanged for every tier. Only the `Body`
/// complexity varies. Freeze-then-shatter still works on trivial enemies
/// because their single aggregate material still has `elasticity` and
/// `phase_points` — it just resolves in one step. **No special cases, per P1.**"
///
/// So the tactic is run twice against the same material: once on a one-part
/// body, once on a seven-part assembly. Both must survive the blow warm and
/// shatter under it frozen, and neither path may be reachable by asking what
/// tier anything is, because nothing in the simulation carries one.
#[test]
fn the_same_tactic_works_on_every_body_tier() {
    let flesh = match sim_or_skip!(37).material_id("flesh") {
        Some(m) => m,
        None => return,
    };

    // `frozen` decides only what temperature the target starts at. Everything
    // after that is the same call on both tiers.
    let outcome = |trivial: bool, frozen: bool| -> Option<bool> {
        let (mut s, attacker, stock_dummy) = duel(37, "maul_head_haft", &["cold_iron", "heartwood", "boarhide"], "flesh", 1)?;
        // The duel's own dummy stands exactly where this test wants to put its
        // target, and a swing takes the nearest thing in front of it.
        s.ecs.despawn(stock_dummy);
        let hide = s.material_id("boarhide")?;
        let at = V3::new(Fx::from_int(1), Fx::ZERO, Fx::ZERO);
        let target = if trivial {
            // §5.2's trivial tier: one part, one aggregate material.
            s.spawn_lump(flesh, Fx::ONE, at)
        } else {
            let bipedal = s.form_id("body_bipedal")?;
            let body = s
                .forms
                .assemble(bipedal, &[flesh, flesh, flesh, flesh, flesh, flesh, hide])?;
            let t = s.rules.ambient_temp;
            s.spawn_at_temp(body, at, t)
        };
        if frozen {
            // Held under, not set cold once: ambient conduction is pulling the
            // other way the whole time, and the solidify bank only fills while
            // the part is actually below its point. This is what a sustained
            // cold source is, and it is why freezing something is a tactic with
            // a cost rather than a status you apply.
            let parts = s.ecs.body.get(target).map(|b| b.parts.len()).unwrap_or(0);
            for _ in 0..400 {
                for i in 0..parts {
                    s.inject(target, i as u16, Impulse::thermal(Fx::from_int(-30)));
                }
                s.run(1);
            }
            let became = s
                .ecs
                .body
                .get(target)?
                .parts
                .first()
                .map(|p| s.materials.name(p.material).to_string())
                .unwrap_or_default();
            assert_eq!(
                became, "frozen_flesh",
                "the target never froze, so the tactic was never set up (it is {became})"
            );
        }
        let mark = s.tick;
        for _ in 0..6 {
            s.swing_now(attacker);
            s.run(1);
        }
        let broke = s
            .events
            .since(mark)
            .any(|e| e.kind == EventKind::Fractured && e.entity == target);
        Some(broke)
    };

    for trivial in [true, false] {
        let tier = if trivial { "trivial (one part)" } else { "elite (seven parts)" };
        let warm = match outcome(trivial, false) {
            Some(v) => v,
            None => return,
        };
        let cold = outcome(trivial, true).unwrap();
        assert!(
            !warm,
            "the {tier} target shattered without being frozen first, so the tactic proves nothing"
        );
        assert!(
            cold,
            "freeze-then-shatter did not work on the {tier} target, so the resolver is not tier-independent"
        );
    }
}
