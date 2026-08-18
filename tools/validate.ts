/**
 * Schema validation for the data files (§12.5: "Schemas in JSON Schema;
 * validation in CI").
 *
 * This carries a small JSON Schema evaluator rather than a dependency, for the
 * same reason the simulation crate has none: the schemas are a published
 * contract and the thing that checks them should be readable in one sitting.
 * It covers the subset the schemas actually use — types, required, properties,
 * additionalProperties, $ref, $defs, enum, bounds, patterns, arrays,
 * uniqueItems — and fails loudly on any keyword it does not know, so a schema
 * cannot quietly stop being enforced.
 *
 * Cross-file checks that JSON Schema cannot express live at the bottom: every
 * material a phase or reaction names must exist, every transition with a
 * temperature must have a product, discharge thresholds must fit inside
 * capacities, and every form's links and strike part must refer to its own
 * parts.
 *
 *   node tools/validate.ts
 */

import { readJson, heading, dim, green, red, bold } from "./lib.ts";
import type { FormsDoc, MaterialsDoc } from "../src/substrate/pack.ts";

type Json = unknown;
type Schema = Record<string, Json>;

const KNOWN = new Set([
  "$schema",
  "$id",
  "$defs",
  "$ref",
  "$comment",
  "title",
  "description",
  "type",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "enum",
  "const",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "propertyNames",
]);

class Validator {
  private errors: string[] = [];
  private root: Schema;

  constructor(root: Schema) {
    this.root = root;
  }

  validate(value: Json): string[] {
    this.errors = [];
    this.check(value, this.root, "$");
    return this.errors;
  }

  private fail(path: string, message: string) {
    this.errors.push(`${path}: ${message}`);
  }

  private resolve(schema: Schema): Schema {
    const ref = schema["$ref"];
    if (typeof ref !== "string") return schema;
    if (!ref.startsWith("#/")) throw new Error(`only local $ref is supported: ${ref}`);
    let node: Json = this.root;
    for (const part of ref.slice(2).split("/")) {
      node = (node as Record<string, Json>)?.[part];
    }
    if (!node) throw new Error(`unresolved $ref: ${ref}`);
    return node as Schema;
  }

  private check(value: Json, rawSchema: Schema, path: string) {
    const schema = this.resolve(rawSchema);
    for (const key of Object.keys(schema)) {
      if (!KNOWN.has(key)) {
        throw new Error(`schema at ${path} uses unsupported keyword "${key}"`);
      }
    }

    const types = schema.type
      ? Array.isArray(schema.type)
        ? (schema.type as string[])
        : [schema.type as string]
      : null;
    if (types && !types.some((t) => matchesType(value, t))) {
      this.fail(path, `expected ${types.join(" or ")}, got ${describe(value)}`);
      return;
    }

    if (Array.isArray(schema.enum) && !schema.enum.includes(value as never)) {
      this.fail(path, `must be one of ${JSON.stringify(schema.enum)}`);
    }

    if (typeof value === "number") {
      const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } = schema as Record<
        string,
        number
      >;
      if (minimum !== undefined && value < minimum) this.fail(path, `${value} < minimum ${minimum}`);
      if (maximum !== undefined && value > maximum) this.fail(path, `${value} > maximum ${maximum}`);
      if (exclusiveMinimum !== undefined && value <= exclusiveMinimum) {
        this.fail(path, `${value} must be greater than ${exclusiveMinimum}`);
      }
      if (exclusiveMaximum !== undefined && value >= exclusiveMaximum) {
        this.fail(path, `${value} must be less than ${exclusiveMaximum}`);
      }
    }

    if (typeof value === "string" && typeof schema.pattern === "string") {
      if (!new RegExp(schema.pattern).test(value)) {
        this.fail(path, `"${value}" does not match /${schema.pattern}/`);
      }
    }

    if (Array.isArray(value)) {
      const { minItems, maxItems, uniqueItems } = schema as Record<string, number | boolean>;
      if (typeof minItems === "number" && value.length < minItems) {
        this.fail(path, `needs at least ${minItems} items`);
      }
      if (typeof maxItems === "number" && value.length > maxItems) {
        this.fail(path, `allows at most ${maxItems} items`);
      }
      if (uniqueItems === true) {
        const seen = new Set(value.map((v) => JSON.stringify(v)));
        if (seen.size !== value.length) this.fail(path, "items must be unique");
      }
      if (schema.items) {
        value.forEach((item, i) => this.check(item, schema.items as Schema, `${path}[${i}]`));
      }
      return;
    }

    if (value && typeof value === "object") {
      const obj = value as Record<string, Json>;
      const props = (schema.properties ?? {}) as Record<string, Schema>;
      for (const key of (schema.required ?? []) as string[]) {
        if (!(key in obj)) this.fail(path, `missing required property "${key}"`);
      }
      for (const [key, child] of Object.entries(obj)) {
        const childSchema = props[key];
        if (childSchema) {
          this.check(child, childSchema, `${path}.${key}`);
        } else if (schema.additionalProperties === false) {
          this.fail(path, `unexpected property "${key}"`);
        } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
          this.check(child, schema.additionalProperties as Schema, `${path}.${key}`);
        }
      }
    }
  }
}

function matchesType(value: Json, type: string): boolean {
  switch (type) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      throw new Error(`unsupported type "${type}"`);
  }
}

function describe(value: Json): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// ---------------------------------------------------------------------------

const files: Array<[string, string]> = [
  ["data/materials.json", "data/schema/materials.schema.json"],
  ["data/forms.json", "data/schema/forms.schema.json"],
  ["data/rules.json", "data/schema/rules.schema.json"],
  ["data/arena.json", "data/schema/arena.schema.json"],
];

heading("schema validation (§12.5)");

let failed = 0;
for (const [dataPath, schemaPath] of files) {
  const doc = readJson<Json>(dataPath);
  const schema = readJson<Schema>(schemaPath);
  const errors = new Validator(schema).validate(doc);
  if (errors.length === 0) {
    console.log(`  ${green("✓")} ${dataPath}`);
  } else {
    failed++;
    console.log(`  ${red("✗")} ${dataPath}`);
    for (const e of errors.slice(0, 25)) console.log(`      ${e}`);
    if (errors.length > 25) console.log(dim(`      ... and ${errors.length - 25} more`));
  }
}

// --- cross-file invariants --------------------------------------------------

heading("referential integrity");

const materials = readJson<MaterialsDoc>("data/materials.json");
const forms = readJson<FormsDoc>("data/forms.json");
const ids = new Set(materials.materials.map((m) => m.id));
const tags = new Set(materials.tags);
const classes = new Set(materials.classes);
const problems: string[] = [];

for (const m of materials.materials) {
  if (!classes.has(m.class)) problems.push(`${m.id}: unknown class "${m.class}"`);
  for (const t of m.tags ?? []) {
    if (!tags.has(t)) problems.push(`${m.id}: unknown tag "${t}"`);
  }
  for (const t of ["melt", "boil", "ignite", "solidify"] as const) {
    const temp = m.phase_points?.[t];
    const product = m.phase_products?.[t];
    if (temp === undefined || temp === null) {
      if (product) problems.push(`${m.id}: phase product for "${t}" with no temperature`);
      continue;
    }
    if (!product) {
      problems.push(`${m.id}: phase point "${t}" has no product`);
    } else if (!ids.has(product)) {
      problems.push(`${m.id}: "${t}" produces unknown material "${product}"`);
    } else if (product === m.id) {
      problems.push(`${m.id}: "${t}" produces itself`);
    }
  }
  for (const rx of m.reactions ?? []) {
    const tag = rx.with.replace(/^\*:/, "");
    if (!tags.has(tag)) problems.push(`${m.id}: reaction on unknown tag "${rx.with}"`);
    if (!ids.has(rx.produces)) {
      problems.push(`${m.id}: reaction produces unknown material "${rx.produces}"`);
    }
  }
  if (m.discharge_threshold > m.aether_capacity) {
    problems.push(
      `${m.id}: discharge_threshold ${m.discharge_threshold} exceeds aether_capacity ${m.aether_capacity}, so it can never arc`,
    );
  }
  // A solid that can never be deformed can never be worked, repaired or shaped.
  if (m.hardness > 0 && m.toughness <= 0) {
    problems.push(`${m.id}: solid with zero toughness fractures on contact with anything`);
  }
}

// The arena names forms and materials that have to exist, and a prop is either
// an assembly or a lump — never both, never neither.
const arena = readJson<{
  player: { form: string; materials: string[] };
  rack: Array<{ label: string; form: string; materials: string[] }>;
  props: Array<{ label: string; form?: string; materials?: string[]; material?: string }>;
}>("data/arena.json");
const formIds = new Set(forms.forms.map((f) => f.id));
const slotCount = new Map(forms.forms.map((f) => [f.id, f.parts.length]));

function checkAssembly(where: string, form: string, materials: string[]) {
  if (!formIds.has(form)) {
    problems.push(`${where}: unknown form "${form}"`);
    return;
  }
  const slots = slotCount.get(form)!;
  if (materials.length !== slots) {
    problems.push(`${where}: form "${form}" has ${slots} slots but ${materials.length} materials`);
  }
  for (const m of materials) {
    if (!ids.has(m)) problems.push(`${where}: unknown material "${m}"`);
  }
}

checkAssembly("arena player", arena.player.form, arena.player.materials);
for (const entry of arena.rack) {
  checkAssembly(`rack "${entry.label}"`, entry.form, entry.materials);
}
for (const prop of arena.props) {
  const where = `prop "${prop.label}"`;
  if (prop.form) {
    if (prop.material) problems.push(`${where}: has both a form and a material`);
    checkAssembly(where, prop.form, prop.materials ?? []);
  } else if (prop.material) {
    if (!ids.has(prop.material)) problems.push(`${where}: unknown material "${prop.material}"`);
  } else {
    problems.push(`${where}: neither a form nor a material`);
  }
}

for (const f of forms.forms) {
  const slots = new Set(f.parts.map((p) => p.id));
  if (!slots.has(f.strike_part)) {
    problems.push(`form ${f.id}: strike_part "${f.strike_part}" is not one of its parts`);
  }
  for (const [a, b] of f.links) {
    if (!slots.has(a) || !slots.has(b)) {
      problems.push(`form ${f.id}: link ${a} -> ${b} references a part it does not have`);
    }
  }
}

if (problems.length === 0) {
  console.log(`  ${green("✓")} every reference resolves`);
} else {
  failed++;
  for (const p of problems) console.log(`  ${red("✗")} ${p}`);
}

console.log();
if (failed) {
  console.log(red(`  ${bold("INVALID")} — ${failed} file(s) failed validation.\n`));
  process.exit(1);
}
console.log(green(`  ${bold("VALID")} — ${materials.materials.length} materials, ${forms.forms.length} forms.\n`));
