//! L3 — Form. The `Body` component of §6.1: "assembly graph of parts, each part
//! → (form_id, material_id, volume, integrity)".
//!
//! A creature, a sword, a boulder and a campfire are all this struct. Nothing
//! in the crate distinguishes them (§P1).

use crate::fixed::Fx;
use crate::material::{MaterialId, MaterialTable, NO_MATERIAL};

/// One node of the assembly graph.
#[derive(Clone, Copy, Debug)]
pub struct Part {
    /// Which named slot of the owning form this is. Inert; for display.
    pub slot: u16,
    pub material: MaterialId,
    pub volume: Fx,
    /// 1.0 pristine, 0.0 destroyed. §6.1's `Integrity` component lives on the
    /// part rather than beside it because damage is always local to a part.
    pub integrity: Fx,
    /// Thermal energy relative to 0 game-degrees. Temperature is derived
    /// (§6.1: "stored heat, surface temp (derived)").
    pub heat: Fx,
    /// §6.1 `Charge` — aetheric/electric, per part.
    pub charge: Fx,
    /// Energy banked toward a pending phase change, signed: positive has been
    /// absorbed on the way up, negative given off on the way down.
    ///
    /// This is the latent-heat plateau. Without it a part flips the instant it
    /// touches a threshold, and because two materials either side of a
    /// transition have different heat capacities, a hysteresis loop between
    /// them becomes a heat engine — an energy-generating cycle, which §6.3
    /// names as the #1 exploit vector in the whole design. With it, melting
    /// costs exactly what freezing gives back.
    pub phase_progress: Fx,
    /// Which transition the progress is banked toward, or [`NO_TRANSITION`].
    pub phase_target: u8,
    /// Cleared when §6.3 step 3 fractures this part off the assembly.
    pub attached: bool,
}

pub const NO_TRANSITION: u8 = u8::MAX;

impl Part {
    pub fn new(slot: u16, material: MaterialId, volume: Fx) -> Part {
        Part {
            slot,
            material,
            volume,
            integrity: Fx::ONE,
            heat: Fx::ZERO,
            charge: Fx::ZERO,
            phase_progress: Fx::ZERO,
            phase_target: NO_TRANSITION,
            attached: true,
        }
    }

    #[inline]
    pub fn is_live(&self) -> bool {
        self.material != NO_MATERIAL && self.volume > Fx::ZERO && self.integrity > Fx::ZERO
    }
}

#[derive(Clone, Debug, Default)]
pub struct Body {
    pub parts: Vec<Part>,
    /// Undirected adjacency, stored `(lo, hi)` and kept sorted so iteration
    /// order never depends on insertion order (§14.4 rule 6).
    pub links: Vec<(u16, u16)>,
    /// Which §8.1 form this assembly was built from, or `u16::MAX`.
    pub form: u16,
}

pub const NO_FORM: u16 = u16::MAX;

impl Body {
    pub fn new() -> Body {
        Body {
            parts: Vec::new(),
            links: Vec::new(),
            form: NO_FORM,
        }
    }

    pub fn with_part(mut self, part: Part) -> Body {
        self.parts.push(part);
        self
    }

    pub fn link(mut self, a: u16, b: u16) -> Body {
        self.add_link(a, b);
        self
    }

    pub fn add_link(&mut self, a: u16, b: u16) {
        if a == b {
            return;
        }
        let e = if a < b { (a, b) } else { (b, a) };
        if let Err(at) = self.links.binary_search(&e) {
            self.links.insert(at, e);
        }
    }

    /// Parts adjacent to `idx`, in ascending index order.
    pub fn neighbours(&self, idx: u16) -> Vec<u16> {
        let mut out = Vec::new();
        for &(a, b) in &self.links {
            if a == idx {
                out.push(b);
            } else if b == idx {
                out.push(a);
            }
        }
        out.sort_unstable();
        out
    }

    pub fn mass_of(&self, idx: usize, table: &MaterialTable) -> Fx {
        let p = match self.parts.get(idx) {
            Some(p) => p,
            None => return Fx::ZERO,
        };
        match table.get(p.material) {
            Some(m) => p.volume.mul(m.density),
            None => Fx::ZERO,
        }
    }

    /// mass × heat capacity — the denominator of the temperature derivation.
    pub fn thermal_mass(&self, idx: usize, table: &MaterialTable) -> Fx {
        let p = match self.parts.get(idx) {
            Some(p) => p,
            None => return Fx::ZERO,
        };
        match table.get(p.material) {
            Some(m) => p.volume.mul(m.density).mul(m.heat_capacity),
            None => Fx::ZERO,
        }
    }

    /// Derived, never stored. A part with no thermal mass reads as ambient.
    pub fn temperature(&self, idx: usize, table: &MaterialTable, ambient: Fx) -> Fx {
        let tm = self.thermal_mass(idx, table);
        if tm <= Fx::ZERO {
            return ambient;
        }
        match self.parts.get(idx) {
            Some(p) => p.heat.div(tm),
            None => ambient,
        }
    }

    /// Inverse of [`Body::temperature`] — used when spawning a part at a known
    /// temperature, never during resolution.
    pub fn set_temperature(&mut self, idx: usize, table: &MaterialTable, temp: Fx) {
        let tm = self.thermal_mass(idx, table);
        if let Some(p) = self.parts.get_mut(idx) {
            p.heat = temp.mul(tm);
        }
    }

    pub fn total_mass(&self, table: &MaterialTable) -> Fx {
        let mut sum = Fx::ZERO;
        for i in 0..self.parts.len() {
            if self.parts[i].attached {
                sum = sum.add(self.mass_of(i, table));
            }
        }
        sum
    }

    pub fn total_volume(&self) -> Fx {
        let mut sum = Fx::ZERO;
        for p in &self.parts {
            if p.attached {
                sum = sum.add(p.volume);
            }
        }
        sum
    }

    /// Sum of stored heat and charge over attached parts. Feeds the §6.3 energy
    /// audit.
    ///
    /// Latent energy banked in a part's phase plateau counts as heat: it is
    /// still in the world, just held where the temperature cannot show it. If
    /// it were left out, every melt would look like an energy leak and every
    /// freeze like an energy source.
    pub fn stored_energy(&self) -> (Fx, Fx) {
        let mut heat = Fx::ZERO;
        let mut charge = Fx::ZERO;
        for p in &self.parts {
            if p.attached {
                heat = heat.add(p.heat).add(p.phase_progress);
                charge = charge.add(p.charge);
            }
        }
        (heat, charge)
    }

    /// A rough radius, for reach and separation tests.
    ///
    /// Not a collision hull — §3 rules out rigid-body everything, and M1 has no
    /// geometry beyond the form's part offsets. The square root of volume is
    /// monotonic in size, which is all a melee range check needs.
    ///
    /// The coefficient matters more than it looks: separation keeps two bodies
    /// this far apart, so if it exceeds a weapon's reach nothing can ever be
    /// hit. A person comes out around 0.8 here against a sword's 1.1 of reach.
    pub fn extent(&self) -> Fx {
        self.total_volume().sqrt().mul(Fx::from_ratio(2, 5))
    }

    pub fn any_live(&self) -> bool {
        self.parts.iter().any(|p| p.attached && p.is_live())
    }
}
