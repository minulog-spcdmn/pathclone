//! The event stream behind §12.2's Readout.
//!
//! "After any significant impulse resolution, a compact, optional post-hit
//! panel: energy transferred, what deformed, what fractured, what reacted, what
//! changed phase. This is the hypothesis-testing loop."
//!
//! §12.3 rules out DPS numbers and power scores, so every record here carries
//! the *physical* quantity that caused it — the stress that broke the part, the
//! temperature it crossed, the volume that dissolved. The host formats; it
//! never invents.

use crate::ecs::EntityId;
use crate::fixed::Fx;
use crate::material::MaterialId;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum EventKind {
    /// Energy arrived. `a` = kinetic absorbed, `b` = peak stress.
    Impact = 0,
    /// §6.3 step 2. `a` = integrity lost, `b` = stress vs. hardness.
    Deformed = 1,
    /// §6.3 step 3. `a` = peak stress, `b` = the threshold it beat.
    Fractured = 2,
    /// §6.3 step 5. `a` = temperature, `b` = threshold crossed.
    PhaseChange = 3,
    /// §6.3 step 7. `a` = volume converted, `b` = energy released.
    Reacted = 4,
    /// §6.3 step 6. `a` = charge moved, `b` = the threshold it beat.
    Discharged = 5,
    /// A part left the world. `a` = volume at destruction.
    Destroyed = 6,
    /// A fragment or reaction product became an entity of its own.
    Spawned = 7,
    /// Heat crossed between two parts. `a` = energy moved.
    Conducted = 8,
    /// A swing resolved. `detail` = 1 if it connected, `a` = energy delivered,
    /// `b` = the reach it had. A miss is worth printing: it tells the player the
    /// weapon's reach is a real number they can learn.
    Swung = 9,
}

impl EventKind {
    pub fn label(self) -> &'static str {
        match self {
            EventKind::Impact => "impact",
            EventKind::Deformed => "deformed",
            EventKind::Fractured => "fractured",
            EventKind::PhaseChange => "phase",
            EventKind::Reacted => "reacted",
            EventKind::Discharged => "discharged",
            EventKind::Destroyed => "destroyed",
            EventKind::Spawned => "spawned",
            EventKind::Conducted => "conducted",
            EventKind::Swung => "swung",
        }
    }

    pub fn from_u8(v: u8) -> EventKind {
        match v {
            1 => EventKind::Deformed,
            2 => EventKind::Fractured,
            3 => EventKind::PhaseChange,
            4 => EventKind::Reacted,
            5 => EventKind::Discharged,
            6 => EventKind::Destroyed,
            7 => EventKind::Spawned,
            8 => EventKind::Conducted,
            9 => EventKind::Swung,
            _ => EventKind::Impact,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Event {
    pub tick: u32,
    pub kind: EventKind,
    pub entity: EntityId,
    pub part: u16,
    pub material_before: MaterialId,
    pub material_after: MaterialId,
    /// Which cascade generation produced this (§6.3 bounds it at 3), or the
    /// transition index for a phase change.
    pub detail: u8,
    pub a: Fx,
    pub b: Fx,
}

/// Bounded log. Old records are dropped rather than growing without limit — a
/// long-running shard must not accumulate a Readout buffer forever.
#[derive(Clone, Debug)]
pub struct EventLog {
    events: Vec<Event>,
    cap: usize,
    /// Total ever pushed, so the host can tell "nothing happened" from
    /// "everything scrolled past".
    pub total: u64,
}

impl Default for EventLog {
    fn default() -> Self {
        EventLog::with_capacity(4096)
    }
}

impl EventLog {
    pub fn with_capacity(cap: usize) -> EventLog {
        EventLog {
            events: Vec::new(),
            cap,
            total: 0,
        }
    }

    pub fn push(&mut self, e: Event) {
        self.total = self.total.wrapping_add(1);
        if self.events.len() >= self.cap {
            self.events.remove(0);
        }
        self.events.push(e);
    }

    pub fn clear(&mut self) {
        self.events.clear();
    }

    pub fn as_slice(&self) -> &[Event] {
        &self.events
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    /// Records produced at or after `tick`.
    pub fn since(&self, tick: u32) -> impl Iterator<Item = &Event> {
        self.events.iter().filter(move |e| e.tick >= tick)
    }

    pub fn count_of(&self, kind: EventKind) -> usize {
        self.events.iter().filter(|e| e.kind == kind).count()
    }
}
