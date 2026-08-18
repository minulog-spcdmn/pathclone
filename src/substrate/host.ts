/**
 * Host wrapper around the simulation module.
 *
 * DESIGN.md §13.1 and §14.1: the client is a renderer and an input device, and
 * the simulation crate knows nothing about either. This file is the entire
 * surface between them. It runs unchanged in a browser tab and in Node, which
 * is what makes `tools/determinism.ts` a real cross-host test rather than a
 * self-comparison.
 *
 * Fixed-point values cross as `BigInt`. The `number`-taking helpers convert at
 * the boundary via `toFx` and nowhere else.
 */

import {
  indexForms,
  indexMaterials,
  packForms,
  packMaterials,
  packRules,
  toFx,
  fromFx,
  type FormIndex,
  type FormsDoc,
  type MaterialIndex,
  type MaterialsDoc,
  type RulesDoc,
} from "./pack.ts";

interface Exports {
  memory: WebAssembly.Memory;
  sim_alloc(len: number): number;
  sim_out_len(): number;
  sim_out_ptr(): number;
  sim_init(seed: bigint): void;
  sim_load_materials(ptr: number, len: number): number;
  sim_load_forms(ptr: number, len: number): number;
  sim_load_rules(ptr: number, len: number): number;
  sim_step(ticks: number): void;
  sim_tick(): number;
  sim_hash(): bigint;
  sim_entity_count(): number;
  sim_stored_energy(): bigint;
  sim_spawn_lump(material: number, volume: bigint, x: bigint, y: bigint, z: bigint, temp: bigint): number;
  sim_assemble(
    form: number,
    matsPtr: number,
    matsLen: number,
    x: bigint,
    y: bigint,
    z: bigint,
    temp: bigint,
  ): number;
  sim_graft(entity: number, material: number, volume: bigint, temp: bigint, linkTo: number): number;
  sim_set_effectors(entity: number, strength: bigint, wielded: bigint): void;
  sim_set_locomotion(entity: number, maxSpeed: bigint, accel: bigint, massRef: bigint): void;
  sim_set_agency(entity: number, dx: bigint, dy: bigint, facing: bigint, wantStrike: number): void;
  sim_entity_field(entity: number, field: number): bigint;
  sim_swing(entity: number): number;
  sim_set_part_temp(entity: number, part: number, temp: bigint): number;
  sim_set_part_charge(entity: number, part: number, charge: bigint): number;
  sim_despawn(entity: number): void;
  sim_inject(
    entity: number,
    part: number,
    kinetic: bigint,
    contactArea: bigint,
    thermal: bigint,
    charge: bigint,
    corrosive: bigint,
    reagent: number,
    aetherFlux: bigint,
  ): void;
  sim_strike(attacker: number, target: number, part: number): bigint;
  sim_snapshot(): number;
  sim_events(sinceTick: number): number;
  sim_clear_events(): void;
  sim_part_temp(entity: number, part: number): bigint;
  sim_part_field(entity: number, part: number, field: number): bigint;
  sim_scenario_count(): number;
  sim_scenario_name(index: number): number;
  sim_scenario_claim(index: number): number;
  sim_scenario_run(index: number): number;
  sim_soak(ticks: number): bigint;
  sim_audit_excess(baseline: bigint): bigint;
  sim_ledger(field: number): bigint;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

export interface ImpulseSpec {
  kinetic?: number;
  contactArea?: number;
  thermal?: number;
  charge?: number;
  corrosive?: number;
  /** Tag names from `materials.json`. */
  reagent?: string[];
  aetherFlux?: number;
}

export interface PartView {
  slot: number;
  material: number;
  materialName: string;
  volume: number;
  integrity: number;
  temperature: number;
  charge: number;
  attached: boolean;
}

export interface EntityView {
  id: number;
  position: Vec3;
  /** Yaw, radians. */
  orientation: number;
  form: number;
  parts: PartView[];
}

export interface Snapshot {
  tick: number;
  entities: EntityView[];
}

/** Mirrors `EventKind` in sim/src/events.rs. */
export const EVENT_KINDS = [
  "impact",
  "deformed",
  "fractured",
  "phase",
  "reacted",
  "discharged",
  "destroyed",
  "spawned",
  "conducted",
  "swung",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export interface ReadoutEvent {
  tick: number;
  kind: EventKind;
  entity: number;
  part: number;
  materialBefore: number;
  materialAfter: number;
  detail: number;
  a: number;
  b: number;
}

export interface DataFiles {
  materials: MaterialsDoc;
  forms: FormsDoc;
  rules: RulesDoc;
}

export class Substrate {
  readonly materials: MaterialIndex;
  readonly forms: FormIndex;
  readonly rules: RulesDoc;
  private readonly ex: Exports;

  private constructor(ex: Exports, data: DataFiles) {
    this.ex = ex;
    this.materials = indexMaterials(data.materials);
    this.forms = indexForms(data.forms);
    this.rules = data.rules;
  }

  static async create(wasm: BufferSource, data: DataFiles, seed = 1n): Promise<Substrate> {
    // No imports: the module is closed over its own arithmetic (§14.4 rule 2).
    const { instance } = await WebAssembly.instantiate(wasm, {});
    const ex = instance.exports as unknown as Exports;
    const s = new Substrate(ex, data);
    s.upload(packMaterials(data.materials, s.materials), ex.sim_load_materials, "materials");
    s.upload(packForms(data.forms), ex.sim_load_forms, "forms");
    s.upload(packRules(data.rules), ex.sim_load_rules, "rules");
    ex.sim_init(seed);
    return s;
  }

  private upload(bytes: Uint8Array, fn: (p: number, l: number) => number, what: string) {
    const ptr = this.write(bytes);
    const rc = fn.call(this.ex, ptr, bytes.length);
    if (rc !== 0) throw new Error(`the simulation rejected the ${what} blob (code ${rc})`);
  }

  /** Copy into the module's scratch buffer and return its pointer. */
  private write(bytes: Uint8Array): number {
    const ptr = this.ex.sim_alloc(bytes.length);
    new Uint8Array(this.ex.memory.buffer, ptr, bytes.length).set(bytes);
    return ptr;
  }

  private readOut(ptr: number): DataView {
    const len = this.ex.sim_out_len();
    // A fresh view every time: any call may have grown linear memory and
    // detached the previous one.
    return new DataView(this.ex.memory.buffer, ptr, len);
  }

  private readOutString(ptr: number): string {
    const len = this.ex.sim_out_len();
    return new TextDecoder().decode(new Uint8Array(this.ex.memory.buffer, ptr, len));
  }

  materialId(name: string): number {
    const id = this.materials.byName.get(name);
    if (id === undefined) throw new Error(`no such material: ${name}`);
    return id;
  }

  materialName(id: number): string {
    return this.materials.names[id] ?? (id === 0xffff ? "-" : `#${id}`);
  }

  formId(name: string): number {
    const id = this.forms.byName.get(name);
    if (id === undefined) throw new Error(`no such form: ${name}`);
    return id;
  }

  reagentMask(tags: string[]): number {
    let mask = 0;
    for (const t of tags) {
      const bit = this.materials.tagBits.get(t);
      if (bit === undefined) throw new Error(`no such tag: ${t}`);
      mask |= bit;
    }
    return mask >>> 0;
  }

  /** Tags a material carries when it acts as a reagent. */
  tagsOf(material: string | number): string[] {
    const id = typeof material === "string" ? this.materialId(material) : material;
    return this.materials.docs[id]?.tags ?? [];
  }

  reset(seed = 1n) {
    this.ex.sim_init(seed);
  }

  step(ticks = 1) {
    this.ex.sim_step(ticks);
  }

  get tick(): number {
    return this.ex.sim_tick();
  }

  hash(): bigint {
    return BigInt.asUintN(64, this.ex.sim_hash());
  }

  get entityCount(): number {
    return this.ex.sim_entity_count();
  }

  storedEnergy(): number {
    return fromFx(this.ex.sim_stored_energy());
  }

  /**
   * §6.3's energy inequality, measured against a baseline taken earlier.
   * Positive means the simulation produced energy from nothing.
   */
  auditExcess(baseline: number): number {
    return fromFx(this.ex.sim_audit_excess(toFx(baseline)));
  }

  ledger(): { injected: number; released: number; absorbed: number; dissipated: number } {
    return {
      injected: fromFx(this.ex.sim_ledger(0)),
      released: fromFx(this.ex.sim_ledger(1)),
      absorbed: fromFx(this.ex.sim_ledger(2)),
      dissipated: fromFx(this.ex.sim_ledger(3)),
    };
  }

  spawnLump(material: string | number, volume: number, at: Vec3 = ORIGIN, temp?: number): number {
    const id = typeof material === "string" ? this.materialId(material) : material;
    return this.ex.sim_spawn_lump(
      id,
      toFx(volume),
      toFx(at.x),
      toFx(at.y),
      toFx(at.z),
      toFx(temp ?? this.rules.ambient_temp),
    );
  }

  assemble(form: string, materials: string[], at: Vec3 = ORIGIN, temp?: number): number {
    const ids = materials.map((m) => this.materialId(m));
    const bytes = new Uint8Array(ids.length * 2);
    const view = new DataView(bytes.buffer);
    ids.forEach((id, i) => view.setUint16(i * 2, id, true));
    const ptr = this.write(bytes);
    const e = this.ex.sim_assemble(
      this.formId(form),
      ptr,
      bytes.length,
      toFx(at.x),
      toFx(at.y),
      toFx(at.z),
      toFx(temp ?? this.rules.ambient_temp),
    );
    if (e === 0xffffffff) throw new Error(`could not assemble form "${form}"`);
    return e;
  }

  /** Attach a new part to an existing assembly — a splash landing on a target. */
  graft(entity: number, material: string, volume: number, temp: number, linkTo = 0): number {
    const slot = this.ex.sim_graft(entity, this.materialId(material), toFx(volume), toFx(temp), linkTo);
    if (slot < 0) throw new Error(`could not graft onto entity ${entity}`);
    return slot;
  }

  setEffectors(entity: number, strength: number, wielded?: number) {
    this.ex.sim_set_effectors(entity, toFx(strength), BigInt(wielded ?? -1));
  }

  /** §6.1 `Locomotion`. Without it an entity cannot move at all. */
  setLocomotion(entity: number, maxSpeed: number, accel: number, massRef: number) {
    this.ex.sim_set_locomotion(entity, toFx(maxSpeed), toFx(accel), toFx(massRef));
  }

  /**
   * §6.1 `Agency` — this tick's intent.
   *
   * A keyboard writes it here; §10.3's utility evaluator will write the same
   * struct at M4. Nothing downstream can tell which, which is §6.1's rule about
   * never asking "is this a player?" enforced by there being no other way in.
   */
  setAgency(entity: number, moveX: number, moveY: number, facing: number, wantStrike: boolean) {
    this.ex.sim_set_agency(entity, toFx(moveX), toFx(moveY), toFx(facing), wantStrike ? 1 : 0);
  }

  facingOf(entity: number): number {
    return fromFx(this.ex.sim_entity_field(entity, 0));
  }

  /** Seconds until this entity can swing again. */
  recoveryOf(entity: number): number {
    return fromFx(this.ex.sim_entity_field(entity, 1));
  }

  speedOf(entity: number): number {
    return fromFx(this.ex.sim_entity_field(entity, 2));
  }

  /** Reach of whatever the entity is wielding, derived from the form (§8.1). */
  reachOf(entity: number): number {
    return fromFx(this.ex.sim_entity_field(entity, 3));
  }

  /** 1 hit, 0 missed, -1 recovering, -2 nothing to swing with. */
  swing(entity: number): number {
    return this.ex.sim_swing(entity);
  }

  setPartTemp(entity: number, part: number, temp: number) {
    if (this.ex.sim_set_part_temp(entity, part, toFx(temp)) !== 0) {
      throw new Error(`no part ${part} on entity ${entity}`);
    }
  }

  setPartCharge(entity: number, part: number, charge: number) {
    if (this.ex.sim_set_part_charge(entity, part, toFx(charge)) !== 0) {
      throw new Error(`no part ${part} on entity ${entity}`);
    }
  }

  despawn(entity: number) {
    this.ex.sim_despawn(entity);
  }

  inject(entity: number, part: number, imp: ImpulseSpec) {
    this.ex.sim_inject(
      entity,
      part,
      toFx(imp.kinetic ?? 0),
      toFx(imp.contactArea ?? 1),
      toFx(imp.thermal ?? 0),
      toFx(imp.charge ?? 0),
      toFx(imp.corrosive ?? 0),
      imp.reagent ? this.reagentMask(imp.reagent) : 0,
      toFx(imp.aetherFlux ?? 0),
    );
  }

  /** Delivered kinetic energy, or 0 if the swing could not resolve. */
  strike(attacker: number, target: number, part = 0): number {
    return fromFx(this.ex.sim_strike(attacker, target, part));
  }

  partTemp(entity: number, part: number): number {
    return fromFx(this.ex.sim_part_temp(entity, part));
  }

  partMaterial(entity: number, part: number): number {
    return Number(this.ex.sim_part_field(entity, part, 0));
  }

  partVolume(entity: number, part: number): number {
    return fromFx(this.ex.sim_part_field(entity, part, 1));
  }

  partIntegrity(entity: number, part: number): number {
    return fromFx(this.ex.sim_part_field(entity, part, 2));
  }

  partCharge(entity: number, part: number): number {
    return fromFx(this.ex.sim_part_field(entity, part, 4));
  }

  partAttached(entity: number, part: number): boolean {
    return this.ex.sim_part_field(entity, part, 5) !== 0n;
  }

  /** Latent energy banked toward a pending phase change (§12.2's Readout). */
  partPhaseProgress(entity: number, part: number): number {
    return fromFx(this.ex.sim_part_field(entity, part, 6));
  }

  /** Which transition that progress is banked toward, or null. */
  partPhaseTarget(entity: number, part: number): string | null {
    const t = Number(this.ex.sim_part_field(entity, part, 7));
    return ["melt", "boil", "ignite", "solidify"][t] ?? null;
  }

  snapshot(): Snapshot {
    const ptr = this.ex.sim_snapshot();
    const dv = this.readOut(ptr);
    let o = 0;
    const tick = dv.getUint32(o, true);
    o += 4;
    const count = dv.getUint32(o, true);
    o += 4;
    const entities: EntityView[] = [];
    for (let i = 0; i < count; i++) {
      const id = dv.getUint32(o, true);
      o += 4;
      const position = {
        x: fromFx(dv.getBigInt64(o, true)),
        y: fromFx(dv.getBigInt64(o + 8, true)),
        z: fromFx(dv.getBigInt64(o + 16, true)),
      };
      o += 24;
      const orientation = fromFx(dv.getBigInt64(o, true));
      o += 8;
      const form = dv.getUint16(o, true);
      o += 2;
      const partCount = dv.getUint16(o, true);
      o += 2;
      const parts: PartView[] = [];
      for (let p = 0; p < partCount; p++) {
        const slot = dv.getUint16(o, true);
        const material = dv.getUint16(o + 2, true);
        parts.push({
          slot,
          material,
          materialName: this.materialName(material),
          volume: fromFx(dv.getBigInt64(o + 4, true)),
          integrity: fromFx(dv.getBigInt64(o + 12, true)),
          temperature: fromFx(dv.getBigInt64(o + 20, true)),
          charge: fromFx(dv.getBigInt64(o + 28, true)),
          attached: dv.getUint8(o + 36) !== 0,
        });
        o += 37;
      }
      entities.push({ id, position, orientation, form, parts });
    }
    return { tick, entities };
  }

  events(sinceTick = 0): ReadoutEvent[] {
    const ptr = this.ex.sim_events(sinceTick);
    const dv = this.readOut(ptr);
    const count = dv.getUint32(0, true);
    const out: ReadoutEvent[] = [];
    let o = 4;
    for (let i = 0; i < count; i++) {
      out.push({
        tick: dv.getUint32(o, true),
        kind: EVENT_KINDS[dv.getUint8(o + 4)] ?? "impact",
        detail: dv.getUint8(o + 5),
        entity: dv.getUint32(o + 6, true),
        part: dv.getUint16(o + 10, true),
        materialBefore: dv.getUint16(o + 12, true),
        materialAfter: dv.getUint16(o + 14, true),
        a: fromFx(dv.getBigInt64(o + 16, true)),
        b: fromFx(dv.getBigInt64(o + 24, true)),
      });
      o += 32;
    }
    return out;
  }

  clearEvents() {
    this.ex.sim_clear_events();
  }

  scenarios(): Array<{ index: number; name: string; claim: string }> {
    const n = this.ex.sim_scenario_count();
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        index: i,
        name: this.readOutString(this.ex.sim_scenario_name(i)),
        claim: this.readOutString(this.ex.sim_scenario_claim(i)),
      });
    }
    return out;
  }

  /**
   * Run the §14.4 determinism soak and return the resulting state hash.
   *
   * Unlike a scenario this continues the current world, so calling it
   * repeatedly produces a checkpoint sequence rather than independent runs.
   */
  soak(ticks: number): bigint {
    return BigInt.asUintN(64, this.ex.sim_soak(ticks));
  }

  /** Runs one §6.4 scenario from a clean world and reports what happened. */
  runScenario(index: number): { passed: boolean; note: string } {
    const passed = this.ex.sim_scenario_run(index) !== 0;
    return { passed, note: this.readOutString(this.ex.sim_out_ptr()) };
  }
}
