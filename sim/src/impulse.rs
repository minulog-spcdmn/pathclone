//! L2 — Interaction. §4.3, the impulse model.
//!
//! > "The single largest de-hardcoding win in this design. **Delete the damage
//! > type enum.** Nothing in this game deals 'fire damage.'"
//!
//! There is no damage type here, and no per-source code path. A sword hit, a
//! fall, a thrown flask, a lightning arc and standing too close to lava all
//! enter through [`Sim::inject`] as the same seven numbers, and leave through
//! the same seven steps of [`Sim::apply`].
//!
//! Two implementation warnings from §4.3 are load-bearing and are called out
//! where they are honoured:
//!
//! * cascades are bounded and energy is conservative-or-lossy, never generative;
//! * resolution is gather-then-apply and order-independent within a tick.

use crate::body::{Body, Part};
use crate::ecs::{EntityId, V3};
use crate::events::{Event, EventKind};
use crate::fixed::Fx;
use crate::form::{derive_strike, StrikeProfile};
use crate::material::{Material, TagSet, NO_MATERIAL};
use crate::sim::Sim;

/// A packet of transferred quantities. §4.3.
///
/// Note what is *not* here: no source, no element, no school, no attacker, no
/// "type". A part being resolved cannot tell what hit it, only what arrived.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Impulse {
    /// Energy transferred mechanically.
    pub kinetic: Fx,
    /// Small area + high kinetic = penetration; large = blunt trauma.
    pub contact_area: Fx,
    /// May be negative (heat extraction).
    pub thermal: Fx,
    /// Electrical / aetheric.
    pub charge: Fx,
    /// Chemical potential, carried with `reagent`.
    pub corrosive: Fx,
    /// What it is made of, for reaction matching.
    pub reagent: TagSet,
    /// Field disturbance. Destabilises stored charge in whatever it washes
    /// over — it makes charged things arc early rather than adding charge,
    /// because a term that *added* charge would be an energy source and §4.3
    /// names those the #1 exploit vector.
    pub aether_flux: Fx,
}

impl Impulse {
    /// Energy content, for the ledger.
    pub fn energy(&self, charge_coeff: Fx) -> Fx {
        self.kinetic
            .add(self.thermal)
            .add(self.charge.mul(charge_coeff))
    }

    pub fn kinetic(kinetic: Fx, contact_area: Fx) -> Impulse {
        Impulse {
            kinetic,
            contact_area,
            ..Default::default()
        }
    }

    pub fn thermal(thermal: Fx) -> Impulse {
        Impulse {
            thermal,
            ..Default::default()
        }
    }

    pub fn charge(charge: Fx) -> Impulse {
        Impulse {
            charge,
            ..Default::default()
        }
    }

    pub fn corrosive(corrosive: Fx, reagent: TagSet) -> Impulse {
        Impulse {
            corrosive,
            reagent,
            ..Default::default()
        }
    }

    /// Total ordering over the payload, used to canonicalise summation order.
    fn sort_key(&self) -> (i64, i64, i64, i64, i64, i64, u32) {
        (
            self.kinetic.raw(),
            self.contact_area.raw(),
            self.thermal.raw(),
            self.charge.raw(),
            self.corrosive.raw(),
            self.aether_flux.raw(),
            self.reagent,
        )
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Pending {
    pub target: EntityId,
    pub part: u16,
    pub imp: Impulse,
}

/// Per-part totals for one cascade generation.
///
/// Everything in here is built with commutative operations — sums, a max, and a
/// bitwise OR — so the accumulated result cannot depend on the order impulses
/// arrived in. That is §4.3's "otherwise multiplayer desyncs and hit-order
/// exploits appear", made structural.
#[derive(Clone, Copy, Debug, Default)]
struct Acc {
    entity: EntityId,
    part: u16,
    /// Sum of energy actually taken up (elasticity returns the rest).
    absorbed: Fx,
    /// Sum of absorbed energy weighted by how much of the part each impulse
    /// engaged — a maul head covering a plate counts for all of it, a blade
    /// edge for a sliver. Drives the blunt fracture route.
    blunt_energy: Fx,
    /// Highest single-impulse stress. Two separate blows do not add up into one
    /// bigger blow; the worst one is what decides fracture.
    peak_stress: Fx,
    /// Sum of per-impulse integrity loss.
    deform: Fx,
    thermal: Fx,
    charge: Fx,
    corrosive: Fx,
    aether_flux: Fx,
    reagent: TagSet,
    hits: u32,
}

impl Sim {
    /// Queue an impulse from outside the simulation and book its energy.
    pub fn inject(&mut self, target: EntityId, part: u16, imp: Impulse) {
        self.ledger.injected = self
            .ledger
            .injected
            .add(imp.energy(self.rules.charge_energy_coeff));
        self.pending.push(Pending { target, part, imp });
    }

    /// Queue an impulse the simulation produced itself. Not booked as injected
    /// — the energy is already inside the system.
    pub(crate) fn queue_secondary(&mut self, p: Pending) {
        self.pending.push(p);
    }

    pub fn pending_count(&self) -> usize {
        self.pending.len()
    }

    /// Gather-then-apply, bounded to `rules.cascade_generations`.
    pub fn resolve_pending(&mut self) {
        let mut generation: u32 = 0;
        loop {
            let queue = core::mem::take(&mut self.pending);
            if queue.is_empty() {
                break;
            }
            if generation >= self.rules.cascade_generations {
                // §4.3 bounds the cascade to guarantee termination. Anything
                // still in flight is dropped, and its energy is booked as
                // leaving the system so the audit stays honest about it.
                let coeff = self.rules.charge_energy_coeff;
                for p in &queue {
                    self.ledger.dissipated =
                        self.ledger.dissipated.add(p.imp.energy(coeff));
                }
                break;
            }
            let accs = self.accumulate(&queue);
            for acc in &accs {
                self.apply(acc, generation as u8);
            }
            generation = generation.saturating_add(1);
        }
    }

    /// Fold a queue into one accumulator per struck part.
    fn accumulate(&self, queue: &[Pending]) -> Vec<Acc> {
        let mut sorted: Vec<&Pending> = queue.iter().collect();
        // Sorting on the full payload — not just the target — means the sum is
        // computed in the same order no matter how the queue was built. Without
        // this, saturation could make the result depend on arrival order.
        sorted.sort_by_key(|p| (p.target, p.part, p.imp.sort_key()));

        let mut out: Vec<Acc> = Vec::new();
        for p in sorted {
            let (mat, temp, volume) = match self.part_state(p.target, p.part) {
                Some(v) => v,
                None => continue,
            };
            let hardness = mat.hardness_at(temp, self.rules.reference_temp, self.rules.soften_k);

            // §4.3 step 1. Elastic materials hand some of the energy back
            // instead of taking it.
            let absorbed = p
                .imp
                .kinetic
                .mul(Fx::ONE.sub(mat.elasticity.clamp(Fx::ZERO, Fx::ONE)));
            let area = p.imp.contact_area.max(Fx::EPSILON);
            let stress = if p.imp.kinetic.is_zero() {
                Fx::ZERO
            } else {
                absorbed.div(area)
            };

            // §4.3 step 2, computed here rather than at apply time so that it
            // reads pre-impact state for every impulse in the generation.
            //
            // Plastic deformation is a stress phenomenon by definition, so only
            // the stress route feeds it — a maul that never exceeds a chitin
            // plate's hardness leaves no dent, and then shatters it anyway
            // through the blunt route below. Damage is expressed as a fraction
            // of the way to fracture, which keeps a light part and a heavy part
            // of the same material equally many blows from breaking.
            let deform = if stress > hardness && hardness.is_positive() {
                let ceiling = hardness.mul(Fx::ONE.add(mat.toughness.mul(self.rules.fracture_k)));
                stress
                    .sub(hardness)
                    .div(ceiling.max(Fx::EPSILON))
                    .mul(self.rules.deform_k)
            } else {
                Fx::ZERO
            };

            let slot = match out
                .iter()
                .position(|a| a.entity == p.target && a.part == p.part)
            {
                Some(i) => &mut out[i],
                None => {
                    out.push(Acc {
                        entity: p.target,
                        part: p.part,
                        ..Default::default()
                    });
                    out.last_mut().expect("just pushed")
                }
            };
            // How much of the part this impulse engaged: everything, for a face
            // wider than the part; a fraction, for an edge.
            let broadness = area.div(volume.max(Fx::EPSILON)).clamp(Fx::ZERO, Fx::ONE);
            slot.blunt_energy = slot
                .blunt_energy
                .add(absorbed.mul(broadness).div(volume.max(Fx::EPSILON)));
            slot.absorbed = slot.absorbed.add(absorbed);
            slot.peak_stress = slot.peak_stress.max(stress);
            slot.deform = slot.deform.add(deform);
            slot.thermal = slot.thermal.add(p.imp.thermal);
            slot.charge = slot.charge.add(p.imp.charge);
            slot.corrosive = slot.corrosive.add(p.imp.corrosive);
            slot.aether_flux = slot.aether_flux.add(p.imp.aether_flux);
            slot.reagent |= p.imp.reagent;
            slot.hits = slot.hits.saturating_add(1);
        }
        // Apply order is by (entity, part) so two hosts walk it identically.
        out.sort_by_key(|a| (a.entity, a.part));
        out
    }

    fn part_state(&self, e: EntityId, part: u16) -> Option<(Material, Fx, Fx)> {
        let body = self.ecs.body.get(e)?;
        let p = body.parts.get(part as usize)?;
        if !p.attached || !p.is_live() {
            return None;
        }
        let m = *self.materials.get(p.material)?;
        let temp = body.temperature(part as usize, &self.materials, self.rules.ambient_temp);
        Some((m, temp, p.volume))
    }

    /// The seven steps, in order, for one part.
    ///
    /// One deliberate reordering against §4.3's numbering: incoming heat lands
    /// (step 4) *before* the fracture check (step 3) resolves. Steps 1–3 are
    /// all mechanical and read pre-impact properties, so the fracture decision
    /// is unchanged by the swap; but a part that shatters must hand its stored
    /// heat to its fragments, and it can only do that if the heat has already
    /// arrived. Without the swap, energy vanishes on every fracture.
    fn apply(&mut self, acc: &Acc, generation: u8) {
        let (mat, temp, _volume) = match self.part_state(acc.entity, acc.part) {
            Some(v) => v,
            None => return,
        };
        let hardness = mat.hardness_at(temp, self.rules.reference_temp, self.rules.soften_k);

        // Captured before step 2 spends any of it. A blow decides whether it
        // breaks the part against the state it *met*, not against the state it
        // just created — otherwise every blow that dents also shatters.
        let integrity_before = self
            .ecs
            .body
            .get(acc.entity)
            .and_then(|b| b.parts.get(acc.part as usize))
            .map(|p| p.integrity.clamp(Fx::ZERO, Fx::ONE))
            .unwrap_or(Fx::ZERO);

        // --- step 2: plastic deformation -----------------------------------
        if acc.deform.is_positive() {
            if let Some(body) = self.ecs.body.get_mut(acc.entity) {
                if let Some(p) = body.parts.get_mut(acc.part as usize) {
                    p.integrity = p.integrity.sub(acc.deform).max(Fx::ZERO);
                }
            }
            let tick = self.tick;
            let before = mat_of(self, acc.entity, acc.part);
            self.events.push(Event {
                tick,
                kind: EventKind::Deformed,
                entity: acc.entity,
                part: acc.part,
                material_before: before,
                material_after: before,
                detail: generation,
                a: acc.deform,
                b: acc.peak_stress,
            });
        }

        // --- step 4 (early): thermal, including friction heating ------------
        // Absorbed mechanical energy does not simply disappear; the fraction
        // the material's friction converts becomes heat. This is what warms a
        // billet under the hammer and what makes grinding an edge a thermal
        // event, neither of which needed a system.
        let friction_heat = acc
            .absorbed
            .mul(mat.friction)
            .mul(self.rules.friction_heat_k);
        let heat_in = acc.thermal.add(friction_heat);
        if !heat_in.is_zero() {
            if let Some(body) = self.ecs.body.get_mut(acc.entity) {
                if let Some(p) = body.parts.get_mut(acc.part as usize) {
                    p.heat = p.heat.add(heat_in);
                }
            }
        }
        if acc.absorbed.is_positive() || !acc.thermal.is_zero() {
            let tick = self.tick;
            let before = mat_of(self, acc.entity, acc.part);
            self.events.push(Event {
                tick,
                kind: EventKind::Impact,
                entity: acc.entity,
                part: acc.part,
                material_before: before,
                material_after: before,
                detail: generation,
                a: acc.absorbed,
                b: acc.peak_stress,
            });
        }

        // --- step 3: fracture ----------------------------------------------
        // Two routes, and a part breaks if either one is beaten.
        //
        // Penetration: stress past hardness by a toughness-scaled margin. This
        // is §4.3 step 3 verbatim, plus a scaling by integrity — already
        // damaged material carries cracks, and cracks are where the next blow
        // goes. Without that term a part is exactly as hard to break on the
        // last hit as on the first, and fights have no arc.
        //
        // Blunt: energy density past toughness. See `Rules::blunt_k`.
        //
        // Fluids have neither: with no hardness there is nothing to exceed, and
        // they displace rather than separate.
        if hardness.is_positive() {
            let stress_threshold = hardness
                .mul(Fx::ONE.add(mat.toughness.mul(self.rules.fracture_k)))
                .mul(integrity_before);
            let blunt_threshold = mat
                .toughness
                .mul(self.rules.blunt_k)
                .mul(integrity_before)
                .max(Fx::EPSILON);

            let by_stress = stress_threshold.is_positive() && acc.peak_stress > stress_threshold;
            let by_blunt = acc.blunt_energy > blunt_threshold;
            if by_stress || by_blunt {
                let (magnitude, threshold) = if by_stress {
                    (acc.peak_stress, stress_threshold)
                } else {
                    (acc.blunt_energy, blunt_threshold)
                };
                let overload = magnitude.div(threshold.max(Fx::EPSILON));
                let extra = overload.sub(Fx::ONE).floor_int().max(0) as u32;
                let fragments = 1 + extra.min(self.rules.fragment_max);
                let tick = self.tick;
                let before = mat_of(self, acc.entity, acc.part);
                self.events.push(Event {
                    tick,
                    kind: EventKind::Fractured,
                    entity: acc.entity,
                    part: acc.part,
                    material_before: before,
                    material_after: before,
                    detail: fragments.min(255) as u8,
                    a: magnitude,
                    b: threshold,
                });
                self.fracture(acc.entity, acc.part, fragments);
                // The part is gone. Nothing downstream can act on it.
                return;
            }
        }

        // --- step 5: phase -------------------------------------------------
        self.check_phase(acc.entity, acc.part);

        // --- step 6: charge -------------------------------------------------
        if !acc.charge.is_zero() || acc.aether_flux.is_positive() {
            if let Some(body) = self.ecs.body.get_mut(acc.entity) {
                if let Some(p) = body.parts.get_mut(acc.part as usize) {
                    p.charge = p.charge.add(acc.charge);
                }
            }
            let (charge_now, mat_now) = match self.part_state(acc.entity, acc.part) {
                Some((m, _, _)) => (
                    self.ecs
                        .body
                        .get(acc.entity)
                        .and_then(|b| b.parts.get(acc.part as usize))
                        .map(|p| p.charge)
                        .unwrap_or(Fx::ZERO),
                    m,
                ),
                None => (Fx::ZERO, mat),
            };
            // A field washing over a charged part lowers the threshold it will
            // hold to. It never adds charge, so a chain cannot amplify itself.
            let destabilised = acc
                .aether_flux
                .mul(self.rules.flux_destabilise_k)
                .max(Fx::ZERO);
            let limit = mat_now
                .discharge_threshold
                .sub(destabilised)
                .max(Fx::ZERO)
                .min(mat_now.aether_capacity);
            if limit.is_positive() && charge_now > limit {
                self.discharge(acc.entity, acc.part, charge_now.sub(limit), limit);
            }
        }

        // --- step 7: reactions ----------------------------------------------
        if acc.corrosive.is_positive() && acc.reagent != 0 {
            self.react(acc, generation);
        }
    }

    /// §4.3 step 7. Tag-matched, so the table stays authorable as the material
    /// count grows (§4.2: "Reaction tags let materials interact without an N²
    /// table").
    fn react(&mut self, acc: &Acc, generation: u8) {
        let (mat, _, volume) = match self.part_state(acc.entity, acc.part) {
            Some(v) => v,
            None => return,
        };
        let reactions: Vec<crate::material::Reaction> =
            self.materials.reactions_of(&mat).to_vec();
        let resist = mat.corrosion_resistance.clamp(Fx::ZERO, Fx::ONE);
        let mut remaining = volume;

        for rx in reactions {
            if acc.reagent & rx.with_tags == 0 || remaining <= Fx::ZERO {
                continue;
            }
            let potency = acc
                .corrosive
                .mul(rx.rate)
                .mul(self.rules.reaction_k)
                .mul(Fx::ONE.sub(resist));
            if !potency.is_positive() {
                continue;
            }
            let converted = potency.min(remaining);
            if !converted.is_positive() {
                continue;
            }

            // Mass leaves the part and reappears as product, carrying its share
            // of whatever the part was holding. Nothing is created here except
            // the reaction's own released energy, which is booked.
            let vol_before = remaining;
            let fraction = converted
                .div(vol_before.max(Fx::EPSILON))
                .clamp(Fx::ZERO, Fx::ONE);
            let mut carried_heat = Fx::ZERO;
            let mut carried_charge = Fx::ZERO;
            if let Some(body) = self.ecs.body.get_mut(acc.entity) {
                if let Some(p) = body.parts.get_mut(acc.part as usize) {
                    carried_heat = p.heat.mul(fraction);
                    carried_charge = p.charge.mul(fraction);
                    p.volume = p.volume.sub(converted).max(Fx::ZERO);
                    p.heat = p.heat.sub(carried_heat);
                    p.charge = p.charge.sub(carried_charge);
                }
            }
            remaining = remaining.sub(converted);

            let released = rx.releases_thermal.mul(converted);
            if released.is_positive() {
                self.ledger.released = self.ledger.released.add(released);
            } else {
                self.ledger.absorbed = self.ledger.absorbed.sub(released);
            }

            let product = if rx.produces == NO_MATERIAL {
                None
            } else {
                self.graft_product(
                    acc.entity,
                    acc.part,
                    rx.produces,
                    converted,
                    carried_heat,
                    carried_charge,
                )
            };

            // Released energy is split between what reacted and what did not,
            // in proportion to mass. That split is what makes an exothermic
            // reaction self-propagating: convert most of a saltpetre deposit
            // and most of the heat goes into the product, which then has its
            // own ignition point to cross. Nobody wrote an explosion.
            let mut to_product = released.mul(fraction);
            let mut to_part = released.sub(to_product);
            if !remaining.is_positive() {
                to_product = to_product.add(to_part);
                to_part = Fx::ZERO;
            }
            if !to_part.is_zero() {
                if let Some(body) = self.ecs.body.get_mut(acc.entity) {
                    if let Some(p) = body.parts.get_mut(acc.part as usize) {
                        p.heat = p.heat.add(to_part);
                    }
                }
            }
            match product {
                Some((pe, pp)) if !to_product.is_zero() => {
                    if let Some(body) = self.ecs.body.get_mut(pe) {
                        if let Some(p) = body.parts.get_mut(pp as usize) {
                            p.heat = p.heat.add(to_product);
                        }
                    }
                }
                _ if !to_product.is_zero() => {
                    // Nothing to receive it — the reaction vented to the world.
                    self.ledger.dissipated = self.ledger.dissipated.add(to_product);
                }
                _ => {}
            }

            let tick = self.tick;
            self.events.push(Event {
                tick,
                kind: EventKind::Reacted,
                entity: acc.entity,
                part: acc.part,
                material_before: mat_of(self, acc.entity, acc.part),
                material_after: rx.produces,
                detail: generation,
                a: converted,
                b: released,
            });
        }
    }

    /// §4.3 step 3: "Fractured parts become entities in their own right."
    fn fracture(&mut self, e: EntityId, part: u16, fragments: u32) {
        let (material, volume, heat, charge, integrity) = {
            let body = match self.ecs.body.get_mut(e) {
                Some(b) => b,
                None => return,
            };
            let p = match body.parts.get_mut(part as usize) {
                Some(p) => p,
                None => return,
            };
            let taken = (p.material, p.volume, p.heat, p.charge, p.integrity);
            p.attached = false;
            p.volume = Fx::ZERO;
            p.heat = Fx::ZERO;
            p.charge = Fx::ZERO;
            p.integrity = Fx::ZERO;
            taken
        };

        let n = fragments.max(1);
        let divisor = Fx::from_int_i64(n as i64);
        let position = self.position_of(e);
        let mut left_volume = volume;
        let mut left_heat = heat;
        let mut left_charge = charge;

        for i in 0..n {
            let last = i + 1 == n;
            // The final fragment takes the remainder so the split is exact and
            // the energy audit does not drift a rounding unit per fracture.
            let (v, h, c) = if last {
                (left_volume, left_heat, left_charge)
            } else {
                let v = volume.div(divisor);
                let h = heat.div(divisor);
                let c = charge.div(divisor);
                (v, h, c)
            };
            left_volume = left_volume.sub(v);
            left_heat = left_heat.sub(h);
            left_charge = left_charge.sub(c);

            let jitter = self.jitter(e);
            let mut fb = Body::new();
            let mut fp = Part::new(0, material, v);
            fp.heat = h;
            fp.charge = c;
            fp.integrity = integrity.max(Fx::ZERO);
            fb.parts.push(fp);
            let fe = self.spawn(fb, position.add(jitter));
            self.event(EventKind::Spawned, fe, 0, 0, v, Fx::ZERO);
        }
    }

    /// A reaction product appears attached to the part it came out of.
    ///
    /// The rust stays on the plate, the brine stays on the skin, the blastfire
    /// stays in the deposit. That contact is not a detail: it is what lets an
    /// endothermic reaction chill the thing it is sitting on and an exothermic
    /// one set it alight, both through ordinary conduction. A product that
    /// spawned as a loose object beside its parent would do neither.
    fn graft_product(
        &mut self,
        entity: EntityId,
        part: u16,
        material: crate::material::MaterialId,
        volume: Fx,
        heat: Fx,
        charge: Fx,
    ) -> Option<(EntityId, u16)> {
        let slot = {
            let body = self.ecs.body.get_mut(entity)?;
            let slot = body.parts.len() as u16;
            let mut p = Part::new(slot, material, volume);
            p.heat = heat;
            p.charge = charge;
            body.parts.push(p);
            // The product takes the reacting part's place in the assembly, not
            // just a link back to it. Otherwise a part that gets fully consumed
            // severs the graph, and the acid that dissolved the block leaves
            // everything the block was holding together unconnected.
            let inherited: Vec<u16> = body.neighbours(part);
            body.add_link(part, slot);
            for n in inherited {
                body.add_link(slot, n);
            }
            slot
        };
        self.event(EventKind::Spawned, entity, slot, 0, volume, Fx::ZERO);
        Some((entity, slot))
    }

    /// Small deterministic offset from an entity's own PRNG (§12.4 rule 4).
    fn jitter(&mut self, e: EntityId) -> V3 {
        match self.ecs.rng.get_mut(e) {
            Some(r) => {
                let half = Fx::HALF;
                let x = r.unit().sub(half);
                let y = r.unit().sub(half);
                let z = r.unit().sub(half);
                V3::new(x, y, z)
            }
            None => V3::ZERO,
        }
    }

    // -----------------------------------------------------------------------
    // Melee, derived from §6.1
    // -----------------------------------------------------------------------

    /// Swing whatever `attacker` is wielding at `target`.
    ///
    /// The equal-and-opposite half is the interesting one: the striking part
    /// takes back a share of the energy scaled by the hardness ratio of the two
    /// materials. Hit something softer and almost nothing returns; hit
    /// something harder and most of it does, into a part with a small contact
    /// area — which is the entire mechanism behind "an ice weapon melts if you
    /// fight near lava. Then you're unarmed", and behind a quartz blade
    /// exploding against granite. Neither is implemented anywhere.
    pub fn strike(&mut self, attacker: EntityId, target: EntityId, target_part: u16) -> Option<StrikeProfile> {
        let eff = *self.ecs.effectors.get(attacker)?;
        let weapon = eff.wielded.unwrap_or(attacker);
        let weapon_body = self.ecs.body.get(weapon)?;
        let profile = derive_strike(weapon_body, &self.forms, &self.materials, eff.strength);

        let (target_mat, target_temp, _) = self.part_state(target, target_part)?;
        let target_hardness =
            target_mat.hardness_at(target_temp, self.rules.reference_temp, self.rules.soften_k);

        self.inject(target, target_part, profile.impulse());

        if let Some((strike_mat, strike_temp, _)) = self.part_state(weapon, profile.strike_part) {
            let strike_hardness =
                strike_mat.hardness_at(strike_temp, self.rules.reference_temp, self.rules.soften_k);
            let denom = target_hardness.add(strike_hardness);
            let ratio = if denom.is_positive() {
                target_hardness.div(denom)
            } else {
                Fx::ZERO
            };
            let returned = profile
                .kinetic
                .mul(ratio)
                .mul(self.rules.strike_return_k);
            if returned.is_positive() {
                self.inject(
                    weapon,
                    profile.strike_part,
                    Impulse::kinetic(returned, profile.contact_area),
                );
            }
        }
        Some(profile)
    }
}

fn mat_of(sim: &Sim, e: EntityId, part: u16) -> crate::material::MaterialId {
    sim.ecs
        .body
        .get(e)
        .and_then(|b| b.parts.get(part as usize))
        .map(|p| p.material)
        .unwrap_or(NO_MATERIAL)
}
