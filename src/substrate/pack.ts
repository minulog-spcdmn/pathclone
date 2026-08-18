/**
 * JSON data files -> the packed blobs the simulation crate decodes.
 *
 * DESIGN.md §14.5 wants every non-code definition to be a schema-validated data
 * file, and wants that format designed as a public modding API from day one.
 * This module is the only place in the project where a design value becomes a
 * simulation value, which is what keeps that promise checkable: if a mod can
 * produce `materials.json`, it can produce a material, and nothing else in the
 * codebase needs to know.
 *
 * It is also the only place a float touches simulation data. The crate is
 * fixed-point throughout (§14.4 rule 3, and `docs/PROFILE.md` for why that is
 * still the right call after v1.0 reopened the question); authoring in decimal
 * and converting once, deterministically, at the boundary is the point of
 * having a boundary. A designer writes 0.72 and every host reads the same
 * integer.
 */

const ONE = 2 ** 32;

/** Decimal -> raw Q32.32. Rounds half away from zero, so -0.5 and 0.5 are symmetric. */
export function toFx(v: number): bigint {
  if (!Number.isFinite(v)) throw new Error(`not a finite number: ${v}`);
  const scaled = v * ONE;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  if (!Number.isSafeInteger(rounded)) {
    throw new Error(`value ${v} does not fit Q32.32 exactly enough to be safe`);
  }
  return BigInt(rounded);
}

/** Raw Q32.32 -> decimal. Presentation only. */
export function fromFx(raw: bigint | number): number {
  return Number(BigInt(raw)) / ONE;
}

class Writer {
  private bytes: number[] = [];

  u8(v: number) {
    this.bytes.push(v & 0xff);
    return this;
  }
  u16(v: number) {
    this.bytes.push(v & 0xff, (v >>> 8) & 0xff);
    return this;
  }
  i16(v: number) {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number) {
    this.bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
    return this;
  }
  i64(v: bigint) {
    let x = BigInt.asUintN(64, v);
    for (let i = 0; i < 8; i++) {
      this.bytes.push(Number(x & 0xffn));
      x >>= 8n;
    }
    return this;
  }
  fx(v: number) {
    return this.i64(toFx(v));
  }
  raw(bytes: Uint8Array) {
    for (const b of bytes) this.bytes.push(b);
    return this;
  }
  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
  get length() {
    return this.bytes.length;
  }
}

/** Accumulates the inert name bytes both tables carry. */
class NamePool {
  private buf: number[] = [];
  private enc = new TextEncoder();

  add(name: string): { off: number; len: number } {
    const bytes = this.enc.encode(name);
    const off = this.buf.length;
    for (const b of bytes) this.buf.push(b);
    return { off, len: bytes.length };
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.buf);
  }
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export interface PhaseBlock {
  melt?: number | null;
  boil?: number | null;
  ignite?: number | null;
  solidify?: number | null;
}

export interface MaterialDoc {
  id: string;
  class: string;
  tags?: string[];
  density: number;
  hardness: number;
  toughness: number;
  elasticity: number;
  friction: number;
  heat_capacity: number;
  thermal_conductivity: number;
  conductivity: number;
  aether_permeability: number;
  aether_capacity: number;
  discharge_threshold: number;
  corrosion_resistance: number;
  phase_points?: PhaseBlock;
  phase_products?: Record<string, string>;
  phase_energy?: Record<string, number>;
  reactions?: Array<{
    with: string;
    produces: string;
    rate: number;
    releases?: { thermal?: number };
  }>;
  formation?: unknown;
  appearance?: { derive_from_properties?: boolean; hue_bias?: number };
}

export interface MaterialsDoc {
  tags: string[];
  classes: string[];
  materials: MaterialDoc[];
}

/** Order must match `Transition` in sim/src/material.rs. */
const TRANSITIONS = ["melt", "boil", "ignite", "solidify"] as const;

const MATERIAL_MAGIC = 0x3130_544d; // "MT01"
const MATERIAL_VERSION = 1;

/**
 * Everything the host needs that the simulation does not: names, tag bits, and
 * the raw property values behind §12.2's Lens and §12.1's shading.
 */
export interface MaterialIndex {
  byName: Map<string, number>;
  names: string[];
  docs: MaterialDoc[];
  tagBits: Map<string, number>;
  classes: string[];
}

export function indexMaterials(doc: MaterialsDoc): MaterialIndex {
  const byName = new Map<string, number>();
  doc.materials.forEach((m, i) => {
    if (byName.has(m.id)) throw new Error(`duplicate material id: ${m.id}`);
    byName.set(m.id, i);
  });
  const tagBits = new Map<string, number>();
  doc.tags.forEach((t, i) => {
    if (i >= 32) throw new Error(`tag set is limited to 32 tags; "${t}" is number ${i + 1}`);
    tagBits.set(t, 1 << i);
  });
  return {
    byName,
    names: doc.materials.map((m) => m.id),
    docs: doc.materials,
    tagBits,
    classes: doc.classes,
  };
}

function tagMask(index: MaterialIndex, tags: string[] | undefined, where: string): number {
  let mask = 0;
  for (const t of tags ?? []) {
    const bit = index.tagBits.get(t);
    if (bit === undefined) throw new Error(`${where}: unknown tag "${t}"`);
    mask |= bit;
  }
  return mask >>> 0;
}

export function packMaterials(doc: MaterialsDoc, index = indexMaterials(doc)): Uint8Array {
  const names = new NamePool();
  const materials = new Writer();
  const reactions = new Writer();
  let reactionCount = 0;

  for (const m of doc.materials) {
    const where = `material "${m.id}"`;
    const nm = names.add(m.id);
    const classId = index.classes.indexOf(m.class);
    if (classId < 0) throw new Error(`${where}: unknown class "${m.class}"`);

    // Reaction rows come first so the material can point at them.
    const start = reactionCount;
    for (const rx of m.reactions ?? []) {
      const tag = rx.with.startsWith("*:") ? rx.with.slice(2) : rx.with;
      const bit = index.tagBits.get(tag);
      if (bit === undefined) throw new Error(`${where}: reaction on unknown tag "${rx.with}"`);
      const produces = index.byName.get(rx.produces);
      if (produces === undefined) {
        throw new Error(`${where}: reaction produces unknown material "${rx.produces}"`);
      }
      reactions.u32(bit).u16(produces).fx(rx.rate).fx(rx.releases?.thermal ?? 0);
      reactionCount++;
    }

    materials
      .u32(nm.off)
      .u32(nm.len)
      .u16(classId)
      .i16(Math.round(m.appearance?.hue_bias ?? 0))
      .u32(tagMask(index, m.tags, where))
      .fx(m.density)
      .fx(m.hardness)
      .fx(m.toughness)
      .fx(m.elasticity)
      .fx(m.friction)
      .fx(m.heat_capacity)
      .fx(m.thermal_conductivity)
      .fx(m.conductivity)
      .fx(m.aether_permeability)
      .fx(m.aether_capacity)
      .fx(m.discharge_threshold)
      .fx(m.corrosion_resistance);

    let flags = 0;
    const phaseRows: Array<{ temp: number; product: number; latent: number }> = [];
    TRANSITIONS.forEach((t, i) => {
      const temp = m.phase_points?.[t];
      if (temp === undefined || temp === null) {
        phaseRows.push({ temp: 0, product: 0xffff, latent: 0 });
        return;
      }
      const productName = m.phase_products?.[t];
      if (!productName) {
        throw new Error(`${where}: phase point "${t}" has no product`);
      }
      const product = index.byName.get(productName);
      if (product === undefined) {
        throw new Error(`${where}: phase "${t}" produces unknown material "${productName}"`);
      }
      flags |= 1 << i;
      phaseRows.push({ temp, product, latent: m.phase_energy?.[t] ?? 0 });
    });
    materials.u32(flags);
    for (const p of phaseRows) {
      materials.fx(p.temp).u16(p.product).fx(p.latent);
    }
    materials.u32(start).u32(reactionCount - start);
  }

  const nameBytes = names.finish();
  return new Writer()
    .u32(MATERIAL_MAGIC)
    .u32(MATERIAL_VERSION)
    .u32(doc.materials.length)
    .u32(reactionCount)
    .u32(nameBytes.length)
    .raw(materials.finish())
    .raw(reactions.finish())
    .raw(nameBytes)
    .finish();
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export interface FormDoc {
  id: string;
  parts: Array<{ id: string; volume: number; offset?: [number, number] }>;
  links: Array<[string, string]>;
  strike_part: string;
  edge_area: number;
  leverage: number;
  max_speed: number;
  reach: number;
}

export interface FormsDoc {
  forms: FormDoc[];
}

const FORM_MAGIC = 0x3130_4d46; // "FM01"
const FORM_VERSION = 1;

export interface FormIndex {
  byName: Map<string, number>;
  docs: FormDoc[];
}

export function indexForms(doc: FormsDoc): FormIndex {
  const byName = new Map<string, number>();
  doc.forms.forEach((f, i) => {
    if (byName.has(f.id)) throw new Error(`duplicate form id: ${f.id}`);
    byName.set(f.id, i);
  });
  return { byName, docs: doc.forms };
}

export function packForms(doc: FormsDoc): Uint8Array {
  const names = new NamePool();
  const forms = new Writer();
  const parts = new Writer();
  const links = new Writer();
  let partCount = 0;
  let linkCount = 0;

  for (const f of doc.forms) {
    const where = `form "${f.id}"`;
    const nm = names.add(f.id);
    const slotOf = new Map<string, number>();
    const partStart = partCount;
    f.parts.forEach((p, i) => {
      if (slotOf.has(p.id)) throw new Error(`${where}: duplicate part "${p.id}"`);
      slotOf.set(p.id, i);
      const pn = names.add(p.id);
      const [ox, oy] = p.offset ?? [0, 0];
      parts.u32(pn.off).u32(pn.len).fx(p.volume).fx(ox).fx(oy);
      partCount++;
    });

    const linkStart = linkCount;
    for (const [a, b] of f.links) {
      const ai = slotOf.get(a);
      const bi = slotOf.get(b);
      if (ai === undefined || bi === undefined) {
        throw new Error(`${where}: link references an unknown part (${a} -> ${b})`);
      }
      links.u16(ai).u16(bi);
      linkCount++;
    }

    const strike = slotOf.get(f.strike_part);
    if (strike === undefined) {
      throw new Error(`${where}: strike_part "${f.strike_part}" is not one of its parts`);
    }

    forms
      .u32(nm.off)
      .u32(nm.len)
      .u32(partStart)
      .u32(f.parts.length)
      .u32(linkStart)
      .u32(f.links.length)
      .u16(strike)
      .fx(f.edge_area)
      .fx(f.leverage)
      .fx(f.max_speed)
      .fx(f.reach);
  }

  const nameBytes = names.finish();
  return new Writer()
    .u32(FORM_MAGIC)
    .u32(FORM_VERSION)
    .u32(doc.forms.length)
    .u32(partCount)
    .u32(linkCount)
    .u32(nameBytes.length)
    .raw(forms.finish())
    .raw(parts.finish())
    .raw(links.finish())
    .raw(nameBytes)
    .finish();
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const RULES_MAGIC = 0x3130_4c52; // "RL01"
const RULES_VERSION = 1;

/** Order must match `Rules::decode` in sim/src/sim.rs. */
export const RULE_FIELDS = [
  "ambient_temp",
  "reference_temp",
  "aether_density",
  "dt",
  "fracture_k",
  "blunt_k",
  "deform_k",
  "friction_heat_k",
  "strike_return_k",
  "conduction_k",
  "ambient_conduction_k",
  "radiant_k",
  "radiant_radius",
  "charge_diffusion_k",
  "charge_leak_k",
  "arc_radius",
  "arc_loss",
  "arc_heat_per_charge",
  "charge_energy_coeff",
  "flux_destabilise_k",
  "swing_arc",
  "soften_k",
  "reaction_k",
] as const;

export type RulesDoc = Record<string, number>;

export function packRules(doc: RulesDoc): Uint8Array {
  const w = new Writer().u32(RULES_MAGIC).u32(RULES_VERSION);
  for (const field of RULE_FIELDS) {
    const v = doc[field];
    if (typeof v !== "number") throw new Error(`rules.json is missing "${field}"`);
    w.fx(v);
  }
  for (const field of ["fragment_max", "cascade_generations"]) {
    const v = doc[field];
    if (typeof v !== "number") throw new Error(`rules.json is missing "${field}"`);
    w.u32(v);
  }
  return w.finish();
}
