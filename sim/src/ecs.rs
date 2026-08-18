//! Strict ECS per §4.1.
//!
//! Entities are integer ids. There is no `Player` type, no `Enemy` type, no
//! `Item` type — those are component compositions, and any entity can acquire
//! or lose any component at runtime. The stores below are deliberately
//! type-agnostic: adding `Metabolism`, `Sensors` or `Agency` in a later
//! milestone means adding a field, not a code path.
//!
//! §12.4 rule 3 forbids hash maps in simulation code. Every store here is a
//! dense `Vec` indexed by entity id and every iterator walks it in index order,
//! so traversal order is a function of the ids alone.

use crate::body::Body;
use crate::fixed::Fx;
use crate::rng::Rng;

pub type EntityId = u32;

/// A 3-vector in fixed point. World coordinates are Q32.32 per §4.1.
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
    /// Yaw only at M1; the arena is flat (§15 M0).
    pub orientation: Fx,
}

/// §4.1 `Effectors` — "what this entity can *do*".
///
/// Note there is nothing player-shaped about it. Give it to a boulder and the
/// boulder swings a sword, which is exactly the P1 test.
#[derive(Clone, Copy, Debug, Default)]
pub struct Effectors {
    pub strength: Fx,
    pub wielded: Option<EntityId>,
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
    /// Per-entity PRNG (§12.4 rule 4).
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
