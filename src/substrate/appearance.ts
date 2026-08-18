/**
 * §12.1 — appearance derived from properties.
 *
 *   "One shader family, applied to every entity in the game, driving surface
 *    parameters from material properties. ... This is not a cosmetic decision.
 *    It means a player who has never seen a material can read four of its
 *    properties off its surface at a glance ... Non-negotiable."
 *
 * The design's table maps properties onto PBR channels for a real renderer.
 * M0 and M1 have no renderer — §17 says "no rendering beyond debug primitives"
 * — so this module produces the same channels and then flattens them to
 * something a 2D canvas can draw. The derivation is what matters and it lives
 * here, in one pure function, so swapping in a material graph later is a change
 * of consumer rather than a change of rule.
 *
 * Nothing here reads a material *name*. A procedurally generated material and a
 * hand-authored one go through the identical path, which is the other half of
 * why §12.1 is called non-negotiable: it is what makes generated content look
 * coherent with no art pass.
 */

import type { MaterialDoc } from "./pack.ts";

/** The §12.1 channel set, before it is flattened for a given renderer. */
export interface Surface {
  /** Degrees. */
  hue: number;
  /** 0 polished, 1 matte. Inverse of hardness — hard things polish. */
  roughness: number;
  /** Driven by charge conductivity. */
  metallic: number;
  /** Blackbody-ish emission from current temperature. */
  emissive: { r: number; g: number; b: number; intensity: number };
  /** Current charge as a fraction of what the material will hold. */
  arc: number;
  /** Internal scatter, from aether permeability. */
  translucency: number;
  /** 0 pristine, 1 destroyed. */
  wear: number;
}

/** Per-class base hue. Taxonomy only, exactly as §6.2 says. */
const CLASS_HUE: Record<string, number> = {
  mineral: 30,
  metal: 205,
  organic: 15,
  fluid: 200,
  gas: 190,
  aetheric: 275,
  residue: 0,
};

export interface PartState {
  temperature: number;
  charge: number;
  integrity: number;
}

export function surfaceOf(m: MaterialDoc, state: PartState): Surface {
  // `hue_bias` overrides the class hue when authored; the class is the fallback
  // so a new material with no appearance block still looks like its family.
  const hue = m.appearance?.hue_bias ?? CLASS_HUE[m.class] ?? 0;

  // Hardness spans roughly 0..9 across the table. Normalising against a fixed
  // ceiling rather than the table's own max keeps a mod's appearance stable
  // when it adds a harder material.
  const roughness = clamp01(1 - m.hardness / 9);
  const metallic = clamp01(m.conductivity / 6);
  const translucency = clamp01(m.aether_permeability);
  const wear = clamp01(1 - state.integrity);

  const capacity = Math.max(m.discharge_threshold, 0.0001);
  const arc = clamp01(state.charge / capacity);

  return {
    hue,
    roughness,
    metallic,
    emissive: blackbody(state.temperature),
    arc,
    translucency,
    wear,
  };
}

/**
 * Temperature to glow. Not a physical Planck curve — §3 rules that out as a
 * cost with no player-facing benefit — but monotonic and readable: nothing
 * below a few hundred degrees, then red, orange, yellow, white.
 */
export function blackbody(temp: number): Surface["emissive"] {
  const t = temp - 380;
  if (t <= 0) return { r: 0, g: 0, b: 0, intensity: 0 };
  const k = clamp01(t / 1500);
  // Red comes up first and saturates; green follows; blue only at the top.
  const r = clamp01(k * 3);
  const g = clamp01((k - 0.18) * 2.0);
  const b = clamp01((k - 0.55) * 2.2);
  return { r, g, b, intensity: clamp01(k * 1.6) };
}

/** Flatten a `Surface` to a fill colour for the debug arena. */
export function fillOf(s: Surface): string {
  // Metallic reads as desaturated-but-bright; roughness darkens.
  const saturation = 20 + (1 - s.metallic) * 45 - s.translucency * 10;
  const lightness = 62 - s.roughness * 26 + s.metallic * 8 - s.wear * 14;
  const alpha = 1 - s.translucency * 0.35;
  const base = `hsla(${s.hue}, ${clamp(saturation, 6, 80)}%, ${clamp(lightness, 10, 82)}%, ${alpha.toFixed(3)})`;
  if (s.emissive.intensity <= 0) return base;
  // Hot surfaces are painted by their own light, not by their pigment.
  const e = s.emissive;
  const glow = `rgb(${Math.round(e.r * 255)}, ${Math.round(e.g * 255)}, ${Math.round(e.b * 255)})`;
  return mix(base, glow, e.intensity);
}

/** Outline colour: charge shows as an arc-blue rim well before it discharges. */
export function strokeOf(s: Surface): string {
  if (s.arc > 0.05) {
    const a = 0.25 + s.arc * 0.75;
    return `rgba(150, 205, 255, ${a.toFixed(3)})`;
  }
  return "rgba(255, 255, 255, 0.14)";
}

/**
 * A short, honest description of what the surface is telling the player.
 *
 * §12.3: "Do not hide the numbers behind flavour text." This does the opposite
 * — it names which property each visible cue comes from, so the arena teaches
 * the mapping rather than assuming it.
 */
export function readSurface(s: Surface): string[] {
  const out: string[] = [];
  out.push(s.roughness < 0.4 ? "polished (hard)" : s.roughness > 0.75 ? "matte (soft)" : "satin");
  if (s.metallic > 0.5) out.push("metallic sheen (conductive)");
  if (s.translucency > 0.6) out.push("translucent (aether-permeable)");
  if (s.emissive.intensity > 0.02) out.push("glowing (hot)");
  if (s.arc > 0.4) out.push("arcing (near discharge)");
  if (s.wear > 0.3) out.push("battered (damaged)");
  return out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function mix(a: string, b: string, t: number): string {
  // Canvas parses both forms, so blending happens by drawing b over a with
  // alpha rather than by converting colour spaces here.
  return `color-mix(in srgb, ${b} ${Math.round(t * 100)}%, ${a})`;
}
