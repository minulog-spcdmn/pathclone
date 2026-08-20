//! Strict ECS per §6.1.
//!
//! Entities are integer ids. There is no `Player` type, no `Enemy` type, no
//! `Item` type — those are component compositions, and any entity can acquire
//! or lose any component at runtime. The stores below are deliberately
//! type-agnostic: adding `Metabolism`, `Sensors` or `Agency` in a later
//! milestone means adding a field, not a code path.
//!
//! §14.4 rule 6 forbids hash maps in simulation code. Every store here is a
//! dense `Vec` indexed by entity id and every iterator walks it in index order,
//! so traversal order is a function of the ids alone.

use crate::body::Body;
use crate::fixed::Fx;
use crate::rng::Rng;

pub type EntityId = u32;

/// A 3-vector in fixed point. World coordinates are Q32.32 per §6.1.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct V3 {
    pub x: Fx,
    pub y: Fx,
    pub z: Fx,
}

impl V3 {
    pub const ZERO: V3 = V3 {
        x: Fx::ZERO,
        y: Fx::ZERO,
        z: Fx::ZERO,
    };

    pub fn new(x: Fx, y: Fx, z: Fx) -> V3 {
        V3 { x, y, z }
    }

    pub fn add(self, o: V3) -> V3 {
        V3::new(self.x.add(o.x), self.y.add(o.y), self.z.add(o.z))
    }

    pub fn sub(self, o: V3) -> V3 {
        V3::new(self.x.sub(o.x), self.y.sub(o.y), self.z.sub(o.z))
    }

    pub fn scale(self, s: Fx) -> V3 {
        V3::new(self.x.mul(s), self.y.mul(s), self.z.mul(s))
    }

    pub fn length_squared(self) -> Fx {
        self.x.mul(self.x).add(self.y.mul(self.y)).add(self.z.mul(self.z))
    }

    pub fn length(self) -> Fx {
        self.length_squared().sqrt()
    }

    pub fn distance(self, o: V3) -> Fx {
        self.sub(o).length()
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Transform {
    pub position: V3,
    pub velocity: V3,
    /// Yaw only at M1; the arena is flat (§17 M0).
    pub orientation: Fx,
}

/// Where an attack is in §5.1's commitment model.
///
/// "ARPG combat feel comes from commitment: attacks cost time, and the player
/// trades safety for damage." The phase an entity is in decides two things and
/// nothing else: whether the blow resolves this tick, and whether the entity is
/// allowed to move. How *long* each phase lasts is derived from the weapon
/// (§5.1: "weapon mass drives windup and recovery, derived from §8.1").
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(u8)]
pub enum AttackPhase {
    #[default]
    Idle = 0,
    /// Committed. Not cancellable, by anything — this is the commitment.
    Windup = 1,
    /// The blow resolves on the tick this begins.
    Active = 2,
    /// Cancellable after `recovery_cancel` of its length, by dodge or movement.
    Recovery = 3,
}

impl AttackPhase {
    pub fn from_u8(v: u8) -> AttackPhase {
        match v {
            1 => AttackPhase::Windup,
            2 => AttackPhase::Active,
            3 => AttackPhase::Recovery,
            _ => AttackPhase::Idle,
        }
    }
}

/// §6.1 `Effectors` — "what this entity can *do*".
///
/// Note there is nothing player-shaped about it. Give it to a boulder and the
/// boulder swings a sword, which is exactly the P1 test. §5.1's phases inherit
/// that: a wolf with `Effectors` commits to its attacks exactly as the player
/// does, and can be dodged for the same reason.
#[derive(Clone, Copy, Debug, Default)]
pub struct Effectors {
    pub strength: Fx,
    pub wielded: Option<EntityId>,
    /// Which §5.1 phase this entity is in.
    pub phase: AttackPhase,
    /// Seconds left in the current phase.
    pub phase_left: Fx,
    /// The length the current phase started with, so "cancellable after 40%" is
    /// a question the effector pass can answer without a second timer.
    pub phase_total: Fx,
    /// §5.1's input buffer: seconds of validity left on a swing asked for while
    /// the entity was busy. "Queued inputs during recovery fire on the first
    /// legal frame. This single feature is responsible for most of the
    /// difference between 'responsive' and 'sluggish' in this genre."
    pub buffered: Fx,
    /// Seconds left of a dodge.
    pub dodge_left: Fx,
    /// Seconds until another dodge is legal (§5.1's lockout).
    pub dodge_lockout: Fx,
    /// Where the dodge is carrying the entity, fixed when it starts — a dodge
    /// you can steer mid-roll is not a commitment.
    pub dodge_dir: V3,
}

impl Effectors {
    /// §5.1's i-frames, "from 60–180 ms" of a 350 ms dodge. Held as fractions of
    /// the dodge so the window survives retuning the duration.
    pub fn evading(&self, from: Fx, to: Fx, dodge_time: Fx) -> bool {
        if self.dodge_left <= Fx::ZERO || dodge_time <= Fx::ZERO {
            return false;
        }
        let elapsed = dodge_time.sub(self.dodge_left);
        elapsed >= dodge_time.mul(from) && elapsed <= dodge_time.mul(to)
    }

    /// Whether a new action may start. Committed phases refuse; recovery allows
    /// it once `cancel` of it has elapsed.
    pub fn can_act(&self, cancel: Fx) -> bool {
        if self.dodge_left.is_positive() {
            return false;
        }
        match self.phase {
            AttackPhase::Idle => true,
            AttackPhase::Windup | AttackPhase::Active => false,
            AttackPhase::Recovery => {
                self.phase_total.sub(self.phase_left) >= self.phase_total.mul(cancel)
            }
        }
    }
}

/// §6.1 `Locomotion` — "mode(s), speed curves, terrain affinity".
///
/// Terrain affinity waits for terrain. What exists at M1 is the part that
/// couples to the rest of the substrate: top speed falls as the entity gets
/// heavier, so plate armour and a lead maul are felt in the legs. That is one
/// line in [`Sim::agency_pass`] rather than an encumbrance system.
#[derive(Clone, Copy, Debug, Default)]
pub struct Locomotion {
    pub max_speed: Fx,
    /// Units per second per second, toward the desired velocity.
    pub accel: Fx,
    /// The mass at which top speed is halved.
    pub mass_ref: Fx,
}

/// §6.1 `Agency` — "goal stack, utility evaluator config, memory".
///
/// At M1 there is no utility AI (§10.3 is M4), so this holds only the intent a
/// controller has expressed this tick. The point is which controller: §6.1 is
/// explicit that a system must never ask "is this a player?", only whether an
/// entity "has `Agency` with an external controller". The player is an entity
/// whose intent arrives from a keyboard; a wolf will be an entity whose intent
/// arrives from a utility evaluator. Both write this struct, and everything
/// downstream reads it without knowing which.
#[derive(Clone, Copy, Debug, Default)]
pub struct Agency {
    /// Desired direction of travel. Zero means stand still.
    pub move_dir: V3,
    /// Where the entity is looking, in radians.
    pub facing: Fx,
    /// Raised to ask for a swing. Never refused outright: an ask that arrives
    /// mid-attack goes into §5.1's input buffer and fires on the first legal
    /// tick, which is most of what the feel of this layer rests on.
    pub want_strike: bool,
    /// Raised to ask for a dodge (§5.1). Legal from idle, and from recovery once
    /// it has passed its cancel point.
    pub want_dodge: bool,
}

/// Dense optional storage, iterated in id order.
#[derive(Clone, Debug)]
pub struct ComponentStore<T> {
    slots: Vec<Option<T>>,
}

impl<T> Default for ComponentStore<T> {
    fn default() -> Self {
        ComponentStore { slots: Vec::new() }
    }
}

impl<T> ComponentStore<T> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&mut self, e: EntityId, v: T) {
        let i = e as usize;
        while self.slots.len() <= i {
            self.slots.push(None);
        }
        self.slots[i] = Some(v);
    }

    pub fn remove(&mut self, e: EntityId) -> Option<T> {
        self.slots.get_mut(e as usize).and_then(|s| s.take())
    }

    pub fn get(&self, e: EntityId) -> Option<&T> {
        self.slots.get(e as usize).and_then(|s| s.as_ref())
    }

    pub fn get_mut(&mut self, e: EntityId) -> Option<&mut T> {
        self.slots.get_mut(e as usize).and_then(|s| s.as_mut())
    }

    pub fn contains(&self, e: EntityId) -> bool {
        self.get(e).is_some()
    }

    pub fn capacity_ids(&self) -> u32 {
        self.slots.len() as u32
    }

    /// Ascending id order. This is the only iteration order simulation code may
    /// rely on.
    pub fn iter(&self) -> impl Iterator<Item = (EntityId, &T)> {
        self.slots
            .iter()
            .enumerate()
            .filter_map(|(i, s)| s.as_ref().map(|v| (i as EntityId, v)))
    }

    pub fn ids(&self) -> Vec<EntityId> {
        self.slots
            .iter()
            .enumerate()
            .filter_map(|(i, s)| s.as_ref().map(|_| i as EntityId))
            .collect()
    }
}

/// The entity table and every component store.
#[derive(Clone, Debug, Default)]
pub struct Ecs {
    alive: Vec<bool>,
    free: Vec<EntityId>,

    pub transform: ComponentStore<Transform>,
    pub body: ComponentStore<Body>,
    pub effectors: ComponentStore<Effectors>,
    pub locomotion: ComponentStore<Locomotion>,
    pub agency: ComponentStore<Agency>,
    /// Per-entity PRNG (§14.4 rule 7).
    pub rng: ComponentStore<Rng>,
    /// An opaque host-side name handle. Inert — never branched on, never used
    /// to decide anything. It exists so the Readout can say "boarhide grip"
    /// instead of "entity 7, part 2".
    pub label: ComponentStore<u32>,
}

impl Ecs {
    pub fn new() -> Ecs {
        Ecs::default()
    }

    pub fn spawn(&mut self, world_seed: u64) -> EntityId {
        // Free ids are reused newest-first. Deterministic, and it keeps the id
        // space compact so the dense stores stay dense.
        let id = match self.free.pop() {
            Some(id) => {
                self.alive[id as usize] = true;
                id
            }
            None => {
                self.alive.push(true);
                (self.alive.len() - 1) as EntityId
            }
        };
        self.rng.insert(id, Rng::seeded(world_seed, id as u64));
        id
    }

    pub fn despawn(&mut self, e: EntityId) {
        if !self.is_alive(e) {
            return;
        }
        self.alive[e as usize] = false;
        self.transform.remove(e);
        self.body.remove(e);
        self.effectors.remove(e);
        self.locomotion.remove(e);
        self.agency.remove(e);
        self.rng.remove(e);
        self.label.remove(e);
        self.free.push(e);
    }

    pub fn is_alive(&self, e: EntityId) -> bool {
        self.alive.get(e as usize).copied().unwrap_or(false)
    }

    pub fn capacity(&self) -> u32 {
        self.alive.len() as u32
    }

    /// All living entity ids, ascending.
    pub fn live_ids(&self) -> Vec<EntityId> {
        (0..self.alive.len() as EntityId)
            .filter(|&e| self.alive[e as usize])
            .collect()
    }

    pub fn live_count(&self) -> usize {
        self.alive.iter().filter(|a| **a).count()
    }
}
