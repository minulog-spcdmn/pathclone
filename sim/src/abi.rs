//! Hand-written C ABI over wasm.
//!
//! No `wasm-bindgen`, no `serde`, no build-time codegen — §12.1 makes
//! host-agnosticism a hard requirement and the cheapest way to keep that honest
//! is for the crate to have no way of knowing a host exists. The host writes
//! bytes into linear memory, calls a function, and reads bytes back.
//!
//! Fixed-point values cross the boundary as raw `i64` (JavaScript `BigInt`), so
//! nothing is ever routed through a `double` on the way in or out.

use core::cell::RefCell;

use crate::body::Body;
use crate::ecs::V3;
use crate::fixed::Fx;
use crate::form::FormTable;
use crate::impulse::Impulse;
use crate::material::{MaterialId, MaterialTable};
use crate::sim::{Rules, Sim};

thread_local! {
    static SIM: RefCell<Sim> = RefCell::new(Sim::new(1));
    static SCRATCH: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn with_sim<R>(f: impl FnOnce(&mut Sim) -> R) -> R {
    SIM.with(|s| f(&mut s.borrow_mut()))
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

/// Reserve `len` bytes the host can write into. Returns a pointer into linear
/// memory, or 0.
#[no_mangle]
pub extern "C" fn sim_alloc(len: u32) -> u32 {
    SCRATCH.with(|s| {
        let mut b = s.borrow_mut();
        b.clear();
        b.resize(len as usize, 0);
        b.as_ptr() as u32
    })
}

fn scratch_slice(ptr: u32, len: u32) -> Vec<u8> {
    SCRATCH.with(|s| {
        let b = s.borrow();
        let base = b.as_ptr() as u32;
        if ptr == base && len as usize <= b.len() {
            b[..len as usize].to_vec()
        } else {
            // The host handed back something other than the scratch buffer.
            // Reading arbitrary linear memory is only safe because the host and
            // this module share one address space by construction.
            unsafe { core::slice::from_raw_parts(ptr as *const u8, len as usize) }.to_vec()
        }
    })
}

fn publish(bytes: Vec<u8>) -> u32 {
    OUT.with(|o| {
        let mut b = o.borrow_mut();
        *b = bytes;
        b.as_ptr() as u32
    })
}

#[no_mangle]
pub extern "C" fn sim_out_len() -> u32 {
    OUT.with(|o| o.borrow().len() as u32)
}

/// Pointer to the last published buffer, for calls whose return value is
/// something other than the pointer.
#[no_mangle]
pub extern "C" fn sim_out_ptr() -> u32 {
    OUT.with(|o| o.borrow().as_ptr() as u32)
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn sim_init(seed: i64) {
    SIM.with(|s| {
        let old = s.borrow();
        let (materials, forms, rules) = (old.materials.clone(), old.forms.clone(), old.rules);
        drop(old);
        let mut fresh = Sim::new(seed as u64);
        fresh.materials = materials;
        fresh.forms = forms;
        fresh.rules = rules;
        *s.borrow_mut() = fresh;
    });
}

/// 0 on success, negative on a decode error.
#[no_mangle]
pub extern "C" fn sim_load_materials(ptr: u32, len: u32) -> i32 {
    let buf = scratch_slice(ptr, len);
    match MaterialTable::decode(&buf) {
        Ok(t) => with_sim(|s| {
            s.materials = t;
            0
        }),
        Err(_) => -1,
    }
}

#[no_mangle]
pub extern "C" fn sim_load_forms(ptr: u32, len: u32) -> i32 {
    let buf = scratch_slice(ptr, len);
    match FormTable::decode(&buf) {
        Ok(t) => with_sim(|s| {
            s.forms = t;
            0
        }),
        Err(_) => -1,
    }
}

#[no_mangle]
pub extern "C" fn sim_load_rules(ptr: u32, len: u32) -> i32 {
    let buf = scratch_slice(ptr, len);
    match Rules::decode(&buf) {
        Ok(r) => with_sim(|s| {
            s.rules = r;
            0
        }),
        Err(_) => -1,
    }
}

#[no_mangle]
pub extern "C" fn sim_step(ticks: u32) {
    with_sim(|s| s.run(ticks));
}

#[no_mangle]
pub extern "C" fn sim_tick() -> u32 {
    with_sim(|s| s.tick)
}

#[no_mangle]
pub extern "C" fn sim_hash() -> i64 {
    with_sim(|s| s.state_hash() as i64)
}

#[no_mangle]
pub extern "C" fn sim_entity_count() -> u32 {
    with_sim(|s| s.ecs.live_count() as u32)
}

#[no_mangle]
pub extern "C" fn sim_stored_energy() -> i64 {
    with_sim(|s| s.stored_energy().raw())
}

/// §4.3's inequality, evaluated against a caller-supplied baseline.
///
/// Returns `stored - (baseline + injected + released - absorbed - dissipated)`.
/// Anything meaningfully positive means the simulation invented energy, which
/// the design calls the #1 exploit vector.
#[no_mangle]
pub extern "C" fn sim_audit_excess(baseline: i64) -> i64 {
    with_sim(|s| s.audit(Fx::from_raw(baseline)).excess.raw())
}

/// Ledger fields: 0 injected, 1 released, 2 absorbed, 3 dissipated.
#[no_mangle]
pub extern "C" fn sim_ledger(field: u32) -> i64 {
    with_sim(|s| {
        let l = s.ledger;
        match field {
            0 => l.injected.raw(),
            1 => l.released.raw(),
            2 => l.absorbed.raw(),
            3 => l.dissipated.raw(),
            _ => 0,
        }
    })
}

// ---------------------------------------------------------------------------
// World construction
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn sim_spawn_lump(material: u32, volume: i64, x: i64, y: i64, z: i64, temp: i64) -> u32 {
    with_sim(|s| {
        let e = s.spawn_lump(
            material as MaterialId,
            Fx::from_raw(volume),
            V3::new(Fx::from_raw(x), Fx::from_raw(y), Fx::from_raw(z)),
        );
        if let Some(body) = s.ecs.body.get(e) {
            let mut b = body.clone();
            for i in 0..b.parts.len() {
                b.set_temperature(i, &s.materials, Fx::from_raw(temp));
            }
            s.ecs.body.insert(e, b);
        }
        e
    })
}

/// Assemble a form from the material ids written into the scratch buffer as
/// `u16` little-endian, one per slot.
#[no_mangle]
pub extern "C" fn sim_assemble(
    form: u32,
    mats_ptr: u32,
    mats_len: u32,
    x: i64,
    y: i64,
    z: i64,
    temp: i64,
) -> u32 {
    let raw = scratch_slice(mats_ptr, mats_len);
    let mats: Vec<MaterialId> = raw
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    with_sim(|s| match s.forms.assemble(form as u16, &mats) {
        Some(body) => s.spawn_at_temp(
            body,
            V3::new(Fx::from_raw(x), Fx::from_raw(y), Fx::from_raw(z)),
            Fx::from_raw(temp),
        ),
        None => u32::MAX,
    })
}

/// Attach a part of one body to another entity's assembly graph is not a thing
/// at M1; this instead grafts a fresh part onto an existing body — how a
/// splash of thrown liquid ends up *on* a target rather than beside it.
#[no_mangle]
pub extern "C" fn sim_graft(entity: u32, material: u32, volume: i64, temp: i64, link_to: u32) -> i32 {
    with_sim(|s| {
        let temp = Fx::from_raw(temp);
        let body = match s.ecs.body.get(entity) {
            Some(b) => b.clone(),
            None => return -1,
        };
        let mut b = body;
        let idx = b.parts.len() as u16;
        b.parts
            .push(crate::body::Part::new(idx, material as MaterialId, Fx::from_raw(volume)));
        b.add_link(idx, link_to as u16);
        b.set_temperature(idx as usize, &s.materials, temp);
        s.ecs.body.insert(entity, b);
        idx as i32
    })
}

#[no_mangle]
pub extern "C" fn sim_set_effectors(entity: u32, strength: i64, wielded: i64) {
    with_sim(|s| {
        s.ecs.effectors.insert(
            entity,
            crate::ecs::Effectors {
                strength: Fx::from_raw(strength),
                wielded: if wielded < 0 {
                    None
                } else {
                    Some(wielded as u32)
                },
            },
        );
    });
}

#[no_mangle]
pub extern "C" fn sim_set_part_temp(entity: u32, part: u32, temp: i64) -> i32 {
    with_sim(|s| {
        let materials = s.materials.clone();
        match s.ecs.body.get_mut(entity) {
            Some(b) if (part as usize) < b.parts.len() => {
                b.set_temperature(part as usize, &materials, Fx::from_raw(temp));
                0
            }
            _ => -1,
        }
    })
}

#[no_mangle]
pub extern "C" fn sim_set_part_charge(entity: u32, part: u32, charge: i64) -> i32 {
    with_sim(|s| match s.ecs.body.get_mut(entity) {
        Some(b) => match b.parts.get_mut(part as usize) {
            Some(p) => {
                p.charge = Fx::from_raw(charge);
                0
            }
            None => -1,
        },
        None => -1,
    })
}

#[no_mangle]
pub extern "C" fn sim_despawn(entity: u32) {
    with_sim(|s| s.ecs.despawn(entity));
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
#[no_mangle]
pub extern "C" fn sim_inject(
    entity: u32,
    part: u32,
    kinetic: i64,
    contact_area: i64,
    thermal: i64,
    charge: i64,
    corrosive: i64,
    reagent: u32,
    aether_flux: i64,
) {
    with_sim(|s| {
        s.inject(
            entity,
            part as u16,
            Impulse {
                kinetic: Fx::from_raw(kinetic),
                contact_area: Fx::from_raw(contact_area),
                thermal: Fx::from_raw(thermal),
                charge: Fx::from_raw(charge),
                corrosive: Fx::from_raw(corrosive),
                reagent,
                aether_flux: Fx::from_raw(aether_flux),
            },
        );
    });
}

/// Returns the delivered kinetic energy, or 0 if the swing could not resolve.
#[no_mangle]
pub extern "C" fn sim_strike(attacker: u32, target: u32, part: u32) -> i64 {
    with_sim(|s| match s.strike(attacker, target, part as u16) {
        Some(p) => p.kinetic.raw(),
        None => 0,
    })
}

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

fn put_u16(v: &mut Vec<u8>, x: u16) {
    v.extend_from_slice(&x.to_le_bytes());
}

fn put_u32(v: &mut Vec<u8>, x: u32) {
    v.extend_from_slice(&x.to_le_bytes());
}

fn put_i64(v: &mut Vec<u8>, x: i64) {
    v.extend_from_slice(&x.to_le_bytes());
}

/// Everything the renderer needs, in one buffer.
///
/// Temperature is sent already derived, because §10.1 drives emissive colour
/// from it and the host has no business re-deriving simulation quantities.
#[no_mangle]
pub extern "C" fn sim_snapshot() -> u32 {
    let bytes = with_sim(|s| {
        let mut v: Vec<u8> = Vec::new();
        let ids = s.ecs.body.ids();
        put_u32(&mut v, s.tick);
        put_u32(&mut v, ids.len() as u32);
        for e in ids {
            let pos = s.position_of(e);
            put_u32(&mut v, e);
            put_i64(&mut v, pos.x.raw());
            put_i64(&mut v, pos.y.raw());
            put_i64(&mut v, pos.z.raw());
            let body = match s.ecs.body.get(e) {
                Some(b) => b,
                None => continue,
            };
            put_u16(&mut v, body.form);
            put_u16(&mut v, body.parts.len() as u16);
            for i in 0..body.parts.len() {
                let p = body.parts[i];
                let temp = body.temperature(i, &s.materials, s.rules.ambient_temp);
                put_u16(&mut v, p.slot);
                put_u16(&mut v, p.material);
                put_i64(&mut v, p.volume.raw());
                put_i64(&mut v, p.integrity.raw());
                put_i64(&mut v, temp.raw());
                put_i64(&mut v, p.charge.raw());
                v.push(p.attached as u8);
            }
        }
        v
    });
    publish(bytes)
}

/// The §10.2 Readout feed: every record at or after `since_tick`.
#[no_mangle]
pub extern "C" fn sim_events(since_tick: u32) -> u32 {
    let bytes = with_sim(|s| {
        let mut v: Vec<u8> = Vec::new();
        let recs: Vec<_> = s.events.since(since_tick).copied().collect();
        put_u32(&mut v, recs.len() as u32);
        for e in recs {
            put_u32(&mut v, e.tick);
            v.push(e.kind as u8);
            v.push(e.detail);
            put_u32(&mut v, e.entity);
            put_u16(&mut v, e.part);
            put_u16(&mut v, e.material_before);
            put_u16(&mut v, e.material_after);
            put_i64(&mut v, e.a.raw());
            put_i64(&mut v, e.b.raw());
        }
        v
    });
    publish(bytes)
}

#[no_mangle]
pub extern "C" fn sim_clear_events() {
    with_sim(|s| s.events.clear());
}

/// `(entity, part)` state for the §10.2 Lens: the numbers, not a power score.
#[no_mangle]
pub extern "C" fn sim_part_temp(entity: u32, part: u32) -> i64 {
    with_sim(|s| match s.ecs.body.get(entity) {
        Some(b) => b
            .temperature(part as usize, &s.materials, s.rules.ambient_temp)
            .raw(),
        None => 0,
    })
}

#[no_mangle]
pub extern "C" fn sim_part_field(entity: u32, part: u32, field: u32) -> i64 {
    with_sim(|s| {
        let p = match s.ecs.body.get(entity).and_then(|b| b.parts.get(part as usize)) {
            Some(p) => *p,
            None => return 0,
        };
        match field {
            0 => p.material as i64,
            1 => p.volume.raw(),
            2 => p.integrity.raw(),
            3 => p.heat.raw(),
            4 => p.charge.raw(),
            5 => p.attached as i64,
            // Latent energy banked toward a pending phase change, and which
            // change it is banked toward. The Readout shows this as a melting
            // or freezing progress bar — §10.2 wants the player to see *why*
            // the temperature stopped rising.
            6 => p.phase_progress.raw(),
            7 => p.phase_target as i64,
            _ => 0,
        }
    })
}

// ---------------------------------------------------------------------------
// Ship-gate scenarios (§4.4)
// ---------------------------------------------------------------------------

/// Run the §12.4 determinism soak and return the resulting state hash.
#[no_mangle]
pub extern "C" fn sim_soak(ticks: u32) -> i64 {
    with_sim(|s| {
        crate::scenarios::soak(s, ticks);
        s.state_hash() as i64
    })
}

#[no_mangle]
pub extern "C" fn sim_scenario_count() -> u32 {
    crate::scenarios::all().len() as u32
}

#[no_mangle]
pub extern "C" fn sim_scenario_name(index: u32) -> u32 {
    let s = crate::scenarios::all()
        .get(index as usize)
        .map(|s| s.name)
        .unwrap_or("");
    publish(s.as_bytes().to_vec())
}

#[no_mangle]
pub extern "C" fn sim_scenario_claim(index: u32) -> u32 {
    let s = crate::scenarios::all()
        .get(index as usize)
        .map(|s| s.claim)
        .unwrap_or("");
    publish(s.as_bytes().to_vec())
}

/// Run one scenario from a clean world. Returns 1 if its claim held.
///
/// The same function backs the CI gate and the in-browser arena, so what a
/// stakeholder watches on screen is literally the thing the build checks.
#[no_mangle]
pub extern "C" fn sim_scenario_run(index: u32) -> u32 {
    let scenarios = crate::scenarios::all();
    let scenario = match scenarios.get(index as usize) {
        Some(s) => s,
        None => return 0,
    };
    with_sim(|sim| {
        let materials = sim.materials.clone();
        let forms = sim.forms.clone();
        let rules = sim.rules;
        let mut fresh = Sim::new(sim.seed);
        fresh.materials = materials;
        fresh.forms = forms;
        fresh.rules = rules;
        let obs = (scenario.run)(&mut fresh);
        *sim = fresh;
        publish(obs.note.into_bytes());
        obs.passed as u32
    })
}

/// Build a body from a slice of `(material, volume)` pairs plus a link list.
/// Exposed so the arena can compose targets the scenarios do not cover.
#[no_mangle]
pub extern "C" fn sim_spawn_assembly(
    parts_ptr: u32,
    parts_len: u32,
    links_ptr: u32,
    links_len: u32,
    x: i64,
    y: i64,
    z: i64,
    temp: i64,
) -> u32 {
    let parts_raw = scratch_slice(parts_ptr, parts_len);
    let links_raw = scratch_slice(links_ptr, links_len);
    with_sim(|s| {
        let mut body = Body::new();
        // 10-byte records: u16 material id, then 8 bytes of raw fixed-point volume.
        for (i, c) in parts_raw.chunks_exact(10).enumerate() {
            let material = u16::from_le_bytes([c[0], c[1]]);
            let volume = i64::from_le_bytes([c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9]]);
            body.parts
                .push(crate::body::Part::new(i as u16, material, Fx::from_raw(volume)));
        }
        for c in links_raw.chunks_exact(4) {
            body.add_link(
                u16::from_le_bytes([c[0], c[1]]),
                u16::from_le_bytes([c[2], c[3]]),
            );
        }
        s.spawn_at_temp(
            body,
            V3::new(Fx::from_raw(x), Fx::from_raw(y), Fx::from_raw(z)),
            Fx::from_raw(temp),
        )
    })
}
