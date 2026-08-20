//! L1 — Matter. §6.2.
//!
//! "A material is a data record. There is no material *code*." That is enforced
//! structurally here: this module contains no material names, no `match` on a
//! material id, and no constants that mean anything about a specific substance.
//! Every material in the game arrives through [`MaterialTable::decode`] from a
//! blob the host built out of `data/materials.json`, which is the whole of
//! §14.5's "no compiled-in content" requirement.
//!
//! Tag ids are likewise assigned by the host from the data files and appear
//! here only as bits, so the reaction matching in §6.3 step 7 stays an N-way
//! bitmask test rather than the N² table the design warns about.

use crate::fixed::Fx;

pub type MaterialId = u16;
pub type TagSet = u32;

/// Sentinel for "no material" — an empty socket, a fully consumed part.
pub const NO_MATERIAL: MaterialId = u16::MAX;

/// The three phase thresholds of §6.2, plus one addition.
///
/// The published schema lists `melt`, `boil` and `ignite`, all of which are
/// crossings on the way *up*. Nothing in it can express a substance getting
/// colder, so water cannot become ice — and §6.3's worked example ("freezing an
/// elastic creature makes it brittle... falls out of elasticity, phase_points
/// and step 3") requires exactly that. `solidify` is therefore a fourth
/// threshold, crossed downward, with its own temperature and product.
///
/// This is the only extension this implementation makes to the §6.2 material
/// schema, and it is purely additive: a material that omits `solidify` behaves
/// exactly as specified.
///
/// Note that nothing stops a table author from writing `ice --melt--> water`
/// and `water --solidify--> ice` at the same temperature, which would flip
/// every tick forever. The engine does not forbid it. §15 makes that the
/// material fuzzer's job — see [`MaterialTable::product_edges`] — because §15's
/// balance philosophy is to fix the table, never to special-case the resolver.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Transition {
    Melt = 0,
    Boil = 1,
    Ignite = 2,
    Solidify = 3,
}

impl Transition {
    pub fn from_u8(v: u8) -> Option<Transition> {
        match v {
            0 => Some(Transition::Melt),
            1 => Some(Transition::Boil),
            2 => Some(Transition::Ignite),
            3 => Some(Transition::Solidify),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Transition::Melt => "melt",
            Transition::Boil => "boil",
            Transition::Ignite => "ignite",
            Transition::Solidify => "solidify",
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct PhasePoint {
    pub present: bool,
    /// Threshold temperature in game units.
    pub temp: Fx,
    /// What the part becomes on crossing.
    pub product: MaterialId,
    /// Latent energy per unit volume. Negative absorbs heat (melting, boiling),
    /// positive releases it (ignition). This is what makes fire spread without
    /// anyone writing a fire system.
    pub latent: Fx,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Reaction {
    /// Fires when the incoming reagent carries any of these tags.
    pub with_tags: TagSet,
    pub produces: MaterialId,
    /// Volume converted per unit of corrosive potential.
    pub rate: Fx,
    /// Energy released per unit volume converted. Negative absorbs.
    pub releases_thermal: Fx,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Material {
    // Identity — inert. Never branched on.
    pub name_off: u32,
    pub name_len: u32,
    pub class_id: u16,
    pub tags: TagSet,
    pub hue_bias: i16,

    // Mechanical
    pub density: Fx,
    pub hardness: Fx,
    pub toughness: Fx,
    pub elasticity: Fx,
    pub friction: Fx,

    // Thermal
    pub heat_capacity: Fx,
    pub thermal_conductivity: Fx,

    // Energetic / arcane
    pub conductivity: Fx,
    pub aether_permeability: Fx,
    pub aether_capacity: Fx,
    pub discharge_threshold: Fx,

    // Chemical
    pub corrosion_resistance: Fx,

    /// Indexed by [`Transition`].
    pub phases: [PhasePoint; 4],

    /// Range into [`MaterialTable::reactions`].
    pub reaction_start: u32,
    pub reaction_count: u32,
}

impl Material {
    #[inline]
    pub fn phase(&self, t: Transition) -> &PhasePoint {
        &self.phases[t as usize]
    }

    #[inline]
    pub fn has_tag(&self, tag_bit: TagSet) -> bool {
        self.tags & tag_bit != 0
    }

    /// Hardness falls as a part approaches its melting point.
    ///
    /// This is one of the very few hand-authored *rules* §0 allows, and it is
    /// uniform across every material — there is no per-material softening
    /// curve. It is what makes §8.2's Deform process work (you heat the billet
    /// before you hit it) and it is why armour left in a fire stops protecting.
    /// Materials with no melt point are unaffected.
    pub fn hardness_at(&self, temp: Fx, reference_temp: Fx, soften_k: Fx) -> Fx {
        let melt = self.phase(Transition::Melt);
        if !melt.present || melt.temp <= reference_temp {
            return self.hardness;
        }
        let span = melt.temp.sub(reference_temp);
        let t = temp.sub(reference_temp).div(span).clamp(Fx::ZERO, Fx::ONE);
        let factor = Fx::ONE.sub(t.mul(soften_k));
        self.hardness.mul(factor.max(Fx::ZERO))
    }

    /// Hardness during a transition, given how full the part's latent-heat bank
    /// is (`fraction`, signed, from [`crate::body::Body::phase_fraction`]).
    ///
    /// §6.3 step 5, added in v1.0: "Partial phase progress is a state, not just
    /// a counter. A part above its melt point with a half-full buffer is
    /// *softening*: effective `hardness` falls with progress. A blade you have
    /// been heating gets worse before it dies."
    ///
    /// Without this the plateau is invisible: temperature is pinned at the
    /// threshold while the bank fills, so [`Material::hardness_at`] alone
    /// reports the same hardness for a blade one tick into melting as for one
    /// about to become slag. The taper is linear in the bank, which makes the
    /// whole approach legible — the strain audio and crack splines of §12.6
    /// have something continuous to track, rather than a step at the end.
    ///
    /// `phase_soften_k` bounds how far the taper can go, and it has to be less
    /// than one. A taper that reaches zero hardness makes an upward transition
    /// unreachable under any mechanical load at all: the part's hardness falls
    /// below whatever stress is on it before the bank fills, so it is deformed
    /// to nothing every time, and "melt it while grinding it" or "melt it while
    /// it rests on something" become impossible in general rather than as a
    /// result of the numbers involved. §6.3 asks for the opposite — softening
    /// that is "tactically useful without being an instant-win".
    ///
    /// Only upward transitions soften. Freezing is a bank filling in the other
    /// direction and the thing it produces is usually *harder*; that is
    /// expressed by the product material, not by a curve here.
    pub fn hardness_softening(
        &self,
        temp: Fx,
        reference_temp: Fx,
        soften_k: Fx,
        phase_soften_k: Fx,
        fraction: Fx,
    ) -> Fx {
        let base = self.hardness_at(temp, reference_temp, soften_k);
        if !fraction.is_positive() {
            return base;
        }
        let taper = fraction.clamp(Fx::ZERO, Fx::ONE).mul(phase_soften_k);
        base.mul(Fx::ONE.sub(taper).max(Fx::ZERO))
    }
}

/// The whole of L1: every material, every reaction, and the (inert) name bytes.
#[derive(Clone, Debug, Default)]
pub struct MaterialTable {
    pub materials: Vec<Material>,
    pub reactions: Vec<Reaction>,
    /// UTF-8 name bytes. Sliced for display only; never compared, never hashed
    /// into simulation state.
    pub names: Vec<u8>,
}

/// Little-endian byte reader. Explicit field-by-field decoding rather than a
/// cast over memory, so the layout is identical on every target regardless of
/// alignment or struct packing rules.
pub struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

#[derive(Debug, PartialEq, Eq)]
pub enum DecodeError {
    Truncated,
    BadMagic,
    BadVersion,
    BadMaterialRef,
}

impl<'a> Reader<'a> {
    pub fn new(buf: &'a [u8]) -> Reader<'a> {
        Reader { buf, pos: 0 }
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8], DecodeError> {
        let end = self.pos.checked_add(n).ok_or(DecodeError::Truncated)?;
        if end > self.buf.len() {
            return Err(DecodeError::Truncated);
        }
        let s = &self.buf[self.pos..end];
        self.pos = end;
        Ok(s)
    }

    pub fn u8(&mut self) -> Result<u8, DecodeError> {
        Ok(self.take(1)?[0])
    }

    pub fn u16(&mut self) -> Result<u16, DecodeError> {
        let b = self.take(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    pub fn i16(&mut self) -> Result<i16, DecodeError> {
        Ok(self.u16()? as i16)
    }

    pub fn u32(&mut self) -> Result<u32, DecodeError> {
        let b = self.take(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    pub fn i64(&mut self) -> Result<i64, DecodeError> {
        let b = self.take(8)?;
        Ok(i64::from_le_bytes([
            b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
        ]))
    }

    pub fn fx(&mut self) -> Result<Fx, DecodeError> {
        Ok(Fx::from_raw(self.i64()?))
    }

    pub fn remaining(&self) -> usize {
        self.buf.len() - self.pos
    }
}

/// `"MT01"` little-endian.
pub const MATERIAL_MAGIC: u32 = 0x3130_544D;
pub const MATERIAL_VERSION: u32 = 1;

impl MaterialTable {
    pub fn name(&self, id: MaterialId) -> &str {
        match self.materials.get(id as usize) {
            Some(m) => {
                let s = m.name_off as usize;
                let e = s.saturating_add(m.name_len as usize);
                if e <= self.names.len() {
                    core::str::from_utf8(&self.names[s..e]).unwrap_or("?")
                } else {
                    "?"
                }
            }
            None => "-",
        }
    }

    pub fn get(&self, id: MaterialId) -> Option<&Material> {
        self.materials.get(id as usize)
    }

    pub fn reactions_of(&self, m: &Material) -> &[Reaction] {
        let s = m.reaction_start as usize;
        let e = s.saturating_add(m.reaction_count as usize);
        if e <= self.reactions.len() {
            &self.reactions[s..e]
        } else {
            &[]
        }
    }

    /// Decode the packed blob produced by `src/substrate/pack.ts`.
    pub fn decode(buf: &[u8]) -> Result<MaterialTable, DecodeError> {
        let mut r = Reader::new(buf);
        if r.u32()? != MATERIAL_MAGIC {
            return Err(DecodeError::BadMagic);
        }
        if r.u32()? != MATERIAL_VERSION {
            return Err(DecodeError::BadVersion);
        }
        let material_count = r.u32()? as usize;
        let reaction_count = r.u32()? as usize;
        let name_len = r.u32()? as usize;

        let mut materials = Vec::with_capacity(material_count);
        for _ in 0..material_count {
            let mut m = Material {
                name_off: r.u32()?,
                name_len: r.u32()?,
                class_id: r.u16()?,
                hue_bias: r.i16()?,
                tags: r.u32()?,
                density: r.fx()?,
                hardness: r.fx()?,
                toughness: r.fx()?,
                elasticity: r.fx()?,
                friction: r.fx()?,
                heat_capacity: r.fx()?,
                thermal_conductivity: r.fx()?,
                conductivity: r.fx()?,
                aether_permeability: r.fx()?,
                aether_capacity: r.fx()?,
                discharge_threshold: r.fx()?,
                corrosion_resistance: r.fx()?,
                ..Default::default()
            };
            let flags = r.u32()?;
            for (i, phase) in m.phases.iter_mut().enumerate() {
                let temp = r.fx()?;
                let product = r.u16()?;
                let latent = r.fx()?;
                *phase = PhasePoint {
                    present: flags & (1 << i) != 0,
                    temp,
                    product,
                    latent,
                };
            }
            m.reaction_start = r.u32()?;
            m.reaction_count = r.u32()?;
            materials.push(m);
        }

        let mut reactions = Vec::with_capacity(reaction_count);
        for _ in 0..reaction_count {
            reactions.push(Reaction {
                with_tags: r.u32()?,
                produces: r.u16()?,
                rate: r.fx()?,
                releases_thermal: r.fx()?,
            });
        }

        let names = r.take(name_len)?.to_vec();

        let table = MaterialTable {
            materials,
            reactions,
            names,
        };

        // Every material reference must resolve, or a cascade could walk off
        // the end of the table mid-tick and behave differently under different
        // allocation patterns.
        for m in &table.materials {
            for p in &m.phases {
                if p.present && p.product != NO_MATERIAL && p.product as usize >= table.materials.len()
                {
                    return Err(DecodeError::BadMaterialRef);
                }
            }
            let end = (m.reaction_start as usize).saturating_add(m.reaction_count as usize);
            if end > table.reactions.len() {
                return Err(DecodeError::BadMaterialRef);
            }
        }
        for rx in &table.reactions {
            if rx.produces != NO_MATERIAL && rx.produces as usize >= table.materials.len() {
                return Err(DecodeError::BadMaterialRef);
            }
        }

        Ok(table)
    }

    /// Every `(material, transition) -> product` and `(material, reaction) ->
    /// product` edge in the table.
    ///
    /// §15 asks the material fuzzer to search for "degenerate reaction loops and
    /// energy-generating cascades". A cascade can only be unbounded if the
    /// product graph has a cycle, so exposing the graph is enough to make that
    /// a decidable question rather than a play-testing hope.
    pub fn product_edges(&self) -> Vec<(MaterialId, MaterialId, Fx)> {
        let mut edges = Vec::new();
        for (i, m) in self.materials.iter().enumerate() {
            let from = i as MaterialId;
            for p in &m.phases {
                if p.present && p.product != NO_MATERIAL && p.product != from {
                    edges.push((from, p.product, p.latent));
                }
            }
            for rx in self.reactions_of(m) {
                if rx.produces != NO_MATERIAL && rx.produces != from {
                    edges.push((from, rx.produces, rx.releases_thermal));
                }
            }
        }
        edges.sort_by_key(|e| (e.0, e.1, e.2.raw()));
        edges
    }
}
