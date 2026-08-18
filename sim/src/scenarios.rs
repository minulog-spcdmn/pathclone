//! The §4.4 ship gate.
//!
//! > "Before any content work begins, the team must be able to demonstrate 20
//! > distinct, useful, unanticipated tactical outcomes produced solely by the
//! > material table and the impulse resolver in a bare test arena."
//!
//! Twenty of them, executable. Each one sets up a bare arena, does something,
//! and checks a claim about what happened, reporting the numbers it saw.
//!
//! The word doing the work in §4.4 is **unanticipated**. Nothing in this crate
//! implements freezing-then-shattering, chain lightning, fire spreading,
//! armour softening in a fire, salt water as a weapon, or grinding an edge
//! until the blade melts. Every one of those is `materials.json` meeting
//! `impulse.rs`. Grep the crate for "freeze", "chain", "fire", "explode" and
//! the only hits are in comments and in this file's prose.
//!
//! These run three ways from the same source: `tools/shipgate.ts` in CI,
//! `cargo test --test acceptance` natively, and the arena page in a browser.
//! What a stakeholder watches is the thing the build checks.

use crate::body::{Body, Part};
use crate::ecs::{Effectors, EntityId, V3};
use crate::events::EventKind;
use crate::fixed::Fx;
use crate::impulse::Impulse;
use crate::material::MaterialId;
use crate::sim::Sim;

pub struct Observation {
    pub passed: bool,
    pub note: String,
}

pub struct Scenario {
    pub name: &'static str,
    /// The tactical outcome being claimed, in the language a player would use.
    pub claim: &'static str,
    pub run: fn(&mut Sim) -> Observation,
}

fn ok(note: impl Into<String>) -> Observation {
    Observation {
        passed: true,
        note: note.into(),
    }
}

fn no(note: impl Into<String>) -> Observation {
    Observation {
        passed: false,
        note: note.into(),
    }
}

// ---------------------------------------------------------------------------
// Arena helpers. None of these are simulation code; they are the equivalent of
// a designer placing props.
// ---------------------------------------------------------------------------

macro_rules! need_material {
    ($sim:expr, $name:expr) => {
        match $sim.material_id($name) {
            Some(id) => id,
            None => return no(format!("materials.json has no \"{}\"", $name)),
        }
    };
}

macro_rules! need_form {
    ($sim:expr, $name:expr) => {
        match $sim.form_id($name) {
            Some(id) => id,
            None => return no(format!("forms.json has no \"{}\"", $name)),
        }
    };
}

macro_rules! assemble {
    ($sim:expr, $form:expr, [$($m:expr),* $(,)?], $at:expr) => {{
        let form = need_form!($sim, $form);
        let mats: Vec<MaterialId> = vec![$(need_material!($sim, $m)),*];
        match $sim.forms.assemble(form, &mats) {
            Some(body) => {
                let t = $sim.rules.ambient_temp;
                $sim.spawn_at_temp(body, $at, t)
            }
            None => return no(format!("could not assemble \"{}\"", $form)),
        }
    }};
}

fn f(n: i32) -> Fx {
    Fx::from_int(n)
}

fn r(n: i64, d: i64) -> Fx {
    Fx::from_ratio(n, d)
}

fn at(x: i32, y: i32, z: i32) -> V3 {
    V3::new(f(x), f(y), f(z))
}

/// Standard wielder: a body, a strength, and something in its hand.
fn wield(sim: &mut Sim, body: EntityId, weapon: EntityId) {
    sim.ecs.effectors.insert(
        body,
        Effectors {
            strength: r(7, 2),
            wielded: Some(weapon),
            recovery: Fx::ZERO,
        },
    );
}

fn material_of(sim: &Sim, e: EntityId, part: u16) -> MaterialId {
    sim.ecs
        .body
        .get(e)
        .and_then(|b| b.parts.get(part as usize))
        .map(|p| p.material)
        .unwrap_or(crate::material::NO_MATERIAL)
}

fn name_of(sim: &Sim, e: EntityId, part: u16) -> String {
    sim.materials.name(material_of(sim, e, part)).to_string()
}

fn integrity_of(sim: &Sim, e: EntityId, part: u16) -> Fx {
    sim.ecs
        .body
        .get(e)
        .and_then(|b| b.parts.get(part as usize))
        .map(|p| p.integrity)
        .unwrap_or(Fx::ZERO)
}

fn charge_of(sim: &Sim, e: EntityId, part: u16) -> Fx {
    sim.ecs
        .body
        .get(e)
        .and_then(|b| b.parts.get(part as usize))
        .map(|p| p.charge)
        .unwrap_or(Fx::ZERO)
}

fn temp_of(sim: &Sim, e: EntityId, part: u16) -> Fx {
    sim.ecs
        .body
        .get(e)
        .map(|b| b.temperature(part as usize, &sim.materials, sim.rules.ambient_temp))
        .unwrap_or(sim.rules.ambient_temp)
}

/// Did anything fracture on this entity since `tick`?
fn fractured(sim: &Sim, e: EntityId, since: u32) -> bool {
    sim.events
        .since(since)
        .any(|ev| ev.kind == EventKind::Fractured && ev.entity == e)
}

fn fracture_fragments(sim: &Sim, e: EntityId, since: u32) -> u8 {
    sim.events
        .since(since)
        .filter(|ev| ev.kind == EventKind::Fractured && ev.entity == e)
        .map(|ev| ev.detail)
        .max()
        .unwrap_or(0)
}

/// Whichever material a part became, following it through a graft.
fn any_part_is(sim: &Sim, e: EntityId, material: MaterialId) -> bool {
    sim.ecs
        .body
        .get(e)
        .map(|b| b.parts.iter().any(|p| p.attached && p.material == material))
        .unwrap_or(false)
}

fn discharge_sites(sim: &Sim, since: u32) -> Vec<EntityId> {
    let mut v: Vec<EntityId> = sim
        .events
        .since(since)
        .filter(|ev| ev.kind == EventKind::Discharged)
        .map(|ev| ev.entity)
        .collect();
    v.sort_unstable();
    v.dedup();
    v
}

/// Fixed-point values print through `Debug`, which is integer-only.
fn n(v: Fx) -> String {
    format!("{v:?}")
}

// ---------------------------------------------------------------------------
// 1 — freeze, then shatter
// ---------------------------------------------------------------------------

fn freeze_then_shatter(sim: &mut Sim) -> Observation {
    let maul = assemble!(sim, "maul_head_haft", ["cold_iron", "heartwood", "boarhide"], at(0, 0, 0));
    let hand = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(0, 0, 0));
    wield(sim, hand, maul);

    // Control: the same blow on a warm body.
    let warm = assemble!(sim, "plate_segment", ["flesh", "boarhide"], at(2, 0, 0));
    sim.strike(hand, warm, 0);
    sim.run(1);
    let warm_broke = fractured(sim, warm, 0);
    let warm_loss = Fx::ONE.sub(integrity_of(sim, warm, 0));

    // Now chill an identical body well below its solidify point and hit it the
    // same way. `Payload(thermal: -400)` is §7.1's own worked example.
    let chilled = assemble!(sim, "plate_segment", ["flesh", "boarhide"], at(6, 0, 0));
    sim.inject(chilled, 0, Impulse::thermal(f(-400)));
    sim.run(1);
    let became = name_of(sim, chilled, 0);
    let temp = temp_of(sim, chilled, 0);

    let mark = sim.tick;
    sim.strike(hand, chilled, 0);
    sim.run(1);
    let cold_broke = fractured(sim, chilled, mark);
    let fragments = fracture_fragments(sim, chilled, mark);

    let note = format!(
        "warm flesh: {} integrity lost, fractured={}. chilled to {} -> {}, same blow: fractured={} into {} pieces",
        n(warm_loss), warm_broke, n(temp), became, cold_broke, fragments
    );
    if became == "frozen_flesh" && cold_broke && !warm_broke {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 2 — a wet target conducts
// ---------------------------------------------------------------------------

fn wet_target_conducts(sim: &mut Sim) -> Observation {
    let dry = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(0, 0, 0));
    let wet = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(20, 0, 0));

    // A splash of water, attached to the torso. Nothing about this says
    // "wet"; it is a part made of a material with a high `conductivity`.
    let water = need_material!(sim, "water");
    if let Some(body) = sim.ecs.body.get_mut(wet) {
        let slot = body.parts.len() as u16;
        body.parts.push(Part::new(slot, water, r(3, 10)));
        body.add_link(0, slot);
    }
    let splash = sim
        .ecs
        .body
        .get(wet)
        .map(|b| b.parts.len() as u16 - 1)
        .unwrap_or(0);

    // The same charge arrives on the outermost layer of each: the hide of the
    // dry one, the water of the wet one. Deliberately below the threshold that
    // would make it arc, so what is being measured is conduction and nothing
    // else.
    sim.inject(dry, 6, Impulse::charge(r(6, 10)));
    sim.inject(wet, splash, Impulse::charge(r(6, 10)));
    sim.run(12);

    let dry_torso = charge_of(sim, dry, 0);
    let wet_torso = charge_of(sim, wet, 0);
    let note = format!(
        "after 12 ticks the charge reaching the torso is {} through hide, {} through water",
        n(dry_torso),
        n(wet_torso)
    );
    if wet_torso > dry_torso.mul(f(4)) {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 3 — chain lightning, which nobody implemented
// ---------------------------------------------------------------------------

fn charge_chains_outward(sim: &mut Sim) -> Observation {
    let copper = need_material!(sim, "copper");
    let mut line = Vec::new();
    for i in 0..5 {
        line.push(sim.spawn_lump(copper, Fx::ONE, at(i * 2, 0, 0)));
    }
    sim.inject(line[0], 0, Impulse::charge(f(80)));
    sim.run(20);

    let sites = discharge_sites(sim, 0);
    let reached = line
        .iter()
        .filter(|e| charge_of(sim, **e, 0) > r(1, 10))
        .count();
    let tail = charge_of(sim, line[4], 0);
    let note = format!(
        "one injection at the head; {} of 5 links ended up charged, {} of them arced, tail holds {}",
        reached,
        sites.len(),
        n(tail)
    );
    if reached >= 4 && sites.len() >= 3 && tail.is_positive() {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 4 — a point goes through plate; a hammer does not
// ---------------------------------------------------------------------------

fn point_defeats_plate(sim: &mut Sim) -> Observation {
    let spear = assemble!(sim, "spear_point_shaft", ["cold_iron", "heartwood", "boarhide"], at(0, 0, 0));
    let maul = assemble!(sim, "maul_head_haft", ["cold_iron", "heartwood", "boarhide"], at(0, 0, 0));
    let hand = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(0, 0, 0));

    let plate_a = assemble!(sim, "plate_segment", ["cold_iron", "boarhide"], at(3, 0, 0));
    wield(sim, hand, spear);
    let mark = sim.tick;
    sim.strike(hand, plate_a, 0);
    sim.run(1);
    let pierced = fractured(sim, plate_a, mark);

    let plate_b = assemble!(sim, "plate_segment", ["cold_iron", "boarhide"], at(9, 0, 0));
    wield(sim, hand, maul);
    let mark = sim.tick;
    sim.strike(hand, plate_b, 0);
    sim.run(1);
    let smashed = fractured(sim, plate_b, mark);
    let dent = Fx::ONE.sub(integrity_of(sim, plate_b, 0));

    let note = format!(
        "spear through iron plate: {}. maul on iron plate: broke={}, {} integrity lost",
        pierced,
        smashed,
        n(dent)
    );
    if pierced && !smashed {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 5 — a hammer beats armour it cannot dent
// ---------------------------------------------------------------------------

fn blunt_beats_brittle_armour(sim: &mut Sim) -> Observation {
    let maul = assemble!(sim, "maul_head_haft", ["cold_iron", "heartwood", "boarhide"], at(0, 0, 0));
    let sword = assemble!(sim, "blade_straight_single_edge", ["cold_iron", "cold_iron", "boarhide"], at(0, 0, 0));
    let hand = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(0, 0, 0));

    let carapace_a = assemble!(sim, "plate_segment", ["chitin", "sinew"], at(3, 0, 0));
    wield(sim, hand, sword);
    let mark = sim.tick;
    sim.strike(hand, carapace_a, 0);
    sim.run(1);
    let cut = fractured(sim, carapace_a, mark);
    let scratch = Fx::ONE.sub(integrity_of(sim, carapace_a, 0));

    let carapace_b = assemble!(sim, "plate_segment", ["chitin", "sinew"], at(9, 0, 0));
    wield(sim, hand, maul);
    let mark = sim.tick;
    sim.strike(hand, carapace_b, 0);
    sim.run(1);
    let shattered = fractured(sim, carapace_b, mark);

    // And the counter-case: the same hammer against something tough.
    let silk = assemble!(sim, "plate_segment", ["spider_silk", "sinew"], at(15, 0, 0));
    let mark = sim.tick;
    sim.strike(hand, silk, 0);
    sim.run(1);
    let silk_broke = fractured(sim, silk, mark);

    let note = format!(
        "sword on chitin: broke={}, only {} integrity lost. maul on chitin: broke={}. maul on spider silk: broke={}",
        cut, n(scratch), shattered, silk_broke
    );
    if !cut && shattered && !silk_broke {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 6 — the sharpest blade in the game destroys itself
// ---------------------------------------------------------------------------

fn brittle_blade_destroys_itself(sim: &mut Sim) -> Observation {
    let blade = assemble!(sim, "blade_straight_single_edge", ["obsidian", "cold_iron", "boarhide"], at(0, 0, 0));
    let hand = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(0, 0, 0));
    wield(sim, hand, blade);

    // Soft target first: this is the blade at its best.
    let meat = assemble!(sim, "plate_segment", ["flesh", "boarhide"], at(3, 0, 0));
    let mark = sim.tick;
    sim.strike(hand, meat, 0);
    sim.run(1);
    let cut_deep = fractured(sim, meat, mark);
    let blade_ok = !fractured(sim, blade, mark);

    // Now a boulder.
    let granite = need_material!(sim, "granite");
    let rock = sim.spawn_lump(granite, f(4), at(9, 0, 0));
    let mark = sim.tick;
    sim.strike(hand, rock, 0);
    sim.run(1);
    let blade_gone = fractured(sim, blade, mark);
    let rock_ok = !fractured(sim, rock, mark);

    let note = format!(
        "obsidian edge severs flesh in one blow ({cut_deep}) and survives ({blade_ok}); \
         against granite the blade fractures ({blade_gone}) and the rock is unmarked ({rock_ok})"
    );
    if cut_deep && blade_ok && blade_gone && rock_ok {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 7 — the anomaly is measurably, readably better
// ---------------------------------------------------------------------------

fn the_anomaly_survives(sim: &mut Sim) -> Observation {
    let granite = need_material!(sim, "granite");
    let hand = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(0, 0, 0));

    let obsidian_blade = assemble!(sim, "blade_straight_single_edge", ["obsidian", "cold_iron", "boarhide"], at(0, 0, 0));
    let rock_a = sim.spawn_lump(granite, f(4), at(3, 0, 0));
    wield(sim, hand, obsidian_blade);
    let mark = sim.tick;
    sim.strike(hand, rock_a, 0);
    sim.run(1);
    let obsidian_broke = fractured(sim, obsidian_blade, mark);

    let meteoric_blade = assemble!(sim, "blade_straight_single_edge", ["meteoric_steel", "cold_iron", "boarhide"], at(0, 0, 0));
    let rock_b = sim.spawn_lump(granite, f(4), at(9, 0, 0));
    wield(sim, hand, meteoric_blade);
    let mark = sim.tick;
    for _ in 0..6 {
        sim.strike(hand, rock_b, 0);
        sim.run(1);
    }
    let meteoric_broke = fractured(sim, meteoric_blade, mark);
    let left = integrity_of(sim, meteoric_blade, 0);

    // Both read as "very hard" — 8.50 against 8.20. The difference the player
    // can measure is toughness, and it is the whole story.
    let note = format!(
        "obsidian (hardness 8.50, toughness 0.04) broke on the first blow: {}. \
         meteoric steel (hardness 8.20, toughness 0.88) took six and kept {} integrity, broke={}",
        obsidian_broke,
        n(left),
        meteoric_broke
    );
    if obsidian_broke && !meteoric_broke {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 8 — an ice weapon near lava
// ---------------------------------------------------------------------------

fn quartz_blade_melts_near_lava(sim: &mut Sim) -> Observation {
    let blade = assemble!(sim, "blade_straight_single_edge", ["hoarfrost_quartz", "cold_iron", "boarhide"], at(0, 0, 0));
    let magma = need_material!(sim, "magma");
    let pool = sim.spawn_lump(magma, f(3), at(1, 0, 0));
    if let Some(body) = sim.ecs.body.get(pool) {
        let mut b = body.clone();
        b.set_temperature(0, &sim.materials, f(1200));
        sim.ecs.body.insert(pool, b);
    }

    let before = name_of(sim, blade, 0);
    sim.run(60);
    let after = name_of(sim, blade, 0);
    let temp = temp_of(sim, blade, 0);

    let note = format!(
        "blade started as {before} at ambient; 60 ticks beside a magma pool took it to {} and it is now {after}",
        n(temp)
    );
    if before == "hoarfrost_quartz" && after != before {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 9 — fire spreads between separate objects
// ---------------------------------------------------------------------------

fn fire_spreads(sim: &mut Sim) -> Observation {
    let pitch = need_material!(sim, "pitchwood");
    let heart = need_material!(sim, "heartwood");
    let lit = sim.spawn_lump(pitch, f(1), at(0, 0, 0));
    let near = sim.spawn_lump(heart, f(1), at(1, 0, 0));
    let far = sim.spawn_lump(heart, f(1), at(2, 0, 0));

    // Light the first one and then stop touching anything.
    sim.inject(lit, 0, Impulse::thermal(f(400)));
    sim.run(400);

    let a = name_of(sim, lit, 0);
    let b = name_of(sim, near, 0);
    let c = name_of(sim, far, 0);
    let note =
        format!("lit log -> {a}; the log beside it -> {b}; the one beyond that -> {c} (nothing was touched after the first)");
    if a == "ashwood_char" && b == "ashwood_char" && c == "ashwood_char" {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 10 — salt and water as a weapon
// ---------------------------------------------------------------------------

fn salt_water_freezes_a_body(sim: &mut Sim) -> Observation {
    let body = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(0, 0, 0));

    // A sack of rime salt, packed against the torso. It takes a sack: a body is
    // a large warm reservoir and its own freezing plateau has to be paid for
    // too, which is a limit nobody wrote down and every player will find.
    let salt = need_material!(sim, "rime_salt");
    let slot = {
        let b = match sim.ecs.body.get_mut(body) {
            Some(b) => b,
            None => return no("body vanished"),
        };
        let slot = b.parts.len() as u16;
        b.parts.push(Part::new(slot, salt, f(16)));
        b.add_link(0, slot);
        slot
    };
    if let Some(b) = sim.ecs.body.get(body) {
        let mut cloned = b.clone();
        cloned.set_temperature(slot as usize, &sim.materials, sim.rules.ambient_temp);
        sim.ecs.body.insert(body, cloned);
    }

    // Then a waterskin over it. Water carries the `solvent` tag; rime salt has
    // a `*:solvent` reaction whose released energy is negative.
    let solvent = 1u32; // bit 0 of materials.json's tag list
    sim.inject(body, slot, Impulse::corrosive(f(20), solvent));
    sim.run(600);

    let torso = name_of(sim, body, 0);
    let torso_temp = temp_of(sim, body, 0);
    let note = format!(
        "salt + water on the torso drove it to {} and it is now {torso}",
        n(torso_temp)
    );
    if torso == "frozen_flesh" {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 11 — an improvised bomb
// ---------------------------------------------------------------------------

fn improvised_bomb(sim: &mut Sim) -> Observation {
    let saltpetre = need_material!(sim, "saltpetre");
    let heart = need_material!(sim, "heartwood");
    let deposit = sim.spawn_lump(saltpetre, f(1), at(0, 0, 0));
    let bystander = sim.spawn_lump(heart, f(1), at(1, 0, 0));

    // Throw lamp oil at it. Oil carries `fuel`; saltpetre reacts with `*:fuel`.
    let fuel = 1u32 << 5;
    sim.inject(deposit, 0, Impulse::corrosive(f(2), fuel));
    sim.run(200);

    let made_blastfire = sim
        .events
        .as_slice()
        .iter()
        .any(|e| e.kind == EventKind::Reacted && sim.materials.name(e.material_after) == "blastfire");
    let bystander_state = name_of(sim, bystander, 0);
    let peak = sim
        .events
        .as_slice()
        .iter()
        .filter(|e| e.kind == EventKind::PhaseChange)
        .map(|e| e.a)
        .fold(Fx::MIN, Fx::max);

    let note = format!(
        "oil on a saltpetre deposit produced blastfire ({made_blastfire}); \
         hottest phase crossing recorded {}; the log standing next to it is now {bystander_state}",
        n(peak)
    );
    if made_blastfire && bystander_state == "ashwood_char" {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 12 — acid as a fire-starter
// ---------------------------------------------------------------------------

fn acid_starts_a_fire(sim: &mut Sim) -> Observation {
    let chalk = need_material!(sim, "chalkstone");
    let pitch = need_material!(sim, "pitchwood");

    // A block of chalk wedged into a woodpile.
    let mut pile = Body::new();
    pile.parts.push(Part::new(0, chalk, Fx::ONE));
    pile.parts.push(Part::new(1, pitch, Fx::ONE));
    pile.add_link(0, 1);
    let t = sim.rules.ambient_temp;
    let e = sim.spawn_at_temp(pile, at(0, 0, 0), t);

    let acid = 1u32 << 1;
    sim.inject(e, 0, Impulse::corrosive(f(3), acid));
    sim.run(400);

    let wood = name_of(sim, e, 1);
    let hottest = (0..3)
        .map(|p| temp_of(sim, e, p))
        .fold(Fx::MIN, Fx::max);
    let note = format!(
        "acid on the chalk block; the wood beside it is now {wood}, hottest part reached {}",
        n(hottest)
    );
    if wood == "ashwood_char" {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 13 — armour left in a fire stops being armour
// ---------------------------------------------------------------------------

fn heat_softens_armour(sim: &mut Sim) -> Observation {
    let sword = assemble!(sim, "blade_straight_single_edge", ["cold_iron", "cold_iron", "boarhide"], at(0, 0, 0));
    let hand = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(0, 0, 0));
    wield(sim, hand, sword);

    let cold_plate = assemble!(sim, "plate_segment", ["cold_iron", "boarhide"], at(3, 0, 0));
    sim.strike(hand, cold_plate, 0);
    sim.run(1);
    let cold_loss = Fx::ONE.sub(integrity_of(sim, cold_plate, 0));

    let hot_plate = assemble!(sim, "plate_segment", ["cold_iron", "boarhide"], at(9, 0, 0));
    if let Some(body) = sim.ecs.body.get(hot_plate) {
        let mut b = body.clone();
        b.set_temperature(0, &sim.materials, f(1200));
        sim.ecs.body.insert(hot_plate, b);
    }
    let hot_before = temp_of(sim, hot_plate, 0);
    sim.strike(hand, hot_plate, 0);
    sim.run(1);
    let hot_loss = Fx::ONE.sub(integrity_of(sim, hot_plate, 0));

    let note = format!(
        "the same sword and the same swing: cold plate loses {}, plate at {} loses {}",
        n(cold_loss),
        n(hot_before),
        n(hot_loss)
    );
    if hot_loss > cold_loss.mul(f(5)) {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 14 — grinding an edge heats it, and one material cannot take that
// ---------------------------------------------------------------------------

fn grinding_heats_the_edge(sim: &mut Sim) -> Observation {
    let iron_blade = assemble!(sim, "blade_straight_single_edge", ["cold_iron", "cold_iron", "boarhide"], at(0, 0, 0));
    let quartz_blade = assemble!(sim, "blade_straight_single_edge", ["hoarfrost_quartz", "cold_iron", "boarhide"], at(20, 0, 0));

    // Abrasive contact is nothing but a stream of small mechanical impulses
    // across a broad face — light enough that the stress never reaches either
    // blade's hardness, so no metal moves. There is no grinding system; the
    // `friction` column does all of this.
    // Two light passes per tick, not twenty at once: impulses landing in the
    // same tick accumulate, and twenty of them add up to a blow that shatters
    // the quartz outright. Which is itself worth knowing — the grindstone can
    // break the blade if you lean on it.
    for _ in 0..600 {
        sim.inject(iron_blade, 0, Impulse::kinetic(r(1, 2), Fx::ONE));
        sim.inject(iron_blade, 0, Impulse::kinetic(r(1, 2), Fx::ONE));
        sim.inject(quartz_blade, 0, Impulse::kinetic(r(1, 2), Fx::ONE));
        sim.inject(quartz_blade, 0, Impulse::kinetic(r(1, 2), Fx::ONE));
        sim.run(1);
    }

    let iron_temp = temp_of(sim, iron_blade, 0);
    let quartz_state = name_of(sim, quartz_blade, 0);
    let quartz_temp = temp_of(sim, quartz_blade, 0);
    let note = format!(
        "1200 passes of the grindstone: the iron edge reached {} and is still iron; \
         the hoarfrost quartz edge reached {} and is now {quartz_state}",
        n(iron_temp),
        n(quartz_temp)
    );
    if iron_temp > sim.rules.ambient_temp.add(f(20)) && quartz_state != "hoarfrost_quartz" {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 15 — a blunted blade becomes a different weapon
// ---------------------------------------------------------------------------

fn a_dull_blade_stops_cutting(sim: &mut Sim) -> Observation {
    let sword = assemble!(sim, "blade_straight_single_edge", ["cold_iron", "cold_iron", "boarhide"], at(0, 0, 0));
    let hand = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(0, 0, 0));
    wield(sim, hand, sword);

    let first = assemble!(sim, "plate_segment", ["flesh", "boarhide"], at(3, 0, 0));
    let mark = sim.tick;
    sim.strike(hand, first, 0);
    sim.run(1);
    let sharp_stress = sim
        .events
        .since(mark)
        .find(|e| e.kind == EventKind::Impact && e.entity == first)
        .map(|e| e.b)
        .unwrap_or(Fx::ZERO);

    // Now put some use on it: hard parries, each one well past the edge's
    // hardness and well short of breaking it.
    for _ in 0..4 {
        if integrity_of(sim, sword, 0) <= r(65, 100) {
            break;
        }
        sim.inject(sword, 0, Impulse::kinetic(f(2), r(9, 100)));
        sim.run(1);
    }
    let edge = integrity_of(sim, sword, 0);

    let second = assemble!(sim, "plate_segment", ["flesh", "boarhide"], at(15, 0, 0));
    let mark = sim.tick;
    sim.strike(hand, second, 0);
    sim.run(1);
    let dull_stress = sim
        .events
        .since(mark)
        .find(|e| e.kind == EventKind::Impact && e.entity == second)
        .map(|e| e.b)
        .unwrap_or(Fx::ZERO);

    let note = format!(
        "a fresh edge delivered {} stress; after wearing to {} integrity the same swing delivers {} — \
         the energy did not change, the contact area did",
        n(sharp_stress),
        n(edge),
        n(dull_stress)
    );
    if edge < Fx::ONE && dull_stress < sharp_stress && dull_stress.is_positive() {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 16 — corrode the armour, then the hammer works
// ---------------------------------------------------------------------------

fn corrosion_makes_plate_brittle(sim: &mut Sim) -> Observation {
    let maul = assemble!(sim, "maul_head_haft", ["cold_iron", "heartwood", "boarhide"], at(0, 0, 0));
    let hand = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(0, 0, 0));
    wield(sim, hand, maul);

    let sound = assemble!(sim, "plate_segment", ["cold_iron", "boarhide"], at(3, 0, 0));
    let mark = sim.tick;
    sim.strike(hand, sound, 0);
    sim.run(1);
    let sound_broke = fractured(sim, sound, mark);

    let corroded = assemble!(sim, "plate_segment", ["cold_iron", "boarhide"], at(9, 0, 0));
    let acid = 1u32 << 1;
    sim.inject(corroded, 0, Impulse::corrosive(f(4), acid));
    sim.run(3);
    let rust = need_material!(sim, "rust");
    let now_rust = any_part_is(sim, corroded, rust);

    // Hit whatever the acid left behind.
    let rusted_part = sim
        .ecs
        .body
        .get(corroded)
        .and_then(|b| {
            b.parts
                .iter()
                .position(|p| p.attached && p.material == rust)
        })
        .unwrap_or(0) as u16;
    let mark = sim.tick;
    sim.strike(hand, corroded, rusted_part);
    sim.run(1);
    let rust_broke = fractured(sim, corroded, mark);

    let note = format!(
        "the maul cannot break sound iron plate ({sound_broke}); after acid turned it to rust ({now_rust}) \
         the same blow shatters it ({rust_broke}) — toughness 0.62 became 0.10"
    );
    if !sound_broke && now_rust && rust_broke {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 17 — overcharge something with nowhere to send it
// ---------------------------------------------------------------------------

fn overcharge_cooks_the_isolated(sim: &mut Sim) -> Observation {
    let crystal = need_material!(sim, "stormcrystal");
    // Far from everything: the arc has no candidate inside `arc_radius`.
    let alone = sim.spawn_lump(crystal, Fx::ONE, at(0, 0, 0));
    let witness = sim.spawn_lump(crystal, Fx::ONE, at(200, 0, 0));

    sim.inject(alone, 0, Impulse::charge(f(2000)));
    sim.run(10);

    let state = name_of(sim, alone, 0);
    let temp = temp_of(sim, alone, 0);
    let witness_state = name_of(sim, witness, 0);
    let note = format!(
        "2000 charge into an isolated stormcrystal: it reached {} and is now {state}; \
         an identical crystal 200 away is still {witness_state}",
        n(temp)
    );
    if state != "stormcrystal" && witness_state == "stormcrystal" {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 18 — the arc picks the conductor, not the near thing
// ---------------------------------------------------------------------------

fn the_arc_picks_the_conductor(sim: &mut Sim) -> Observation {
    let copper = need_material!(sim, "copper");
    let void = need_material!(sim, "voidglass");

    let source = sim.spawn_lump(copper, Fx::ONE, at(0, 0, 0));
    // Voidglass is three times closer. Its conductivity is 0.005 against 6.00.
    let shield = sim.spawn_lump(void, Fx::ONE, at(1, 0, 0));
    let sink = sim.spawn_lump(copper, Fx::ONE, at(3, 0, 0));

    sim.inject(source, 0, Impulse::charge(f(40)));
    sim.run(6);

    let on_shield = charge_of(sim, shield, 0);
    let on_sink = charge_of(sim, sink, 0);
    let note = format!(
        "voidglass at distance 1 took {}; copper at distance 3 took {}",
        n(on_shield),
        n(on_sink)
    );
    if on_sink > on_shield.mul(f(5)) {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 19 — fragments are objects, and they are still hot
// ---------------------------------------------------------------------------

fn fragments_carry_their_heat(sim: &mut Sim) -> Observation {
    let maul = assemble!(sim, "maul_head_haft", ["cold_iron", "heartwood", "boarhide"], at(0, 0, 0));
    let hand = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(0, 0, 0));
    wield(sim, hand, maul);

    let chitin = need_material!(sim, "chitin");
    let plate = sim.spawn_lump(chitin, Fx::ONE, at(3, 0, 0));
    if let Some(body) = sim.ecs.body.get(plate) {
        let mut b = body.clone();
        b.set_temperature(0, &sim.materials, f(300));
        sim.ecs.body.insert(plate, b);
    }
    // The swing puts energy in, so the world's total is expected to move. What
    // must not move is the *unexplained* part of it, which is what the audit
    // measures.
    let baseline = sim.stored_energy();
    let before_count = sim.ecs.live_count();

    let mark = sim.tick;
    sim.strike(hand, plate, 0);
    sim.resolve_pending();
    let broke = fractured(sim, plate, mark);
    let after_count = sim.ecs.live_count();
    let audit = sim.audit(baseline);

    // Fragments are ordinary entities: find the hot ones the resolver made.
    let mut hot_fragments = 0;
    let mut fragment_temp = Fx::ZERO;
    for e in sim.ecs.live_ids() {
        if e == plate || e == maul || e == hand {
            continue;
        }
        if material_of(sim, e, 0) == chitin {
            hot_fragments += 1;
            fragment_temp = fragment_temp.max(temp_of(sim, e, 0));
        }
    }

    let surplus = audit.excess;
    let note = format!(
        "a plate at 300 shattered into {hot_fragments} independent entities (world went from {before_count} to {after_count}), \
         hottest fragment at {}; unexplained surplus after the split: {} \
         (injected {}, released {}, absorbed {}, dissipated {})",
        n(fragment_temp),
        n(surplus),
        n(audit.injected),
        n(audit.released),
        n(audit.absorbed),
        n(audit.dissipated)
    );
    if broke && hot_fragments >= 2 && fragment_temp > f(200) && surplus <= Fx::ONE {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------
// 20 — energy is never created
// ---------------------------------------------------------------------------

fn energy_is_never_created(sim: &mut Sim) -> Observation {
    // Everything at once: a bomb, a fire, an arc chain, and someone swinging a
    // hammer, for four hundred ticks.
    let saltpetre = need_material!(sim, "saltpetre");
    let pitch = need_material!(sim, "pitchwood");
    let copper = need_material!(sim, "copper");
    let chalk = need_material!(sim, "chalkstone");

    let deposit = sim.spawn_lump(saltpetre, f(2), at(0, 0, 0));
    let _log = sim.spawn_lump(pitch, f(2), at(1, 0, 0));
    let block = sim.spawn_lump(chalk, f(2), at(2, 0, 0));
    let mut chain = Vec::new();
    for i in 0..4 {
        chain.push(sim.spawn_lump(copper, Fx::ONE, at(4 + i * 2, 0, 0)));
    }
    let maul = assemble!(sim, "maul_head_haft", ["cold_iron", "heartwood", "boarhide"], at(0, 0, 0));
    let hand = assemble!(sim, "body_bipedal",
        ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"], at(0, 0, 0));
    wield(sim, hand, maul);
    let anvil = sim.spawn_lump(chalk, f(6), at(20, 0, 0));

    let baseline = sim.stored_energy();

    let fuel = 1u32 << 5;
    let acid = 1u32 << 1;
    sim.inject(deposit, 0, Impulse::corrosive(f(3), fuel));
    sim.inject(block, 0, Impulse::corrosive(f(3), acid));
    sim.inject(chain[0], 0, Impulse::charge(f(200)));

    let mut worst = Fx::MIN;
    for tick in 0..400 {
        if tick % 20 == 0 {
            sim.strike(hand, anvil, 0);
        }
        if tick % 50 == 0 {
            sim.inject(chain[0], 0, Impulse::charge(f(120)));
        }
        sim.run(1);
        worst = worst.max(sim.audit(baseline).excess);
    }

    let audit = sim.audit(baseline);
    let tolerance = f(1);
    let note = format!(
        "400 ticks of bomb, fire, arcs and hammer blows: injected {}, released {}, absorbed {}, dissipated {}, \
         stored {} — worst unexplained surplus at any point was {} (tolerance {})",
        n(audit.injected),
        n(audit.released),
        n(audit.absorbed),
        n(audit.dissipated),
        n(audit.stored),
        n(worst),
        n(tolerance)
    );
    if worst <= tolerance {
        ok(note)
    } else {
        no(note)
    }
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The determinism soak (§12.4 rule 6)
// ---------------------------------------------------------------------------

/// A busy, seeded world driven for many ticks, used to fingerprint the
/// simulation across hosts.
///
/// > "CI desync test: run 10,000 ticks of a seeded scenario on server and
/// > client builds, assert identical state hashes. This test runs on every
/// > commit. If it goes red, nothing else ships."
///
/// It deliberately touches every path that could diverge: fixed-point
/// multiply and divide, the in-crate `sqrt` behind every distance test,
/// fracture and its entity spawning, phase plateaus, tag reactions, arc target
/// selection, and the per-entity PRNG. A host whose `sqrt` differs in the last
/// bit fails here rather than three months into a playtest.
pub fn soak(sim: &mut Sim, ticks: u32) {
    let count = sim.materials.materials.len();
    if count == 0 {
        return;
    }
    let mut rng = crate::rng::Rng::seeded(sim.seed, 0xD1CE);

    // A ring of lumps cycling through the whole table, so every material's
    // properties are exercised rather than just the handful a scenario picks.
    let mut lumps = Vec::new();
    for i in 0..count.min(48) {
        let angle = Fx::TAU.mul(Fx::from_ratio(i as i64, count.max(1) as i64));
        let radius = f(3).add(Fx::from_ratio((i % 5) as i64, 2));
        let pos = V3::new(angle.cos().mul(radius), angle.sin().mul(radius), Fx::ZERO);
        let volume = r(1, 2).add(Fx::from_ratio((i % 7) as i64, 4));
        lumps.push(sim.spawn_lump(i as MaterialId, volume, pos));
    }

    // Something to swing, and something to swing it.
    let weapon = match (sim.form_id("maul_head_haft"), sim.material_id("cold_iron")) {
        (Some(form), Some(iron)) => {
            let wood = sim.material_id("heartwood").unwrap_or(iron);
            let hide = sim.material_id("boarhide").unwrap_or(iron);
            sim.forms
                .assemble(form, &[iron, wood, hide])
                .map(|b| sim.spawn(b, at(0, 0, 0)))
        }
        _ => None,
    };
    if let Some(w) = weapon {
        let hand = sim.spawn_lump(0, Fx::ONE, at(0, 1, 0));
        sim.ecs.effectors.insert(
            hand,
            Effectors {
                strength: r(7, 2),
                wielded: Some(w),
                recovery: Fx::ZERO,
            },
        );
        let mut resident: Vec<EntityId> = lumps.clone();
        resident.push(w);
        resident.push(hand);
        resident.sort_unstable();

        for t in 0..ticks {
            // Sweep the debris. Fracture spawns an entity per fragment and the
            // soak fractures constantly, so without this the population grows
            // without bound and the O(n²) radiant pass turns a ten-second test
            // into a ten-minute one. Sweeping on a fixed schedule in id order
            // keeps it deterministic, which is the only property that matters
            // here.
            if t % 24 == 0 {
                for e in sim.ecs.live_ids() {
                    if resident.binary_search(&e).is_err() {
                        sim.ecs.despawn(e);
                    }
                }
            }
            if t % 7 == 0 && !lumps.is_empty() {
                let target = lumps[(rng.below(lumps.len() as u32)) as usize];
                sim.strike(hand, target, 0);
            }
            if t % 11 == 0 && !lumps.is_empty() {
                let target = lumps[(rng.below(lumps.len() as u32)) as usize];
                sim.inject(target, 0, Impulse::thermal(rng.range(f(-200), f(600))));
            }
            if t % 13 == 0 && !lumps.is_empty() {
                let target = lumps[(rng.below(lumps.len() as u32)) as usize];
                sim.inject(target, 0, Impulse::charge(rng.range(Fx::ZERO, f(40))));
            }
            if t % 17 == 0 && !lumps.is_empty() {
                let target = lumps[(rng.below(lumps.len() as u32)) as usize];
                let tag = 1u32 << (rng.below(14) as u32);
                sim.inject(target, 0, Impulse::corrosive(rng.range(Fx::ZERO, f(3)), tag));
            }
            sim.run(1);
        }
    } else {
        sim.run(ticks);
    }
}

pub fn all() -> &'static [Scenario] {
    &[
        Scenario {
            name: "freeze then shatter",
            claim: "chill a body past its solidify point and it becomes a different material — brittle enough that a hammer blow which merely bruised it now breaks it apart",
            run: freeze_then_shatter,
        },
        Scenario {
            name: "a wet target conducts",
            claim: "water splashed on a target carries charge into it that hide would have stopped, so rain, rivers and a thrown waterskin are all tactical",
            run: wet_target_conducts,
        },
        Scenario {
            name: "charge chains outward",
            claim: "charge dumped into one object walks down a line of conductors it was never told about, losing energy at each hop",
            run: charge_chains_outward,
        },
        Scenario {
            name: "a point defeats plate",
            claim: "a spear concentrates the same energy into a tenth of the area and goes through armour that a hammer cannot dent",
            run: point_defeats_plate,
        },
        Scenario {
            name: "blunt beats brittle",
            claim: "a hammer cannot scratch a chitin plate and shatters it anyway, while the same blow does nothing at all to spider silk",
            run: blunt_beats_brittle_armour,
        },
        Scenario {
            name: "a brittle blade destroys itself",
            claim: "the sharpest edge in the game severs flesh in one blow and explodes against a rock, because the blow comes back into it",
            run: brittle_blade_destroys_itself,
        },
        Scenario {
            name: "the anomaly survives",
            claim: "two materials that both read as 'very hard' behave completely differently under repeated impact, and the difference is one visible number",
            run: the_anomaly_survives,
        },
        Scenario {
            name: "an ice weapon near lava",
            claim: "carrying a low-melting blade near a heat source destroys the weapon without anything attacking you",
            run: quartz_blade_melts_near_lava,
        },
        Scenario {
            name: "fire spreads",
            claim: "one lit log sets its neighbour alight, and that one sets the next, with nothing touching them after the first",
            run: fire_spreads,
        },
        Scenario {
            name: "salt water freezes a body",
            claim: "an endothermic dissolution chills what it is sitting on hard enough to freeze it solid — two harmless things making a weapon",
            run: salt_water_freezes_a_body,
        },
        Scenario {
            name: "an improvised bomb",
            claim: "oil thrown on an oxidiser deposit produces an unstable compound that ignites itself and burns down what is standing nearby",
            run: improvised_bomb,
        },
        Scenario {
            name: "acid starts a fire",
            claim: "acid on the right mineral is exothermic enough to light the woodpile it was wedged into",
            run: acid_starts_a_fire,
        },
        Scenario {
            name: "heat softens armour",
            claim: "armour left near a fire loses most of its hardness, and a sword that skated off it now bites",
            run: heat_softens_armour,
        },
        Scenario {
            name: "grinding heats the edge",
            claim: "sharpening is friction, friction is heat, and one prized blade material cannot survive being sharpened",
            run: grinding_heats_the_edge,
        },
        Scenario {
            name: "a dull blade stops cutting",
            claim: "a worn edge spreads the same energy over more area, so the weapon quietly turns from a cutting tool into a club",
            run: a_dull_blade_stops_cutting,
        },
        Scenario {
            name: "corrosion makes plate brittle",
            claim: "acid does little damage but changes what the armour is made of, and the hammer that failed now works",
            run: corrosion_makes_plate_brittle,
        },
        Scenario {
            name: "overcharge cooks the isolated",
            claim: "charge with nowhere to arc becomes heat in place, so an isolated battery destroys itself and a distant one does not",
            run: overcharge_cooks_the_isolated,
        },
        Scenario {
            name: "the arc picks the conductor",
            claim: "an arc crosses three times the distance to reach a conductor rather than jump to the insulator beside it, so shielding is a material choice",
            run: the_arc_picks_the_conductor,
        },
        Scenario {
            name: "fragments carry their heat",
            claim: "what breaks off a shattered object is an object, with its share of the heat still in it — hot shrapnel, not a particle effect",
            run: fragments_carry_their_heat,
        },
        Scenario {
            name: "energy is never created",
            claim: "a bomb, a fire, an arc chain and a hammer running together for 400 ticks never produce a joule that was not injected or released",
            run: energy_is_never_created,
        },
    ]
}
