//! The world: everything that happens between impulses.
//!
//! Tick order is fixed and documented here because it is load-bearing for
//! §14.4 rule 9 — two hosts that run these passes in different orders produce
//! different state hashes even with identical arithmetic.

use crate::body::{Body, Part};
use crate::ecs::{AttackPhase, Ecs, EntityId, Transform, V3};
use crate::events::{Event, EventKind, EventLog};
use crate::fixed::Fx;
use crate::form::FormTable;
use crate::hash::Hasher;
use crate::impulse::Pending;
use crate::material::{
    DecodeError, MaterialId, MaterialTable, PhasePoint, Reader, Transition, NO_MATERIAL,
};

/// Every tunable in the simulation, loaded from `data/rules.json`.
///
/// §14.5: "Every non-code definition is a schema-validated data file ...
/// worldgen layer parameters, reaction tags, cost model coefficients." These
/// are the coefficients §15 tells the balance owner to reach for first, and
/// keeping them out of the binary is what makes that a data edit rather than a
/// rebuild.
#[derive(Clone, Copy, Debug)]
pub struct Rules {
    /// Environmental temperature. Regional in a real world; global at M1.
    pub ambient_temp: Fx,
    /// The temperature at which authored `hardness` values are quoted.
    pub reference_temp: Fx,
    /// §7.1 layer 5. Present so nothing downstream has to be retrofitted; at M1
    /// it only scales charge leak.
    pub aether_density: Fx,
    /// Seconds per tick. 20 Hz per §13.2.
    pub dt: Fx,

    /// §6.3 step 3's `k`: how far past hardness a material must be pushed
    /// before it fractures, scaled by toughness.
    pub fracture_k: Fx,
    /// Energy density per unit toughness at which a broad impact breaks a part
    /// regardless of how little stress it applied.
    ///
    /// §6.3 step 3 is written purely in terms of stress, but the consequence it
    /// promises two paragraphs later — "a maul with high kinetic and large
    /// contact area doesn't penetrate but transfers enough energy to fracture
    /// brittle armour" — cannot come out of a stress test, because a large
    /// contact area is precisely what keeps stress low. This is the second
    /// route, and it is what makes the maul a real answer to a chitin plate
    /// instead of a worse sword.
    pub blunt_k: Fx,
    /// Integrity lost per unit of excess stress.
    pub deform_k: Fx,
    /// Fraction of absorbed mechanical energy that becomes heat, scaled by the
    /// material's friction. This is why grinding and hammering warm things up
    /// without a "grinding heats things" feature.
    pub friction_heat_k: Fx,
    /// Fraction of a strike's energy returned into the striking part, scaled by
    /// the hardness ratio of the two materials. This is the whole of "a quartz
    /// blade shatters when it meets something harder".
    pub strike_return_k: Fx,

    pub conduction_k: Fx,
    pub ambient_conduction_k: Fx,
    /// Heat exchanged between *separate* entities standing near each other.
    ///
    /// Conduction along an assembly graph cannot carry a fire from a burning
    /// tree to the wolf beside it, and §6.3 promises exactly that. This is the
    /// term that does it, and it is symmetric, so it moves energy and never
    /// makes it.
    pub radiant_k: Fx,
    pub radiant_radius: Fx,
    pub charge_diffusion_k: Fx,
    pub charge_leak_k: Fx,

    /// How far an over-threshold part will reach for a discharge target.
    pub arc_radius: Fx,
    /// Fraction of arced charge that becomes heat instead of arriving.
    pub arc_loss: Fx,
    pub arc_heat_per_charge: Fx,
    /// Energy equivalent of one unit of stored charge, for the §6.3 audit.
    pub charge_energy_coeff: Fx,
    /// How far a passing field lowers a part's discharge threshold. Lets an arc
    /// set off a charged bystander without ever creating charge.
    pub flux_destabilise_k: Fx,

    /// Half-angle of the arc a swing sweeps, in radians. A target outside it is
    /// behind you.
    pub swing_arc: Fx,

    // --- §5.1, the commitment model ---------------------------------------
    //
    // "Baseline numbers, to be tuned but not abandoned." They are tuned in
    // data, because §5 is owned by a designer rather than the simulation team
    // and §15 says the fix for a feel problem is a coefficient, never a special
    // case. The cycle as a whole still lasts one over §8.1's derived swing rate
    // — a heavy weapon is slow because it is heavy — and these decide only how
    // that time is *spent*.
    /// Shortest windup, seconds. §5.1: 100 ms.
    pub windup_min: Fx,
    /// Longest windup, seconds. §5.1: 250 ms.
    pub windup_max: Fx,
    /// Seconds of windup per unit of wielded mass, before the clamp. This is
    /// the term that makes a player-crafted absurd maul feel absurd with no
    /// tuning, which is §5.1's whole argument for deriving feel from the
    /// simulation instead of authoring it.
    pub windup_mass_k: Fx,
    /// The active frames, seconds. §5.1: 60–120 ms.
    pub active_min: Fx,
    pub active_max: Fx,
    /// Floor on recovery, seconds. §5.1: 150 ms. There is no ceiling here —
    /// recovery is the remainder of the cycle, so the weapon's own slowness is
    /// the ceiling.
    pub recovery_min: Fx,
    /// Fraction of recovery that must elapse before movement or a dodge may
    /// cancel it. §5.1: 40%.
    pub recovery_cancel: Fx,
    /// §5.1's input buffer, seconds: 200 ms.
    pub input_buffer: Fx,
    /// Dodge duration, seconds. §5.1: 350 ms total.
    pub dodge_time: Fx,
    /// I-frame window, as fractions of the dodge. §5.1: 60–180 ms of 350 ms.
    pub dodge_iframe_from: Fx,
    pub dodge_iframe_to: Fx,
    /// Seconds after a dodge before another is legal. §5.1: 200 ms.
    pub dodge_lockout: Fx,
    /// Multiple of the entity's own top speed a dodge travels at.
    pub dodge_speed_k: Fx,

    /// §12.6: "Warnings precede consequences." A part inside this fraction of a
    /// threshold — fracture, phase or discharge — reports a margin, so nothing
    /// can arrive without an approach the player could have read. §6.3 states
    /// the same requirement from the other side: "no binary hidden threshold
    /// may determine a combat outcome."
    pub margin_band: Fx,

    /// Hardness falloff between `reference_temp` and the melting point.
    pub soften_k: Fx,
    /// The other half of §6.3 step 5's softening: how much of the hardness left
    /// at the threshold a full latent-heat bank takes away. Strictly below 1 —
    /// see [`Material::hardness_softening`] for why a taper to zero makes
    /// melting-under-load impossible rather than merely hard.
    pub phase_soften_k: Fx,
    /// Volume converted per unit of corrosive potential, before per-reaction
    /// rate and the target's corrosion resistance.
    pub reaction_k: Fx,

    pub fragment_max: u32,
    /// §6.3: "bounded to 3 cascade generations to guarantee termination".
    pub cascade_generations: u32,
}

impl Default for Rules {
    fn default() -> Rules {
        // Only a fallback for tests that do not load data; the shipped values
        // live in data/rules.json.
        Rules {
            ambient_temp: Fx::from_int(20),
            reference_temp: Fx::from_int(20),
            aether_density: Fx::from_ratio(3, 10),
            dt: Fx::from_ratio(1, 20),
            fracture_k: Fx::from_int(12),
            blunt_k: Fx::from_int(30),
            deform_k: Fx::from_ratio(31, 100),
            friction_heat_k: Fx::from_ratio(1, 2),
            strike_return_k: Fx::ONE,
            conduction_k: Fx::from_int(2),
            ambient_conduction_k: Fx::from_ratio(1, 20),
            radiant_k: Fx::from_ratio(35, 100),
            radiant_radius: Fx::from_int(4),
            charge_diffusion_k: Fx::from_int(2),
            charge_leak_k: Fx::from_ratio(1, 10),
            arc_radius: Fx::from_int(6),
            arc_loss: Fx::from_ratio(1, 5),
            arc_heat_per_charge: Fx::from_int(2),
            charge_energy_coeff: Fx::from_int(2),
            flux_destabilise_k: Fx::from_ratio(1, 10),
            swing_arc: Fx::from_ratio(11, 10),
            windup_min: Fx::from_ratio(1, 10),
            windup_max: Fx::from_ratio(1, 4),
            windup_mass_k: Fx::from_ratio(1, 40),
            active_min: Fx::from_ratio(3, 50),
            active_max: Fx::from_ratio(3, 25),
            recovery_min: Fx::from_ratio(3, 20),
            recovery_cancel: Fx::from_ratio(2, 5),
            input_buffer: Fx::from_ratio(1, 5),
            dodge_time: Fx::from_ratio(7, 20),
            dodge_iframe_from: Fx::from_ratio(6, 35),
            dodge_iframe_to: Fx::from_ratio(18, 35),
            dodge_lockout: Fx::from_ratio(1, 5),
            dodge_speed_k: Fx::from_ratio(5, 2),
            margin_band: Fx::from_ratio(3, 5),
            soften_k: Fx::from_ratio(9, 10),
            phase_soften_k: Fx::from_ratio(9, 20),
            reaction_k: Fx::ONE,
            fragment_max: 4,
            cascade_generations: 3,
        }
    }
}

/// `"RL01"` little-endian.
pub const RULES_MAGIC: u32 = 0x3130_4C52;
pub const RULES_VERSION: u32 = 2;

impl Rules {
    pub fn decode(buf: &[u8]) -> Result<Rules, DecodeError> {
        let mut r = Reader::new(buf);
        if r.u32()? != RULES_MAGIC {
            return Err(DecodeError::BadMagic);
        }
        if r.u32()? != RULES_VERSION {
            return Err(DecodeError::BadVersion);
        }
        Ok(Rules {
            ambient_temp: r.fx()?,
            reference_temp: r.fx()?,
            aether_density: r.fx()?,
            dt: r.fx()?,
            fracture_k: r.fx()?,
            blunt_k: r.fx()?,
            deform_k: r.fx()?,
            friction_heat_k: r.fx()?,
            strike_return_k: r.fx()?,
            conduction_k: r.fx()?,
            ambient_conduction_k: r.fx()?,
            radiant_k: r.fx()?,
            radiant_radius: r.fx()?,
            charge_diffusion_k: r.fx()?,
            charge_leak_k: r.fx()?,
            arc_radius: r.fx()?,
            arc_loss: r.fx()?,
            arc_heat_per_charge: r.fx()?,
            charge_energy_coeff: r.fx()?,
            flux_destabilise_k: r.fx()?,
            swing_arc: r.fx()?,
            windup_min: r.fx()?,
            windup_max: r.fx()?,
            windup_mass_k: r.fx()?,
            active_min: r.fx()?,
            active_max: r.fx()?,
            recovery_min: r.fx()?,
            recovery_cancel: r.fx()?,
            input_buffer: r.fx()?,
            dodge_time: r.fx()?,
            dodge_iframe_from: r.fx()?,
            dodge_iframe_to: r.fx()?,
            dodge_lockout: r.fx()?,
            dodge_speed_k: r.fx()?,
            margin_band: r.fx()?,
            soften_k: r.fx()?,
            phase_soften_k: r.fx()?,
            reaction_k: r.fx()?,
            fragment_max: r.u32()?,
            cascade_generations: r.u32()?,
        })
    }
}

/// Unit vector, or zero for a zero-length input.
pub fn normalise(v: V3) -> V3 {
    let len = v.length();
    if len.is_zero() {
        V3::ZERO
    } else {
        v.scale(Fx::ONE.div(len))
    }
}

/// §6.3: "total energy must be conservative-or-lossy, never generative."
///
/// Energy-generating loops are named as the #1 exploit vector, so the sim keeps
/// a running ledger rather than relying on a debug assertion that only fires
/// when someone happens to be looking.
#[derive(Clone, Copy, Debug, Default)]
pub struct EnergyLedger {
    /// Energy pushed in from outside the simulation (host-issued impulses).
    pub injected: Fx,
    /// Latent and chemical energy released by material conversion.
    pub released: Fx,
    /// Latent energy absorbed by material conversion.
    pub absorbed: Fx,
    /// Energy that left to the environment.
    pub dissipated: Fx,
}

#[derive(Clone, Copy, Debug)]
pub struct EnergyAudit {
    pub stored: Fx,
    pub injected: Fx,
    pub released: Fx,
    pub absorbed: Fx,
    pub dissipated: Fx,
    /// `stored - (injected + released - absorbed - dissipated)`. Must not be
    /// meaningfully positive.
    pub excess: Fx,
}

impl EnergyAudit {
    /// Tolerance is generous in absolute terms because fixed-point rounding
    /// accumulates over many parts; what matters is that it does not *grow*
    /// with simulated time, which the long-running determinism scenarios check.
    pub fn is_conservative(&self, tolerance: Fx) -> bool {
        self.excess <= tolerance
    }
}

pub struct Sim {
    pub materials: MaterialTable,
    pub forms: FormTable,
    pub rules: Rules,
    pub ecs: Ecs,
    pub events: EventLog,
    pub ledger: EnergyLedger,
    pub tick: u32,
    pub seed: u64,
    pub(crate) pending: Vec<Pending>,
}

impl Sim {
    pub fn new(seed: u64) -> Sim {
        Sim {
            materials: MaterialTable::default(),
            forms: FormTable::default(),
            rules: Rules::default(),
            ecs: Ecs::new(),
            events: EventLog::default(),
            ledger: EnergyLedger::default(),
            tick: 0,
            seed,
            pending: Vec::new(),
        }
    }

    // -----------------------------------------------------------------------
    // Spawning
    // -----------------------------------------------------------------------

    pub fn spawn(&mut self, body: Body, position: V3) -> EntityId {
        let e = self.ecs.spawn(self.seed);
        self.ecs.body.insert(e, body);
        self.ecs.transform.insert(
            e,
            Transform {
                position,
                ..Default::default()
            },
        );
        e
    }

    /// Spawn a body with every part already at `temp`.
    pub fn spawn_at_temp(&mut self, mut body: Body, position: V3, temp: Fx) -> EntityId {
        for i in 0..body.parts.len() {
            body.set_temperature(i, &self.materials, temp);
        }
        self.spawn(body, position)
    }

    /// A single lump of one material — a boulder, a puddle, a fragment.
    pub fn spawn_lump(&mut self, material: MaterialId, volume: Fx, position: V3) -> EntityId {
        let body = Body::new().with_part(Part::new(0, material, volume));
        let temp = self.rules.ambient_temp;
        self.spawn_at_temp(body, position, temp)
    }

    pub fn position_of(&self, e: EntityId) -> V3 {
        self.ecs
            .transform
            .get(e)
            .map(|t| t.position)
            .unwrap_or(V3::ZERO)
    }

    pub fn log(&mut self, e: Event) {
        self.events.push(e);
    }

    pub(crate) fn event(
        &mut self,
        kind: EventKind,
        entity: EntityId,
        part: u16,
        detail: u8,
        a: Fx,
        b: Fx,
    ) {
        let before = self
            .ecs
            .body
            .get(entity)
            .and_then(|b| b.parts.get(part as usize))
            .map(|p| p.material)
            .unwrap_or(NO_MATERIAL);
        let tick = self.tick;
        self.events.push(Event {
            tick,
            kind,
            entity,
            part,
            material_before: before,
            material_after: before,
            detail,
            a,
            b,
        });
    }

    // -----------------------------------------------------------------------
    // The tick
    // -----------------------------------------------------------------------

    /// One simulation step.
    ///
    /// The order below is part of the contract. Impulses resolve first so a
    /// strike and its consequences land in the same tick the host issued them;
    /// conduction and diffusion then run on the post-impact state, which is
    /// what lets heat dumped into one part reach its neighbours; and the phase
    /// scan runs last so a part that was pushed over a threshold *by
    /// conduction alone* still transforms this tick. That last ordering is why
    /// fire spreads and why thermal shock works without either being a feature.
    pub fn step(&mut self) {
        self.agency_pass();
        self.effector_pass();
        self.locomotion_pass();
        self.resolve_pending();
        self.conduction_pass();
        self.radiant_pass();
        self.charge_pass();
        self.phase_pass();
        self.cleanup_pass();
        self.tick = self.tick.wrapping_add(1);
    }

    pub fn run(&mut self, ticks: u32) {
        for _ in 0..ticks {
            self.step();
        }
    }

    /// §6.3 step 4, run over the assembly graph. Symmetric: whatever leaves one
    /// part arrives in the other, so this pass moves energy and never creates
    /// it.
    fn conduction_pass(&mut self) {
        let Sim {
            ecs,
            materials,
            rules,
            ledger,
            ..
        } = self;
        for e in ecs.body.ids() {
            let body = match ecs.body.get_mut(e) {
                Some(b) => b,
                None => continue,
            };
            let links = body.links.clone();
            for (a, b) in links {
                let (ai, bi) = (a as usize, b as usize);
                if ai >= body.parts.len() || bi >= body.parts.len() {
                    continue;
                }
                if !body.parts[ai].attached || !body.parts[bi].attached {
                    continue;
                }
                let ka = match materials.get(body.parts[ai].material) {
                    Some(m) => m.thermal_conductivity,
                    None => continue,
                };
                let kb = match materials.get(body.parts[bi].material) {
                    Some(m) => m.thermal_conductivity,
                    None => continue,
                };
                let tma = body.thermal_mass(ai, materials);
                let tmb = body.thermal_mass(bi, materials);
                if tma <= Fx::ZERO || tmb <= Fx::ZERO {
                    continue;
                }
                let ta = body.temperature(ai, materials, rules.ambient_temp);
                let tb = body.temperature(bi, materials, rules.ambient_temp);
                let delta = ta.sub(tb);
                if delta.is_zero() {
                    continue;
                }
                let rate = ka.mul(kb).mul(rules.conduction_k).mul(rules.dt);
                let mut dq = delta.mul(rate).mul(tma.min(tmb));
                // Never move more than would equalise the pair, so conduction
                // cannot overshoot into an oscillation.
                let equalise = delta.mul(tma).mul(tmb).div(tma.add(tmb));
                if dq.abs() > equalise.abs() {
                    dq = equalise;
                }
                body.parts[ai].heat = body.parts[ai].heat.sub(dq);
                body.parts[bi].heat = body.parts[bi].heat.add(dq);
            }

            // Exchange with the environment. This one is genuinely lossy and is
            // booked as such.
            for i in 0..body.parts.len() {
                if !body.parts[i].attached {
                    continue;
                }
                let k = match materials.get(body.parts[i].material) {
                    Some(m) => m.thermal_conductivity,
                    None => continue,
                };
                let tm = body.thermal_mass(i, materials);
                if tm <= Fx::ZERO {
                    continue;
                }
                let t = body.temperature(i, materials, rules.ambient_temp);
                let delta = t.sub(rules.ambient_temp);
                if delta.is_zero() {
                    continue;
                }
                let mut dq = delta.mul(k).mul(rules.ambient_conduction_k).mul(rules.dt).mul(tm);
                let equalise = delta.mul(tm);
                if dq.abs() > equalise.abs() {
                    dq = equalise;
                }
                body.parts[i].heat = body.parts[i].heat.sub(dq);
                ledger.dissipated = ledger.dissipated.add(dq);
            }
        }
    }

    /// Intent becomes motion. §6.1's `Agency` meeting §6.1's `Locomotion`.
    ///
    /// Top speed falls with everything the entity is carrying, weapon included,
    /// so plate armour and a lead maul are felt in the legs. That coupling is
    /// the whole of "encumbrance" and it is two lines, because mass was already
    /// derived from the materials.
    fn agency_pass(&mut self) {
        let dt = self.rules.dt;
        for e in self.ecs.agency.ids() {
            let agency = match self.ecs.agency.get(e) {
                Some(a) => *a,
                None => continue,
            };
            // Facing is mirrored onto the transform so the renderer, the reach
            // test and the state hash all read the same number.
            if let Some(t) = self.ecs.transform.get_mut(e) {
                t.orientation = agency.facing;
            }
            let loco = match self.ecs.locomotion.get(e) {
                Some(l) => *l,
                None => continue,
            };

            let mut carried = self
                .ecs
                .body
                .get(e)
                .map(|b| b.total_mass(&self.materials))
                .unwrap_or(Fx::ZERO);
            if let Some(w) = self.ecs.effectors.get(e).and_then(|f| f.wielded) {
                carried = carried.add(
                    self.ecs
                        .body
                        .get(w)
                        .map(|b| b.total_mass(&self.materials))
                        .unwrap_or(Fx::ZERO),
                );
            }
            let reference = loco.mass_ref.max(Fx::EPSILON);
            let speed = loco.max_speed.mul(reference).div(reference.add(carried));

            // §5.1's commitment, expressed in the legs. A committed attack does
            // not travel: windup and the active frames pin the entity in place,
            // and recovery releases it only after `recovery_cancel` of its
            // length. A dodge overrides intent entirely for its duration and
            // goes where it was aimed when it started.
            //
            // Nothing here asks what kind of entity this is. An entity with no
            // `Effectors` is never pinned, because it never commits to
            // anything — which is exactly right for a rolling boulder.
            let eff = self.ecs.effectors.get(e).copied();
            let desired = match eff {
                Some(f) if f.dodge_left.is_positive() => {
                    normalise(f.dodge_dir).scale(speed.mul(self.rules.dodge_speed_k))
                }
                Some(f) if !f.can_act(self.rules.recovery_cancel) => V3::ZERO,
                _ => normalise(agency.move_dir).scale(speed),
            };
            // A dodge is a burst, not an acceleration: it reaches its speed on
            // the tick it starts, or the 350 ms in §5.1 is spent getting going.
            let dodging = eff.map(|f| f.dodge_left.is_positive()).unwrap_or(false);
            if let Some(t) = self.ecs.transform.get_mut(e) {
                let delta = desired.sub(t.velocity);
                let len = delta.length();
                let step = loco.accel.mul(dt);
                t.velocity = if dodging || len <= step || len.is_zero() {
                    desired
                } else {
                    t.velocity.add(delta.scale(step.div(len)))
                };
            }
        }
    }

    /// §5.1's commitment model: advance every attack phase, then start whatever
    /// the intent asks for and the phase allows.
    ///
    /// The whole of "combat feel" in this project is this function plus the
    /// movement lock in [`Sim::agency_pass`]. There is no combo system, no
    /// stamina and no animation state machine — a phase is a duration and a
    /// permission, and the durations come from the weapon (§5.1: "a
    /// player-crafted absurdly heavy maul feels absurdly heavy with no
    /// tuning").
    ///
    /// Order within the tick matters and is deliberate: timers advance first,
    /// so a phase that ends this tick releases the entity this tick; the blow
    /// resolves on the windup → active edge, so a swing that was committed to
    /// lands even if the intent has since been dropped; and intent is read last,
    /// so a queued input can fire on the same tick recovery ends. That last one
    /// is §5.1's input buffer doing its job — "queued inputs during recovery
    /// fire on the first legal frame".
    fn effector_pass(&mut self) {
        let dt = self.rules.dt;
        let cancel = self.rules.recovery_cancel;
        let mut landing = Vec::new();

        for e in self.ecs.effectors.ids() {
            // --- advance timers ---------------------------------------------
            let mut ended = None;
            if let Some(f) = self.ecs.effectors.get_mut(e) {
                f.buffered = f.buffered.sub(dt).max(Fx::ZERO);
                f.dodge_lockout = f.dodge_lockout.sub(dt).max(Fx::ZERO);
                if f.dodge_left.is_positive() {
                    f.dodge_left = f.dodge_left.sub(dt).max(Fx::ZERO);
                }
                if f.phase != AttackPhase::Idle {
                    f.phase_left = f.phase_left.sub(dt).max(Fx::ZERO);
                    if f.phase_left <= Fx::ZERO {
                        ended = Some(f.phase);
                    }
                }
            }

            // --- phase transitions -------------------------------------------
            match ended {
                Some(AttackPhase::Windup) => landing.push(e),
                Some(AttackPhase::Active) => {
                    let recovery = self
                        .ecs
                        .effectors
                        .get(e)
                        .map(|f| f.phase_total)
                        .unwrap_or(Fx::ZERO);
                    if let Some(f) = self.ecs.effectors.get_mut(e) {
                        // `phase_total` carried the recovery length through the
                        // active frames so the strike could be resolved without
                        // deriving the profile twice.
                        f.phase = AttackPhase::Recovery;
                        f.phase_left = recovery;
                        f.phase_total = recovery;
                    }
                }
                Some(AttackPhase::Recovery) => {
                    if let Some(f) = self.ecs.effectors.get_mut(e) {
                        f.phase = AttackPhase::Idle;
                        f.phase_total = Fx::ZERO;
                    }
                }
                _ => {}
            }
        }

        // The windup is paid for; the blow lands. Resolution is unchanged from
        // an immediate swing — the phases decide *when*, never *what*.
        for e in landing {
            self.enter_active(e);
        }

        // --- intent -----------------------------------------------------------
        for e in self.ecs.effectors.ids() {
            let (wants_strike, wants_dodge) = match self.ecs.agency.get(e) {
                Some(a) => (a.want_strike, a.want_dodge),
                None => (false, false),
            };
            if wants_strike {
                let buffer = self.rules.input_buffer;
                if let Some(f) = self.ecs.effectors.get_mut(e) {
                    // §5.1 scopes the queue to recovery — "queued inputs during
                    // recovery fire on the first legal frame" — so a press made
                    // there is held until the cancel point however far off it
                    // is. A flat 200 ms would drop a press made at the start of
                    // a heavy weapon's recovery, which is exactly the case the
                    // rule exists to fix, and is where the difference between
                    // responsive and sluggish is actually felt.
                    //
                    // Everywhere else the flat buffer applies. A press during
                    // windup is most of a second from a legal tick, and holding
                    // it would turn one tap into a swing the player had stopped
                    // asking for.
                    //
                    // It is held for the rest of this recovery and one tick
                    // more. Both timers fall by `dt` in this same pass, so a
                    // queue set to exactly the time remaining would expire on
                    // the very tick it was waiting for.
                    f.buffered = if f.phase == AttackPhase::Recovery {
                        f.phase_left.add(dt).max(buffer)
                    } else {
                        buffer
                    };
                }
            }
            if let Some(a) = self.ecs.agency.get_mut(e) {
                a.want_strike = false;
                a.want_dodge = false;
            }

            let f = match self.ecs.effectors.get(e) {
                Some(f) => *f,
                None => continue,
            };
            // A dodge outranks a queued swing: it is the defensive option, and
            // an input buffer that swallowed it would be felt as the game
            // ignoring you at the worst possible moment.
            if wants_dodge && f.can_act(cancel) && f.dodge_lockout <= Fx::ZERO {
                self.begin_dodge(e);
                continue;
            }
            if f.buffered.is_positive() && f.can_act(cancel) {
                self.begin_swing(e);
            }
        }
    }

    /// Start a dodge in the direction the entity is trying to move, or straight
    /// backwards if it is standing still.
    fn begin_dodge(&mut self, e: EntityId) {
        let intent = self
            .ecs
            .agency
            .get(e)
            .map(|a| a.move_dir)
            .unwrap_or(V3::ZERO);
        let facing = self.ecs.agency.get(e).map(|a| a.facing).unwrap_or(Fx::ZERO);
        let dir = if intent.length_squared().is_positive() {
            normalise(intent)
        } else {
            V3::new(facing.cos().neg(), facing.sin().neg(), Fx::ZERO)
        };
        let (time, lockout) = (self.rules.dodge_time, self.rules.dodge_lockout);
        if let Some(f) = self.ecs.effectors.get_mut(e) {
            f.dodge_left = time;
            f.dodge_lockout = time.add(lockout);
            f.dodge_dir = dir;
            // Dodging cancels a recovery that had reached its cancel point.
            if f.phase == AttackPhase::Recovery {
                f.phase = AttackPhase::Idle;
                f.phase_left = Fx::ZERO;
                f.phase_total = Fx::ZERO;
            }
        }
        let tick = self.tick;
        self.events.push(Event {
            tick,
            kind: EventKind::Dodged,
            entity: e,
            part: 0,
            material_before: NO_MATERIAL,
            material_after: NO_MATERIAL,
            detail: 0,
            a: time,
            b: self
                .rules
                .dodge_time
                .mul(self.rules.dodge_iframe_to.sub(self.rules.dodge_iframe_from)),
        });
    }

    /// Integrate velocity, then push overlapping bodies apart.
    fn locomotion_pass(&mut self) {
        let dt = self.rules.dt;
        for e in self.ecs.locomotion.ids() {
            if let Some(t) = self.ecs.transform.get_mut(e) {
                let step = t.velocity.scale(dt);
                t.position = t.position.add(step);
            }
        }
        self.separation_pass();
        self.carry_pass();
    }

    /// Carried things go where the carrier goes.
    ///
    /// Without this a wielded weapon stays wherever it was spawned, and §6.3's
    /// promise that "an ice weapon melts if you fight near lava. Then you're
    /// unarmed" is unreachable in play: radiant heat is positional, so the
    /// sword has to actually be in the fight to be ruined by it.
    fn carry_pass(&mut self) {
        let mut carried: Vec<(EntityId, V3)> = Vec::new();
        for e in self.ecs.effectors.ids() {
            if let Some(w) = self.ecs.effectors.get(e).and_then(|f| f.wielded) {
                carried.push((w, self.position_of(e)));
            }
        }
        for (weapon, position) in carried {
            if let Some(t) = self.ecs.transform.get_mut(weapon) {
                t.position = position;
            }
        }
    }

    /// Keep moving bodies out of each other.
    ///
    /// Not physics — §3 lists rigid-body everything as a non-goal, and this
    /// resolves overlap without momentum, friction or rotation. It exists so a
    /// character cannot stand inside the thing it is hitting, which is the
    /// minimum a melee range test needs to mean anything. Only entities that
    /// can move are moved, so props stay where they were placed.
    fn separation_pass(&mut self) {
        let movers = self.ecs.locomotion.ids();
        let others = self.ecs.body.ids();
        for e in movers {
            let held = self.ecs.effectors.get(e).and_then(|f| f.wielded);
            let (pos, extent) = match self.ecs.body.get(e) {
                Some(b) => (self.position_of(e), b.extent()),
                None => continue,
            };
            let mut push = V3::ZERO;
            for &other in &others {
                if other == e || Some(other) == held {
                    continue;
                }
                let other_extent = match self.ecs.body.get(other) {
                    Some(b) => b.extent(),
                    None => continue,
                };
                let delta = pos.sub(self.position_of(other));
                let distance = delta.length();
                let minimum = extent.add(other_extent);
                if distance >= minimum {
                    continue;
                }
                push = push.add(if distance.is_zero() {
                    // Exactly coincident: pick an axis rather than divide by zero.
                    V3::new(minimum, Fx::ZERO, Fx::ZERO)
                } else {
                    delta.scale(minimum.sub(distance).div(distance))
                });
            }
            if !push.length_squared().is_zero() {
                if let Some(t) = self.ecs.transform.get_mut(e) {
                    t.position = t.position.add(push);
                }
            }
        }
    }

    /// Heat exchange between separate entities standing near one another.
    ///
    /// Gather-then-apply like everything else, and symmetric per pair, so the
    /// result does not depend on which entity is visited first. Pairwise is
    /// affordable in a bare arena; at world scale this belongs behind §14.3's
    /// active ring, which is a change of *which pairs* are considered and not a
    /// change to the rule.
    fn radiant_pass(&mut self) {
        if !self.rules.radiant_k.is_positive() {
            return;
        }
        let ids = self.ecs.body.ids();
        let mut deltas: Vec<(EntityId, u16, Fx)> = Vec::new();
        for (ii, &a) in ids.iter().enumerate() {
            for &b in ids.iter().skip(ii + 1) {
                let d = self.position_of(a).distance(self.position_of(b));
                if d > self.rules.radiant_radius {
                    continue;
                }
                let falloff = Fx::ONE.div(Fx::ONE.add(d.mul(d)));
                let rate = self.rules.radiant_k.mul(self.rules.dt).mul(falloff);
                let (ba, bb) = match (self.ecs.body.get(a), self.ecs.body.get(b)) {
                    (Some(x), Some(y)) => (x, y),
                    _ => continue,
                };
                for i in 0..ba.parts.len() {
                    if !ba.parts[i].attached || !ba.parts[i].is_live() {
                        continue;
                    }
                    let tma = ba.thermal_mass(i, &self.materials);
                    if tma <= Fx::ZERO {
                        continue;
                    }
                    let ta = ba.temperature(i, &self.materials, self.rules.ambient_temp);
                    for j in 0..bb.parts.len() {
                        if !bb.parts[j].attached || !bb.parts[j].is_live() {
                            continue;
                        }
                        let tmb = bb.thermal_mass(j, &self.materials);
                        if tmb <= Fx::ZERO {
                            continue;
                        }
                        let tb = bb.temperature(j, &self.materials, self.rules.ambient_temp);
                        let delta = ta.sub(tb);
                        if delta.is_zero() {
                            continue;
                        }
                        // Radiation scales with the size of the facing
                        // surfaces, not with how much heat they happen to
                        // store, so the coupling uses volume. Using thermal
                        // mass here would make a fire's low-heat-capacity ash
                        // a poor radiator, which is backwards.
                        let area = ba.parts[i].volume.min(bb.parts[j].volume);
                        let mut dq = delta.mul(rate).mul(area);
                        let equalise = delta.mul(tma).mul(tmb).div(tma.add(tmb));
                        if dq.abs() > equalise.abs() {
                            dq = equalise;
                        }
                        deltas.push((a, i as u16, dq.neg()));
                        deltas.push((b, j as u16, dq));
                    }
                }
            }
        }
        for (e, part, dq) in deltas {
            if let Some(body) = self.ecs.body.get_mut(e) {
                if let Some(p) = body.parts.get_mut(part as usize) {
                    p.heat = p.heat.add(dq);
                }
            }
        }
    }

    /// Charge spreads along the assembly by conductivity, and bleeds away
    /// through materials the field passes through easily.
    ///
    /// The bleed term is why `aether_permeability` and `aether_capacity` are
    /// different axes: a permeable material is a poor battery and a good
    /// conduit, which is the difference between a wand and a capacitor and it
    /// is a difference the player can measure.
    fn charge_pass(&mut self) {
        // §12.6: "`Charge` near `discharge_threshold` → visible arcs leaping to
        // nearby conductive surfaces — this is a *warning*, and it must fire
        // before the discharge, not with it." So the margin is measured across
        // the pass and reported on the tick a part *enters* the band, which is
        // strictly before the tick it leaves it from the top.
        let before = self.charge_margins();
        let Sim {
            ecs,
            materials,
            rules,
            ..
        } = self;
        for e in ecs.body.ids() {
            let body = match ecs.body.get_mut(e) {
                Some(b) => b,
                None => continue,
            };
            let links = body.links.clone();
            for (a, b) in links {
                let (ai, bi) = (a as usize, b as usize);
                if ai >= body.parts.len() || bi >= body.parts.len() {
                    continue;
                }
                if !body.parts[ai].attached || !body.parts[bi].attached {
                    continue;
                }
                let ca = match materials.get(body.parts[ai].material) {
                    Some(m) => m.conductivity,
                    None => continue,
                };
                let cb = match materials.get(body.parts[bi].material) {
                    Some(m) => m.conductivity,
                    None => continue,
                };
                let delta = body.parts[ai].charge.sub(body.parts[bi].charge);
                if delta.is_zero() {
                    continue;
                }
                let rate = ca
                    .mul(cb)
                    .mul(rules.charge_diffusion_k)
                    .mul(rules.dt)
                    .clamp(Fx::ZERO, Fx::HALF);
                let move_q = delta.mul(rate);
                body.parts[ai].charge = body.parts[ai].charge.sub(move_q);
                body.parts[bi].charge = body.parts[bi].charge.add(move_q);
            }
            for i in 0..body.parts.len() {
                if !body.parts[i].attached || body.parts[i].charge.is_zero() {
                    continue;
                }
                let perm = match materials.get(body.parts[i].material) {
                    Some(m) => m.aether_permeability,
                    None => continue,
                };
                let leak = body.parts[i]
                    .charge
                    .mul(perm)
                    .mul(rules.charge_leak_k)
                    .mul(rules.dt);
                body.parts[i].charge = body.parts[i].charge.sub(leak);
            }
        }
        self.discharge_scan();
        self.report_charge_margins(&before);
    }

    /// Every live part's charge as a fraction of the limit it will arc at.
    fn charge_margins(&self) -> Vec<(EntityId, u16, Fx)> {
        let mut out = Vec::new();
        for e in self.ecs.body.ids() {
            let body = match self.ecs.body.get(e) {
                Some(b) => b,
                None => continue,
            };
            for (i, p) in body.parts.iter().enumerate() {
                if !p.attached || !p.is_live() || !p.charge.is_positive() {
                    continue;
                }
                let m = match self.materials.get(p.material) {
                    Some(m) => m,
                    None => continue,
                };
                let limit = m.discharge_threshold.min(m.aether_capacity);
                if limit.is_positive() {
                    out.push((e, i as u16, p.charge.div(limit)));
                }
            }
        }
        out
    }

    /// Emit a [`EventKind::Nearing`] for each part that crossed into the warning
    /// band this tick. Crossings only: a charged rock sitting at 80% of its
    /// threshold is a state the world is already showing (§12.1), not news.
    fn report_charge_margins(&mut self, before: &[(EntityId, u16, Fx)]) {
        let band = self.rules.margin_band;
        let after = self.charge_margins();
        let mut i = 0usize;
        for &(e, part, now) in &after {
            if now < band || now >= Fx::ONE {
                continue;
            }
            // Both lists are built in the same id-then-part order, so this walks
            // forward instead of searching (§14.4 rule 6 — no maps, and no
            // iteration order that depends on anything but the ids).
            while i < before.len() && (before[i].0, before[i].1) < (e, part) {
                i += 1;
            }
            let was = if i < before.len() && (before[i].0, before[i].1) == (e, part) {
                before[i].2
            } else {
                Fx::ZERO
            };
            if was >= band {
                continue;
            }
            let limit = self
                .ecs
                .body
                .get(e)
                .and_then(|b| b.parts.get(part as usize))
                .and_then(|p| self.materials.get(p.material))
                .map(|m| m.discharge_threshold.min(m.aether_capacity))
                .unwrap_or(Fx::ZERO);
            let tick = self.tick;
            let material = self
                .ecs
                .body
                .get(e)
                .and_then(|b| b.parts.get(part as usize))
                .map(|p| p.material)
                .unwrap_or(NO_MATERIAL);
            self.events.push(Event {
                tick,
                kind: EventKind::Nearing,
                entity: e,
                part,
                material_before: material,
                material_after: material,
                detail: 2,
                a: now,
                b: limit,
            });
        }
    }

    /// §6.3 step 6, run every tick rather than only on impact, so a part
    /// charged slowly still eventually arcs.
    fn discharge_scan(&mut self) {
        let mut arcs: Vec<(EntityId, u16, Fx, Fx)> = Vec::new();
        for e in self.ecs.body.ids() {
            let body = match self.ecs.body.get(e) {
                Some(b) => b,
                None => continue,
            };
            for (i, p) in body.parts.iter().enumerate() {
                if !p.attached || !p.is_live() {
                    continue;
                }
                let m = match self.materials.get(p.material) {
                    Some(m) => m,
                    None => continue,
                };
                let limit = m.discharge_threshold.min(m.aether_capacity);
                if limit > Fx::ZERO && p.charge > limit {
                    arcs.push((e, i as u16, p.charge.sub(limit), limit));
                }
            }
        }
        for (e, part, excess, limit) in arcs {
            self.discharge(e, part, excess, limit);
        }
    }

    /// §6.3 step 5, run over every part rather than only struck ones.
    fn phase_pass(&mut self) {
        for e in self.ecs.body.ids() {
            let count = match self.ecs.body.get(e) {
                Some(b) => b.parts.len(),
                None => continue,
            };
            for i in 0..count {
                self.check_phase(e, i as u16);
            }
        }
    }

    /// Retire parts and entities that no longer physically exist.
    fn cleanup_pass(&mut self) {
        let mut dead: Vec<EntityId> = Vec::new();
        for e in self.ecs.body.ids() {
            let mut destroyed: Vec<(u16, Fx)> = Vec::new();
            if let Some(body) = self.ecs.body.get_mut(e) {
                for (i, p) in body.parts.iter_mut().enumerate() {
                    if p.attached && p.material != NO_MATERIAL && !p.is_live() {
                        destroyed.push((i as u16, p.volume));
                        p.attached = false;
                        p.material = NO_MATERIAL;
                        p.volume = Fx::ZERO;
                        p.heat = Fx::ZERO;
                        p.charge = Fx::ZERO;
                    }
                }
            }
            for (part, volume) in destroyed {
                self.event(EventKind::Destroyed, e, part, 0, volume, Fx::ZERO);
            }
            if let Some(body) = self.ecs.body.get(e) {
                if !body.any_live() {
                    dead.push(e);
                }
            }
        }
        for e in dead {
            self.ecs.despawn(e);
        }
    }

    // -----------------------------------------------------------------------
    // Phase transitions
    // -----------------------------------------------------------------------

    /// Advance a part's phase state by one step.
    ///
    /// Returns true if the part actually became a different material this call.
    ///
    /// Reversible transitions run through a latent-heat bank: the part holds at
    /// its threshold temperature while energy accumulates in
    /// [`Part::phase_progress`], and only converts once the bank is full. The
    /// bank is bidirectional — heat flowing back out unwinds it — which is what
    /// makes a half-melted thing a real state rather than a rounding artefact.
    ///
    /// This has to be persistent across ticks. An earlier version reset the
    /// bank whenever the part was not currently past its threshold, and since
    /// conduction runs *between* the two phase checks in a tick, every part sat
    /// a hair below its threshold at exactly the moment it was inspected. The
    /// bank was discarded every tick and nothing ever melted.
    pub(crate) fn check_phase(&mut self, e: EntityId, part: u16) -> bool {
        let (material, volume, attached, banked_target) = {
            let body = match self.ecs.body.get(e) {
                Some(b) => b,
                None => return false,
            };
            let p = match body.parts.get(part as usize) {
                Some(p) => p,
                None => return false,
            };
            (p.material, p.volume, p.attached && p.is_live(), p.phase_target)
        };
        if !attached {
            return false;
        }
        let m = match self.materials.get(material) {
            Some(m) => *m,
            None => return false,
        };

        // An open bank owns the part until it fills or empties.
        if banked_target != crate::body::NO_TRANSITION {
            if let Some(t) = Transition::from_u8(banked_target) {
                let point = *m.phase(t);
                if point.present && point.product != NO_MATERIAL && point.product != material {
                    return self.plateau(e, part, t, point, volume, material);
                }
            }
            // The material changed underneath the bank; it no longer means
            // anything, so hand the energy back.
            self.discard_phase_bank(e, part);
        }

        let temp = self
            .ecs
            .body
            .get(e)
            .map(|b| b.temperature(part as usize, &self.materials, self.rules.ambient_temp))
            .unwrap_or(self.rules.ambient_temp);

        // Upward crossings: take the most advanced threshold the part has
        // passed, so something both above its melt point and above its ignition
        // point burns rather than puddling.
        let mut chosen: Option<(Transition, PhasePoint)> = None;
        for t in [Transition::Melt, Transition::Boil, Transition::Ignite] {
            let p = *m.phase(t);
            if p.present && temp >= p.temp {
                match chosen {
                    Some((_, best)) if best.temp >= p.temp => {}
                    _ => chosen = Some((t, p)),
                }
            }
        }
        if chosen.is_none() {
            let p = *m.phase(Transition::Solidify);
            if p.present && temp <= p.temp {
                chosen = Some((Transition::Solidify, p));
            }
        }

        let (transition, point) = match chosen {
            Some(c) => c,
            None => return false,
        };
        if point.product == NO_MATERIAL || point.product == material {
            return false;
        }

        // Ignition is a chemical release with no reverse and no plateau: heat
        // carries across unchanged and the declared energy is added on top, so
        // the residue is hotter than the thing that caught. That is why one
        // burning log can reach the next. `tools/fuzz.ts` checks the product
        // graph for a path back.
        if transition == Transition::Ignite {
            let latent = point.latent.mul(volume);
            if let Some(body) = self.ecs.body.get_mut(e) {
                if let Some(p) = body.parts.get_mut(part as usize) {
                    p.material = point.product;
                    p.heat = p.heat.add(latent);
                    p.phase_progress = Fx::ZERO;
                    p.phase_target = crate::body::NO_TRANSITION;
                }
            }
            if latent.is_positive() {
                self.ledger.released = self.ledger.released.add(latent);
            } else {
                self.ledger.absorbed = self.ledger.absorbed.sub(latent);
            }
            let tick = self.tick;
            self.events.push(Event {
                tick,
                kind: EventKind::PhaseChange,
                entity: e,
                part,
                material_before: material,
                material_after: point.product,
                detail: transition as u8,
                a: temp,
                b: point.temp,
            });
            return true;
        }

        // Open a bank and take the first step on it.
        if let Some(body) = self.ecs.body.get_mut(e) {
            if let Some(p) = body.parts.get_mut(part as usize) {
                p.phase_target = transition as u8;
                p.phase_progress = Fx::ZERO;
            }
        }
        self.plateau(e, part, transition, point, volume, material)
    }

    /// One step of a latent-heat plateau.
    ///
    /// Heat above (or below) the threshold moves into the bank and the part is
    /// pinned to the threshold temperature. Nothing is booked here: the bank is
    /// counted by [`Sim::stored_energy`], so moving energy between heat and
    /// bank leaves the world total untouched. Only the conversion itself
    /// exchanges energy with the material's latent reservoir, and that is the
    /// one place this function touches the ledger.
    fn plateau(
        &mut self,
        e: EntityId,
        part: u16,
        transition: Transition,
        point: PhasePoint,
        volume: Fx,
        material: MaterialId,
    ) -> bool {
        let tm = self
            .ecs
            .body
            .get(e)
            .map(|b| b.thermal_mass(part as usize, &self.materials))
            .unwrap_or(Fx::ZERO);
        if tm <= Fx::ZERO {
            return false;
        }
        let threshold_heat = point.temp.mul(tm);
        let required = point.latent.abs().mul(volume);
        let (heat, progress_before) = match self
            .ecs
            .body
            .get(e)
            .and_then(|b| b.parts.get(part as usize))
        {
            Some(p) => (p.heat, p.phase_progress),
            None => return false,
        };
        let temp_before = heat.div(tm);
        let progress = progress_before.add(heat.sub(threshold_heat));
        let upward = transition != Transition::Solidify;

        let full = if upward {
            progress >= required
        } else {
            progress <= required.neg()
        };
        let unwound = if upward {
            progress <= Fx::ZERO
        } else {
            progress >= Fx::ZERO
        };

        if !full {
            if unwound {
                // The part cooled (or warmed) back out of the transition. Give
                // the banked energy back and stop pinning the temperature.
                if let Some(body) = self.ecs.body.get_mut(e) {
                    if let Some(p) = body.parts.get_mut(part as usize) {
                        p.heat = threshold_heat.add(progress);
                        p.phase_progress = Fx::ZERO;
                        p.phase_target = crate::body::NO_TRANSITION;
                    }
                }
            } else {
                if let Some(body) = self.ecs.body.get_mut(e) {
                    if let Some(p) = body.parts.get_mut(part as usize) {
                        p.heat = threshold_heat;
                        p.phase_progress = progress;
                    }
                }
                // §12.6, and §6.3 step 5's "a blade you have been heating gets
                // worse before it dies": the bank crossing into the warning band
                // is the moment the part is visibly losing. Reported on the
                // crossing only, so a fire under a cauldron does not fill the
                // Readout with the same line every tick.
                let band = self.rules.margin_band.mul(required);
                if progress.abs() >= band && progress_before.abs() < band {
                    let tick = self.tick;
                    self.events.push(Event {
                        tick,
                        kind: EventKind::Nearing,
                        entity: e,
                        part,
                        material_before: material,
                        material_after: point.product,
                        detail: 1,
                        a: progress.abs().div(required.max(Fx::EPSILON)),
                        b: point.temp,
                    });
                }
            }
            return false;
        }

        // The plateau is paid for. Convert, and carry the overshoot across.
        let leftover = if upward {
            progress.sub(required)
        } else {
            progress.add(required)
        };
        let new_tm = {
            if let Some(body) = self.ecs.body.get_mut(e) {
                if let Some(p) = body.parts.get_mut(part as usize) {
                    p.material = point.product;
                    p.phase_progress = Fx::ZERO;
                    p.phase_target = crate::body::NO_TRANSITION;
                }
            }
            self.ecs
                .body
                .get(e)
                .map(|b| b.thermal_mass(part as usize, &self.materials))
                .unwrap_or(Fx::ZERO)
        };
        let new_heat = point.temp.mul(new_tm).add(leftover);
        if let Some(body) = self.ecs.body.get_mut(e) {
            if let Some(p) = body.parts.get_mut(part as usize) {
                p.heat = new_heat;
            }
        }
        // Everything the world holds moved from (heat + bank) to (heat). The
        // difference is the latent heat of the transition, coming out of or
        // going into the material's own reservoir.
        let delta = new_heat.sub(threshold_heat).sub(progress);
        if delta.is_positive() {
            self.ledger.released = self.ledger.released.add(delta);
        } else {
            self.ledger.absorbed = self.ledger.absorbed.sub(delta);
        }

        let tick = self.tick;
        self.events.push(Event {
            tick,
            kind: EventKind::PhaseChange,
            entity: e,
            part,
            material_before: material,
            material_after: point.product,
            detail: transition as u8,
            a: temp_before,
            b: point.temp,
        });
        true
    }

    /// Return a bank's energy to the part and close it.
    fn discard_phase_bank(&mut self, e: EntityId, part: u16) {
        if let Some(body) = self.ecs.body.get_mut(e) {
            if let Some(p) = body.parts.get_mut(part as usize) {
                p.heat = p.heat.add(p.phase_progress);
                p.phase_progress = Fx::ZERO;
                p.phase_target = crate::body::NO_TRANSITION;
            }
        }
    }


    // -----------------------------------------------------------------------
    // Discharge
    // -----------------------------------------------------------------------

    /// Move charge above a part's threshold to the best nearby conductor.
    ///
    /// "This is how chain lightning happens without a 'chain lightning'
    /// feature" (§6.3 step 6). The target search is a plain ranking over
    /// conductivity and distance; a wet target wins it because water conducts,
    /// not because anything here knows what water is.
    pub(crate) fn discharge(&mut self, e: EntityId, part: u16, excess: Fx, limit: Fx) {
        if let Some(body) = self.ecs.body.get_mut(e) {
            if let Some(p) = body.parts.get_mut(part as usize) {
                p.charge = p.charge.sub(excess);
            }
        }
        let loss = excess.mul(self.rules.arc_loss);
        let delivered = excess.sub(loss);
        let heat = loss.mul(self.rules.arc_heat_per_charge);

        match self.arc_target(e, part) {
            Some((te, tp)) => {
                self.queue_secondary(Pending {
                    target: te,
                    part: tp,
                    imp: crate::impulse::Impulse {
                        charge: delivered,
                        thermal: heat,
                        aether_flux: excess,
                        ..Default::default()
                    },
                });
                let tick = self.tick;
                self.events.push(Event {
                    tick,
                    kind: EventKind::Discharged,
                    entity: e,
                    part,
                    material_before: te as MaterialId,
                    material_after: tp,
                    detail: 1,
                    a: delivered,
                    b: limit,
                });
            }
            None => {
                // Nowhere to go: the energy stays here as heat. Overcharging an
                // isolated object cooks it, which is a consequence, not a
                // failure case.
                if let Some(body) = self.ecs.body.get_mut(e) {
                    if let Some(p) = body.parts.get_mut(part as usize) {
                        p.heat = p.heat.add(excess.mul(self.rules.arc_heat_per_charge));
                    }
                }
                self.event(EventKind::Discharged, e, part, 0, excess, limit);
            }
        }
    }

    /// Highest `conductivity * (potential difference) / (1 + distance)`.
    ///
    /// The potential term is what makes a chain walk outward instead of
    /// ping-ponging between the first two objects it finds: charge flows
    /// downhill, so a target that has already been filled stops being
    /// attractive. Ties break to the lowest `(entity, part)` so the choice
    /// never depends on iteration order.
    fn arc_target(&self, from: EntityId, from_part: u16) -> Option<(EntityId, u16)> {
        let origin = self.position_of(from);
        let source_charge = self
            .ecs
            .body
            .get(from)
            .and_then(|b| b.parts.get(from_part as usize))
            .map(|p| p.charge)
            .unwrap_or(Fx::ZERO);
        let mut best: Option<(Fx, EntityId, u16)> = None;

        // Highest score wins; ties go to the lowest (entity, part) so the
        // choice never depends on iteration order.
        fn consider(
            score: Fx,
            e: EntityId,
            p: u16,
            best: &mut Option<(Fx, EntityId, u16)>,
        ) {
            if score <= Fx::ZERO {
                return;
            }
            let better = match *best {
                None => true,
                Some((bs, be, bp)) => score > bs || (score == bs && (e, p) < (be, bp)),
            };
            if better {
                *best = Some((score, e, p));
            }
        }

        // Parts of the same assembly are at distance zero — the arc prefers to
        // stay inside the object it is already in.
        if let Some(body) = self.ecs.body.get(from) {
            for n in body.neighbours(from_part) {
                if let Some(p) = body.parts.get(n as usize) {
                    if p.attached && p.is_live() {
                        if let Some(m) = self.materials.get(p.material) {
                            let drop = source_charge.sub(p.charge).max(Fx::ZERO);
                            consider(m.conductivity.mul(drop), from, n, &mut best);
                        }
                    }
                }
            }
        }

        for e in self.ecs.body.ids() {
            if e == from {
                continue;
            }
            let d = origin.distance(self.position_of(e));
            if d > self.rules.arc_radius {
                continue;
            }
            let body = match self.ecs.body.get(e) {
                Some(b) => b,
                None => continue,
            };
            for (i, p) in body.parts.iter().enumerate() {
                if !p.attached || !p.is_live() {
                    continue;
                }
                if let Some(m) = self.materials.get(p.material) {
                    let drop = source_charge.sub(p.charge).max(Fx::ZERO);
                    let score = m.conductivity.mul(drop).div(Fx::ONE.add(d));
                    consider(score, e, i as u16, &mut best);
                }
            }
        }
        best.map(|(_, e, p)| (e, p))
    }

    // -----------------------------------------------------------------------
    // Energy audit and state hashing
    // -----------------------------------------------------------------------

    pub fn stored_energy(&self) -> Fx {
        let mut total = Fx::ZERO;
        for (_, body) in self.ecs.body.iter() {
            let (heat, charge) = body.stored_energy();
            total = total.add(heat).add(charge.mul(self.rules.charge_energy_coeff));
        }
        total
    }

    pub fn audit(&self, baseline: Fx) -> EnergyAudit {
        let stored = self.stored_energy();
        let l = self.ledger;
        let accounted = baseline
            .add(l.injected)
            .add(l.released)
            .sub(l.absorbed)
            .sub(l.dissipated);
        EnergyAudit {
            stored,
            injected: l.injected,
            released: l.released,
            absorbed: l.absorbed,
            dissipated: l.dissipated,
            excess: stored.sub(accounted),
        }
    }

    /// §14.4 rule 9's fingerprint. Walks entities in id order and parts in
    /// index order; touches no name bytes, no pointers and no floats.
    pub fn state_hash(&self) -> u64 {
        let mut h = Hasher::new();
        h.write_u32(self.tick);
        h.write_u64(self.seed);
        for e in self.ecs.live_ids() {
            h.write_u32(e);
            if let Some(t) = self.ecs.transform.get(e) {
                h.write_u8(1);
                for v in [
                    t.position.x,
                    t.position.y,
                    t.position.z,
                    t.velocity.x,
                    t.velocity.y,
                    t.velocity.z,
                    t.orientation,
                ] {
                    h.write_i64(v.raw());
                }
            } else {
                h.write_u8(0);
            }
            if let Some(f) = self.ecs.effectors.get(e) {
                h.write_u8(1);
                h.write_i64(f.strength.raw());
                // §5.1's phase machine is simulation state, not presentation:
                // whether a blow lands this tick depends on it, so a host that
                // disagreed about it would be desynced whether or not the
                // divergence had reached a position yet.
                h.write_u8(f.phase as u8);
                for v in [f.phase_left, f.phase_total, f.buffered, f.dodge_left, f.dodge_lockout] {
                    h.write_i64(v.raw());
                }
                h.write_u32(f.wielded.unwrap_or(u32::MAX));
            } else {
                h.write_u8(0);
            }
            if let Some(l) = self.ecs.locomotion.get(e) {
                h.write_u8(1);
                h.write_i64(l.max_speed.raw());
                h.write_i64(l.accel.raw());
                h.write_i64(l.mass_ref.raw());
            } else {
                h.write_u8(0);
            }
            if let Some(a) = self.ecs.agency.get(e) {
                h.write_u8(1);
                h.write_i64(a.move_dir.x.raw());
                h.write_i64(a.move_dir.y.raw());
                h.write_i64(a.move_dir.z.raw());
                h.write_i64(a.facing.raw());
                h.write_bool(a.want_strike);
            } else {
                h.write_u8(0);
            }
            if let Some(b) = self.ecs.body.get(e) {
                h.write_u8(1);
                h.write_u16(b.form);
                h.write_u32(b.parts.len() as u32);
                for p in &b.parts {
                    h.write_u16(p.slot);
                    h.write_u16(p.material);
                    h.write_i64(p.volume.raw());
                    h.write_i64(p.integrity.raw());
                    h.write_i64(p.heat.raw());
                    h.write_i64(p.charge.raw());
                    h.write_i64(p.phase_progress.raw());
                    h.write_u8(p.phase_target);
                    h.write_bool(p.attached);
                }
                h.write_u32(b.links.len() as u32);
                for &(a, c) in &b.links {
                    h.write_u16(a);
                    h.write_u16(c);
                }
            } else {
                h.write_u8(0);
            }
            if let Some(r) = self.ecs.rng.get(e) {
                let (s, i) = r.state_words();
                h.write_u64(s);
                h.write_u64(i);
            }
        }
        h.finish()
    }

    /// Look up a material id by name. Host-side convenience for building
    /// scenarios; never called from simulation code.
    pub fn material_id(&self, name: &str) -> Option<MaterialId> {
        (0..self.materials.materials.len())
            .find(|&i| self.materials.name(i as MaterialId) == name)
            .map(|i| i as MaterialId)
    }

    pub fn form_id(&self, name: &str) -> Option<u16> {
        (0..self.forms.forms.len())
            .find(|&i| self.forms.name(i as u16) == name)
            .map(|i| i as u16)
    }
}
