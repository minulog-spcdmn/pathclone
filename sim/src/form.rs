//! L3 — Form. §6.1: "an item is a form, made of materials, produced by a
//! process, with a history."
//!
//! Forms are the one place §6.1 says hand-authored content is correct, because
//! "forms are *rules about shape*, not content". They carry geometry and
//! attachment topology and nothing else — no stats, no damage numbers, no
//! material assumptions. Every statistic in the table below is derived at the
//! point of use and stored nowhere.

use crate::body::{Body, Part};
use crate::fixed::Fx;
use crate::impulse::Impulse;
use crate::material::{MaterialId, MaterialTable, Reader, DecodeError};

pub type FormId = u16;

#[derive(Clone, Copy, Debug, Default)]
pub struct FormPart {
    pub name_off: u32,
    pub name_len: u32,
    /// Reference volume for this slot. Assemblies may override it.
    pub volume: Fx,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Form {
    pub name_off: u32,
    pub name_len: u32,
    pub part_start: u32,
    pub part_count: u32,
    pub link_start: u32,
    pub link_count: u32,
    /// Index into this form's parts — the geometry that meets the target.
    pub strike_part: u16,
    /// Contact area of the striking geometry. This one number is the whole
    /// difference between a blade and a maul (§4.3).
    pub edge_area: Fx,
    /// Multiplies the wielder's strength into swing velocity — a long haft
    /// gives leverage, a dagger does not.
    pub leverage: Fx,
    /// Velocity ceiling imposed by the geometry, independent of strength.
    ///
    /// Without it, per-hit energy would fall monotonically with mass and there
    /// would be no reason to ever build a heavy weapon. With it, delivered
    /// energy peaks at an intermediate mass, so *the best blade material for a
    /// given wielder is a discovery* rather than "pick the densest". §5.4 asks
    /// for exactly this shape in the alloy curve; it costs one number to have
    /// it apply to every form as well.
    pub max_speed: Fx,
    pub reach: Fx,
}

#[derive(Clone, Debug, Default)]
pub struct FormTable {
    pub forms: Vec<Form>,
    pub parts: Vec<FormPart>,
    pub links: Vec<(u16, u16)>,
    pub names: Vec<u8>,
}

/// `"FM01"` little-endian.
pub const FORM_MAGIC: u32 = 0x3130_4D46;
pub const FORM_VERSION: u32 = 1;

impl FormTable {
    pub fn get(&self, id: FormId) -> Option<&Form> {
        self.forms.get(id as usize)
    }

    pub fn name(&self, id: FormId) -> &str {
        match self.forms.get(id as usize) {
            Some(f) => slice_name(&self.names, f.name_off, f.name_len),
            None => "-",
        }
    }

    pub fn part_name(&self, form: FormId, slot: u16) -> &str {
        match self.forms.get(form as usize) {
            Some(f) => {
                let i = f.part_start as usize + slot as usize;
                if slot as u32 >= f.part_count {
                    return "-";
                }
                match self.parts.get(i) {
                    Some(p) => slice_name(&self.names, p.name_off, p.name_len),
                    None => "-",
                }
            }
            None => "-",
        }
    }

    pub fn parts_of(&self, f: &Form) -> &[FormPart] {
        let s = f.part_start as usize;
        let e = s.saturating_add(f.part_count as usize);
        if e <= self.parts.len() {
            &self.parts[s..e]
        } else {
            &[]
        }
    }

    pub fn links_of(&self, f: &Form) -> &[(u16, u16)] {
        let s = f.link_start as usize;
        let e = s.saturating_add(f.link_count as usize);
        if e <= self.links.len() {
            &self.links[s..e]
        } else {
            &[]
        }
    }

    /// Build a `Body` from a form and one material per slot.
    ///
    /// This is the whole of "item creation" at M1. There is no item database to
    /// consult and no validation that the combination makes sense — §P2 says
    /// the world checks whether something is physically possible, not whether
    /// it is allowed. A blade knapped from ice is a legal object.
    pub fn assemble(&self, id: FormId, materials: &[MaterialId]) -> Option<Body> {
        let f = self.get(id)?;
        let mut body = Body::new();
        body.form = id;
        for (i, fp) in self.parts_of(f).iter().enumerate() {
            let m = materials.get(i).copied().unwrap_or(crate::material::NO_MATERIAL);
            body.parts.push(Part::new(i as u16, m, fp.volume));
        }
        for &(a, b) in self.links_of(f) {
            body.add_link(a, b);
        }
        Some(body)
    }

    pub fn decode(buf: &[u8]) -> Result<FormTable, DecodeError> {
        let mut r = Reader::new(buf);
        if r.u32()? != FORM_MAGIC {
            return Err(DecodeError::BadMagic);
        }
        if r.u32()? != FORM_VERSION {
            return Err(DecodeError::BadVersion);
        }
        let form_count = r.u32()? as usize;
        let part_count = r.u32()? as usize;
        let link_count = r.u32()? as usize;
        let name_len = r.u32()? as usize;

        let mut forms = Vec::with_capacity(form_count);
        for _ in 0..form_count {
            forms.push(Form {
                name_off: r.u32()?,
                name_len: r.u32()?,
                part_start: r.u32()?,
                part_count: r.u32()?,
                link_start: r.u32()?,
                link_count: r.u32()?,
                strike_part: r.u16()?,
                edge_area: r.fx()?,
                leverage: r.fx()?,
                max_speed: r.fx()?,
                reach: r.fx()?,
            });
        }
        let mut parts = Vec::with_capacity(part_count);
        for _ in 0..part_count {
            parts.push(FormPart {
                name_off: r.u32()?,
                name_len: r.u32()?,
                volume: r.fx()?,
            });
        }
        let mut links = Vec::with_capacity(link_count);
        for _ in 0..link_count {
            let a = r.u16()?;
            let b = r.u16()?;
            links.push(if a < b { (a, b) } else { (b, a) });
        }
        let names = {
            let mut rr = r;
            rr.take_names(name_len)?
        };

        let table = FormTable {
            forms,
            parts,
            links,
            names,
        };
        for f in &table.forms {
            let pe = (f.part_start as usize).saturating_add(f.part_count as usize);
            let le = (f.link_start as usize).saturating_add(f.link_count as usize);
            if pe > table.parts.len() || le > table.links.len() {
                return Err(DecodeError::BadMaterialRef);
            }
            if f.part_count > 0 && f.strike_part as u32 >= f.part_count {
                return Err(DecodeError::BadMaterialRef);
            }
        }
        Ok(table)
    }
}

fn slice_name(names: &[u8], off: u32, len: u32) -> &str {
    let s = off as usize;
    let e = s.saturating_add(len as usize);
    if e <= names.len() {
        core::str::from_utf8(&names[s..e]).unwrap_or("?")
    } else {
        "?"
    }
}

impl<'a> Reader<'a> {
    fn take_names(&mut self, n: usize) -> Result<Vec<u8>, DecodeError> {
        let mut out = Vec::with_capacity(n);
        for _ in 0..n {
            out.push(self.u8()?);
        }
        Ok(out)
    }
}

// ---------------------------------------------------------------------------
// Derived statistics — §6.1. "All statistics are derived, none are stored."
// ---------------------------------------------------------------------------

/// Everything §6.1's derivation table produces for a swing, computed fresh.
#[derive(Clone, Copy, Debug, Default)]
pub struct StrikeProfile {
    pub mass: Fx,
    pub velocity: Fx,
    pub kinetic: Fx,
    pub contact_area: Fx,
    /// Swings per unit time — velocity over reach.
    pub rate: Fx,
    /// Which part of the wielded body actually meets the target.
    pub strike_part: u16,
}

/// Derive a swing from the wielder's strength and the item's actual assembly.
///
/// Nobody balanced any of this. A quartz blade comes out light, fast and
/// penetrating because quartz has a low density and the form has a small edge
/// area; it shatters on impact because of what the resolver then does with the
/// reaction impulse, not because of anything written here.
pub fn derive_strike(
    body: &Body,
    forms: &FormTable,
    materials: &MaterialTable,
    strength: Fx,
) -> StrikeProfile {
    let mass = body.total_mass(materials).max(Fx::EPSILON);
    let (edge_area, leverage, max_speed, reach, strike_part) = match forms.get(body.form) {
        Some(f) => (f.edge_area, f.leverage, f.max_speed, f.reach, f.strike_part),
        // An entity with no form — a boulder, a fragment — still swings. It just
        // swings as an undifferentiated lump with a broad face.
        None => (
            body.total_volume().max(Fx::EPSILON),
            Fx::ONE,
            Fx::from_int(8),
            Fx::ONE,
            0,
        ),
    };

    let uncapped = strength.mul(leverage).div(mass);
    let velocity = uncapped.min(max_speed);
    // Half m v squared. The peak-at-intermediate-mass behaviour described on
    // `max_speed` comes out of the interaction between this and the cap.
    let kinetic = mass.mul(velocity).mul(velocity).mul(Fx::HALF);

    // A dull edge is a wide edge. Integrity 1.0 leaves the area as authored;
    // integrity 0 doubles it, so a battered blade stops penetrating and starts
    // bludgeoning — which is a real, visible change in what the weapon is good
    // against, discovered rather than announced.
    let wear = match body.parts.get(strike_part as usize) {
        Some(p) => Fx::TWO.sub(p.integrity.clamp(Fx::ZERO, Fx::ONE)),
        None => Fx::ONE,
    };

    StrikeProfile {
        mass,
        velocity,
        kinetic,
        contact_area: edge_area.mul(wear).max(Fx::EPSILON),
        rate: velocity.div(reach.max(Fx::EPSILON)),
        strike_part,
    }
}

impl StrikeProfile {
    /// The impulse this swing delivers. Purely mechanical — a swing carries no
    /// thermal, charge or reagent load of its own. If the blade is red hot or
    /// dripping acid, that arrives through the *material*, not through here.
    pub fn impulse(&self) -> Impulse {
        Impulse {
            kinetic: self.kinetic,
            contact_area: self.contact_area,
            ..Impulse::default()
        }
    }
}
