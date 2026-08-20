/**
 * The §17 M1 slice: "Basic forms and melee. Single-player, one small hand-made
 * arena. Readout panel (§12.2)."
 *
 * You are an entity with a `Body`, `Effectors`, `Locomotion` and `Agency`.
 * Nothing marks you as the player except that a keyboard writes your intent —
 * §6.1 forbids anything else, and at M4 a utility evaluator will write the same
 * struct for a wolf. You walk up to a dummy and hit it, and everything that
 * follows is `data/materials.json` meeting `sim/src/impulse.rs`.
 *
 * The three things on screen are all the design's own asks:
 *
 *   - §12.1's derivation colours every surface, so hardness, conductivity,
 *     permeability, heat and charge are legible before you open a panel;
 *   - §12.2's Readout prints what the resolver did, in physical quantities;
 *   - §6.4's twenty ship-gate outcomes are one click away, running the same code
 *     the CI gate runs.
 *
 * Rendering is 2D canvas on purpose. §17 M0 says "no rendering beyond debug
 * primitives", §19 leaves the renderer undecided, and §14.1 requires the choice
 * stay reversible — which it only does while nothing above the substrate
 * assumes one. Part positions come from the form's own geometry, not from here.
 */

import "./arena.css";

import materialsDoc from "../../data/materials.json";
import formsDoc from "../../data/forms.json";
import rulesDoc from "../../data/rules.json";
import arenaDoc from "../../data/arena.json";

import { Substrate, type EntityView, type PartView, type ReadoutEvent } from "./host.ts";
import { fillOf, readSurface, strokeOf, surfaceOf } from "./appearance.ts";
import type { FormsDoc, MaterialsDoc, RulesDoc } from "./pack.ts";

const root = document.getElementById("arena")!;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

let sim: Substrate;
try {
  const response = await fetch("sim.wasm");
  if (!response.ok) throw new Error(`sim.wasm returned ${response.status}`);
  sim = await Substrate.create(await response.arrayBuffer(), {
    materials: materialsDoc as unknown as MaterialsDoc,
    forms: formsDoc as unknown as FormsDoc,
    rules: rulesDoc as unknown as RulesDoc,
  });
} catch (err) {
  root.innerHTML = `<div class="fatal"><h1>The simulation module is not built.</h1>
    <p>This page loads <code>public/sim.wasm</code>, produced from the Rust crate:</p>
    <code>npm run sim:build</code>
    <p>${String(err)}</p></div>`;
  throw err;
}

// ---------------------------------------------------------------------------
// Arena description
// ---------------------------------------------------------------------------

interface RackEntry {
  label: string;
  form: string;
  materials: string[];
  note?: string;
}

interface PropEntry {
  label: string;
  form?: string;
  materials?: string[];
  material?: string;
  volume?: number;
  at: [number, number];
  temp?: number;
  charge?: number;
}

interface ArenaDoc {
  ambient_temp: number;
  player: {
    form: string;
    materials: string[];
    at: [number, number];
    strength: number;
    locomotion: { max_speed: number; accel: number; mass_ref: number };
  };
  rack: RackEntry[];
  props: PropEntry[];
}

const arena = arenaDoc as unknown as ArenaDoc;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

root.innerHTML = `
  <header class="bar">
    <h1>Substrate arena</h1>
    <span class="spec">DESIGN.md §17 M1 — basic forms and melee</span>
    <div class="stats">
      <span>tick <b id="s-tick">0</b></span>
      <span>entities <b id="s-entities">0</b></span>
      <span>state <b id="s-hash">—</b></span>
    </div>
  </header>

  <main class="stage">
    <canvas id="view" tabindex="0"></canvas>
    <div class="stage-overlay">
      <span id="hint">WASD move · mouse aim · click to swing · space to dodge · shift-click to inspect · R resets</span>
      <span id="surface-legend"></span>
    </div>
  </main>

  <aside class="side">
    <section class="panel">
      <h2>Loadout <span>§8.1 — derived, never stored</span></h2>
      <div class="panel-body">
        <div class="rack" id="rack"></div>
        <table class="props" id="weapon-stats"></table>
        <p class="note" id="weapon-note"></p>
      </div>
    </section>

    <section class="panel">
      <h2>Lens <span>§12.2</span></h2>
      <div class="panel-body" id="lens">
        <p class="empty">Nothing selected.</p>
      </div>
    </section>

    <section class="panel">
      <h2>Readout <span>§12.2 — what the resolver did</span></h2>
      <div class="readout" id="readout"></div>
    </section>

    <section class="panel">
      <h2>Ship gate <span>§6.4 — 20 outcomes</span></h2>
      <div class="panel-body">
        <div class="row">
          <select id="scenario" class="grow"></select>
        </div>
        <div class="row">
          <button id="run-one">Run</button>
          <button id="run-all">Run all 20</button>
          <button id="restore">Back to the arena</button>
        </div>
        <p class="claim" id="claim"></p>
        <p class="note" id="note"></p>
      </div>
    </section>
  </aside>
`;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("view");
const ctx = canvas.getContext("2d")!;

// ---------------------------------------------------------------------------
// World construction — everything below reads data/arena.json
// ---------------------------------------------------------------------------

let player = 0;
let weapon: number | null = null;
let equipped = 0;
/** Labels for props, so the Readout can say "chitin dummy". */
const labels = new Map<number, string>();

function buildArena() {
  sim.reset();
  labels.clear();
  selection = null;
  events = [];
  lastEventTick = 0;

  const p = arena.player;
  player = sim.assemble(p.form, p.materials, { x: p.at[0], y: p.at[1], z: 0 }, arena.ambient_temp);
  labels.set(player, "you");
  sim.setLocomotion(player, p.locomotion.max_speed, p.locomotion.accel, p.locomotion.mass_ref);
  sim.setAgency(player, 0, 0, 0, false, false);
  weapon = null;
  equip(equipped);

  for (const prop of arena.props) {
    const at = { x: prop.at[0], y: prop.at[1], z: 0 };
    const e =
      prop.form && prop.materials
        ? sim.assemble(prop.form, prop.materials, at, prop.temp ?? arena.ambient_temp)
        : sim.spawnLump(prop.material!, prop.volume ?? 1, at, prop.temp ?? arena.ambient_temp);
    labels.set(e, prop.label);
    if (prop.charge) sim.setPartCharge(e, 0, prop.charge);
  }
  sim.step(1);
}

/**
 * Put a weapon in the player's hand.
 *
 * The rack is data. Each entry is a form and one material per slot, and the
 * difference between "iron sword" and "obsidian sword" is one string — which is
 * the whole of §8.1's "there is no item database".
 */
function equip(index: number) {
  equipped = ((index % arena.rack.length) + arena.rack.length) % arena.rack.length;
  const entry = arena.rack[equipped];
  if (weapon !== null) sim.despawn(weapon);
  weapon = sim.assemble(entry.form, entry.materials, { x: -100, y: -100, z: 0 }, arena.ambient_temp);
  labels.set(weapon, entry.label);
  sim.setEffectors(player, arena.player.strength, weapon);
  renderRack();
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface Selection {
  entity: number;
  part: number;
}

let selection: Selection | null = null;
let events: ReadoutEvent[] = [];
let lastEventTick = 0;
let zoomMul = 1;
let zoom = 46;
/** Set while a ship-gate scenario has replaced the arena. */
let inScenario = false;

const held = new Set<string>();
let mouseWorld = { x: 1, y: 0 };
let mouseDown = false;
/** Ticks since the last connecting swing, for the arc animation. */
let swingAge = 99;
let swingHit = false;

interface DrawnPart {
  entity: number;
  part: number;
  x: number;
  y: number;
  r: number;
  view: PartView;
}
let drawn: DrawnPart[] = [];

// ---------------------------------------------------------------------------
// Simulation stepping
// ---------------------------------------------------------------------------

function collectEvents() {
  const fresh = sim.events(lastEventTick);
  if (fresh.length) events = [...fresh.reverse(), ...events].slice(0, 400);
  lastEventTick = sim.tick;
}

function stepWorld() {
  if (!inScenario) {
    // Intent first: §6.1's Agency is written once per tick, and the simulation
    // decides what that becomes.
    let dx = 0;
    let dy = 0;
    if (held.has("KeyW") || held.has("ArrowUp")) dy -= 1;
    if (held.has("KeyS") || held.has("ArrowDown")) dy += 1;
    if (held.has("KeyA") || held.has("ArrowLeft")) dx -= 1;
    if (held.has("KeyD") || held.has("ArrowRight")) dx += 1;

    const pos = playerPosition();
    const facing = Math.atan2(mouseWorld.y - pos.y, mouseWorld.x - pos.x);
    // Space is the dodge and the mouse is the swing. Neither is obeyed
    // directly: they are intent, and §5.1's phases decide what becomes of it.
    sim.setAgency(player, dx, dy, facing, mouseDown, held.has("Space"));
  }
  sim.step(1);
  collectEvents();

  const swung = events.find((e) => e.kind === "swung" && e.tick >= sim.tick - 1);
  if (swung) {
    swingAge = 0;
    swingHit = swung.detail === 1;
  } else {
    swingAge++;
  }
}

function playerPosition(): { x: number; y: number } {
  const t = snapshot?.entities.find((e) => e.id === player);
  return t ? { x: t.position.x, y: t.position.y } : { x: 0, y: 0 };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

let snapshot: ReturnType<Substrate["snapshot"]> | null = null;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);

/**
 * Lay a body out from its form's geometry.
 *
 * §8.1 calls a form "rules about shape", and the offsets in `forms.json` are
 * that shape. The renderer rotates them by the entity's facing and does not
 * invent anything: a form with no offsets stacks at the origin, which is
 * correct for a boulder.
 */
function layout(entity: EntityView): DrawnPart[] {
  const form = sim.forms.docs[entity.form];
  const cos = Math.cos(entity.orientation);
  const sin = Math.sin(entity.orientation);
  const out: DrawnPart[] = [];
  for (const p of entity.parts) {
    if (!p.attached || p.volume <= 0) continue;
    const offset = form?.parts[p.slot]?.offset ?? [0, 0];
    // A loose fragment has no form; fan it slightly so a pile is countable.
    const ox = form ? offset[0] : 0;
    const oy = form ? offset[1] : 0;
    out.push({
      entity: entity.id,
      part: p.slot,
      x: entity.position.x + ox * cos - oy * sin,
      y: entity.position.y + ox * sin + oy * cos,
      r: Math.max(0.06, Math.cbrt(Math.max(p.volume, 0.001)) * 0.34),
      view: p,
    });
  }
  return out;
}

function draw() {
  snapshot = sim.snapshot();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  zoom = 46 * zoomMul;
  const focus = inScenario ? centreOfWorld() : playerPosition();
  const toScreen = (x: number, y: number): [number, number] => [
    w / 2 + (x - focus.x) * zoom,
    h / 2 + (y - focus.y) * zoom,
  ];

  // Ground grid: one line per world unit, so distance is readable and the
  // camera's motion is visible.
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  const [ox, oy] = toScreen(Math.floor(focus.x), Math.floor(focus.y));
  for (let x = ox % zoom; x < w; x += zoom) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = oy % zoom; y < h; y += zoom) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  drawn = [];
  for (const e of snapshot.entities) {
    if (e.id === weapon) continue; // drawn in the player's hand instead
    drawn.push(...layout(e));
  }
  if (weapon !== null && !inScenario) drawn.push(...heldWeapon());

  const screen = drawn.map((d) => {
    const [sx, sy] = toScreen(d.x, d.y);
    return { ...d, x: sx, y: sy, r: Math.max(3, d.r * zoom) };
  });

  // A ring under whichever entity the keyboard is driving. This is a camera
  // concern, not a simulation one — nothing in the substrate knows the player
  // exists, and the ring is drawn from the host's own notion of who it is driving.
  if (!inScenario) {
    const you = snapshot.entities.find((e) => e.id === player);
    if (you) {
      const [px, py] = toScreen(you.position.x, you.position.y);
      const r = 0.95 * zoom;
      const attack = sim.attackOf(player);
      ctx.strokeStyle = attack.evading ? "rgba(255,255,255,0.85)" : "rgba(111,179,255,0.28)";
      ctx.lineWidth = attack.evading ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();
      // §5.1's commitment, drawn as the arc it actually is: the ring fills
      // through the windup you can no longer stop, and empties through the
      // recovery you are stuck in. Nothing here is a cooldown bar over a
      // number — it is the phase timer, read back from the simulation.
      if (attack.phase !== "idle") {
        ctx.strokeStyle =
          attack.phase === "windup"
            ? "rgba(255,196,110,0.85)"
            : attack.phase === "active"
              ? "rgba(255,120,90,0.9)"
              : "rgba(120,140,170,0.5)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(
          px,
          py,
          r + 5,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * (attack.phase === "recovery" ? 1 - attack.progress : attack.progress),
        );
        ctx.stroke();
      }
      // A short spur showing which way the swing will go.
      ctx.strokeStyle = "rgba(111,179,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(you.orientation) * r, py + Math.sin(you.orientation) * r);
      ctx.lineTo(
        px + Math.cos(you.orientation) * (r + 10),
        py + Math.sin(you.orientation) * (r + 10),
      );
      ctx.stroke();
    }
  }

  drawSwingArc(toScreen);

  const surfaces = screen.map((d) => ({
    d,
    surface: (() => {
      const doc = sim.materials.docs[d.view.material];
      return doc
        ? surfaceOf(doc, {
            temperature: d.view.temperature,
            charge: d.view.charge,
            integrity: d.view.integrity,
          })
        : null;
    })(),
  }));

  // Glows first so a hot object cannot wash out the silhouette drawn after it.
  for (const { d, surface } of surfaces) {
    if (!surface || surface.emissive.intensity <= 0.02) continue;
    const reach = d.r * 2.8;
    const g = ctx.createRadialGradient(d.x, d.y, d.r * 0.5, d.x, d.y, reach);
    const e = surface.emissive;
    const rgb = `${Math.round(e.r * 255)},${Math.round(e.g * 255)},${Math.round(e.b * 255)}`;
    g.addColorStop(0, `rgba(${rgb},${(e.intensity * 0.42).toFixed(3)})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(d.x, d.y, reach, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const { d, surface } of surfaces) {
    if (!surface) continue;
    ctx.fillStyle = fillOf(surface);
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = strokeOf(surface);
    ctx.lineWidth = surface.arc > 0.05 ? 1 + surface.arc * 2.5 : 1;
    ctx.stroke();
    if (surface.wear > 0.05) {
      ctx.strokeStyle = `rgba(0,0,0,${(surface.wear * 0.6).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2 * surface.wear);
      ctx.stroke();
    }
    if (selection && selection.entity === d.entity && selection.part === d.part) {
      ctx.strokeStyle = "#6fb3ff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawLabels(screen, toScreen);
  drawn = screen;
}

/**
 * Position the wielded weapon in the hand, swinging through its arc.
 *
 * The pose is a pure function of §5.1's phase and how far through it is, so
 * there is no animation state here at all and nothing to keep in sync: what you
 * see is the commitment the simulation is enforcing. Windup draws the weapon
 * back, the active frames sweep it across, recovery carries it home.
 */
function heldWeapon(): DrawnPart[] {
  const view = snapshot?.entities.find((e) => e.id === weapon);
  const you = snapshot?.entities.find((e) => e.id === player);
  if (!view || !you) return [];
  const attack = sim.attackOf(player);
  let sweep = -0.35;
  let extend = 0;
  if (attack.phase === "windup") {
    sweep = -0.35 - 0.75 * attack.progress;
    extend = -0.06 * attack.progress;
  } else if (attack.phase === "active") {
    sweep = -1.1 + 2.1 * attack.progress;
    extend = 0.25;
  } else if (attack.phase === "recovery") {
    sweep = 1.0 - 1.35 * Math.min(1, attack.progress * 2);
    extend = 0.2 * (1 - Math.min(1, attack.progress * 2));
  }
  const angle = you.orientation + sweep * rulesDoc.swing_arc;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const grip = 0.42 + extend;
  const form = sim.forms.docs[view.form];
  const out: DrawnPart[] = [];
  for (const p of view.parts) {
    if (!p.attached || p.volume <= 0) continue;
    const [px, py] = form?.parts[p.slot]?.offset ?? [0, 0];
    const lx = px + grip;
    out.push({
      entity: view.id,
      part: p.slot,
      x: you.position.x + lx * cos - py * sin,
      y: you.position.y + lx * sin + py * cos,
      r: Math.max(0.05, Math.cbrt(Math.max(p.volume, 0.001)) * 0.3),
      view: p,
    });
  }
  return out;
}

function drawSwingArc(toScreen: (x: number, y: number) => [number, number]) {
  if (inScenario || swingAge >= 6) return;
  const you = snapshot?.entities.find((e) => e.id === player);
  if (!you) return;
  const reach = sim.reachOf(player);
  const [cx, cy] = toScreen(you.position.x, you.position.y);
  const fade = 1 - swingAge / 6;
  ctx.strokeStyle = swingHit
    ? `rgba(255,168,110,${(fade * 0.5).toFixed(3)})`
    : `rgba(140,160,185,${(fade * 0.22).toFixed(3)})`;
  ctx.lineWidth = 2 + fade * 3;
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    reach * zoom,
    you.orientation - rulesDoc.swing_arc,
    you.orientation + rulesDoc.swing_arc,
  );
  ctx.stroke();
}

function drawLabels(
  screen: DrawnPart[],
  toScreen: (x: number, y: number) => [number, number],
) {
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Prop names sit above the object; part materials only appear on the one
  // being inspected, or the page turns into a wall of text.
  for (const e of snapshot?.entities ?? []) {
    const label = labels.get(e.id);
    if (!label || e.id === weapon) continue;
    const [sx, sy] = toScreen(e.position.x, e.position.y);
    if (sx < -80 || sy < -40 || sx > canvas.clientWidth + 80 || sy > canvas.clientHeight + 40) {
      continue;
    }
    const width = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(11,13,16,0.72)";
    ctx.fillRect(sx - width / 2 - 3, sy - 34, width + 6, 13);
    ctx.fillStyle = e.id === player ? "rgba(111,179,255,0.9)" : "rgba(215,222,231,0.62)";
    ctx.fillText(label, sx, sy - 27);
  }

  if (selection) {
    const d = screen.find((s) => s.entity === selection!.entity && s.part === selection!.part);
    if (d) {
      const text = d.view.materialName;
      const width = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(11,13,16,0.8)";
      ctx.fillRect(d.x - width / 2 - 3, d.y + d.r + 4, width + 6, 13);
      ctx.fillStyle = "rgba(111,179,255,0.95)";
      ctx.fillText(text, d.x, d.y + d.r + 11);
    }
  }
}

function centreOfWorld(): { x: number; y: number } {
  const es = snapshot?.entities ?? [];
  if (!es.length) return { x: 0, y: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const e of es) {
    minX = Math.min(minX, e.position.x);
    maxX = Math.max(maxX, e.position.x);
    minY = Math.min(minY, e.position.y);
    maxY = Math.max(maxY, e.position.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

const fmt = (v: number, places = 2) => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(places));

function renderStats() {
  $("s-tick").textContent = String(sim.tick);
  $("s-entities").textContent = String(sim.entityCount);
  $("s-hash").textContent = sim.hash().toString(16).padStart(16, "0").slice(0, 12);
}

function renderRack() {
  $("rack").innerHTML = arena.rack
    .map(
      (entry, i) =>
        `<button class="slot ${i === equipped ? "on" : ""}" data-slot="${i}">
           <b>${i + 1}</b> ${entry.label}
         </button>`,
    )
    .join("");
  renderWeaponStats();
}

/**
 * §8.1: "All statistics are derived, none are stored."
 *
 * Every number below is computed from the form's geometry and the materials in
 * its slots, at the moment it is displayed. §12.3 forbids a DPS number or a
 * power score, so there is not one — just the physics the player can reason
 * from.
 */
function renderWeaponStats() {
  const entry = arena.rack[equipped];
  const form = sim.forms.docs[sim.formId(entry.form)];
  const mass = entry.materials.reduce((sum, m, i) => {
    const doc = sim.materials.docs[sim.materialId(m)];
    return sum + doc.density * (form.parts[i]?.volume ?? 0);
  }, 0);
  const velocity = Math.min(form.max_speed, (arena.player.strength * form.leverage) / mass);
  const kinetic = 0.5 * mass * velocity * velocity;
  const blade = sim.materials.docs[sim.materialId(entry.materials[0])];

  $("weapon-stats").innerHTML = `
    <tr><td>mass</td><td>${fmt(mass)}</td></tr>
    <tr><td>swing velocity</td><td>${fmt(velocity)}</td></tr>
    <tr><td>energy per hit</td><td>${fmt(kinetic)}</td></tr>
    <tr><td>contact area</td><td>${fmt(form.edge_area, 3)}</td></tr>
    <tr><td>reach</td><td>${fmt(form.reach)}</td></tr>
    <tr><td>swings / second</td><td>${fmt(velocity / form.reach)}</td></tr>
    <tr><td>head hardness</td><td>${fmt(blade.hardness)}</td></tr>
    <tr><td>head toughness</td><td>${fmt(blade.toughness)}</td></tr>
  `;
  $("weapon-note").textContent = entry.note ?? "";
}

function renderLens() {
  const host = $("lens");
  if (!selection) {
    host.innerHTML = `<p class="empty">Click any part in the arena to read its properties.</p>`;
    $("surface-legend").textContent = "";
    return;
  }
  const { entity, part } = selection;
  const materialId = sim.partMaterial(entity, part);
  const doc = sim.materials.docs[materialId];
  if (!doc) {
    host.innerHTML = `<p class="empty">That part no longer exists.</p>`;
    selection = null;
    return;
  }
  const temperature = sim.partTemp(entity, part);
  const charge = sim.partCharge(entity, part);
  const integrity = sim.partIntegrity(entity, part);
  const volume = sim.partVolume(entity, part);
  const progress = sim.partPhaseProgress(entity, part);
  const target = sim.partPhaseTarget(entity, part);

  const surface = surfaceOf(doc, { temperature, charge, integrity });
  $("surface-legend").textContent = readSurface(surface).join(" · ");

  const bar = (v: number, max: number) =>
    `<span class="bar-cell"><i style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></i></span>`;

  const phaseRows = (["melt", "boil", "ignite", "solidify"] as const)
    .filter((t) => doc.phase_points?.[t] != null)
    .map(
      (t) =>
        `<tr><td>${t}</td><td>${fmt(doc.phase_points![t]!, 0)} → ${doc.phase_products?.[t] ?? "—"}</td></tr>`,
    )
    .join("");
  const reactionRows = (doc.reactions ?? [])
    .map(
      (rx) =>
        `<tr><td>${rx.with}</td><td>${rx.produces}${
          rx.releases?.thermal ? ` (${rx.releases.thermal > 0 ? "+" : ""}${rx.releases.thermal})` : ""
        }</td></tr>`,
    )
    .join("");

  host.innerHTML = `
    <table class="props">
      <tr><td>material</td><td><b>${doc.id}</b></td></tr>
      <tr><td>where</td><td>${labels.get(entity) ?? `entity ${entity}`} · part ${part}</td></tr>
      <tr><td>temperature</td><td>${fmt(temperature, 1)}</td></tr>
      ${target ? `<tr><td>${target}ing</td><td>${fmt(Math.abs(progress), 1)} banked</td></tr>` : ""}
      <tr><td>charge</td><td>${fmt(charge, 2)} / ${fmt(doc.discharge_threshold, 2)}${bar(charge, doc.discharge_threshold)}</td></tr>
      <tr><td>integrity</td><td>${fmt(integrity, 3)}${bar(integrity, 1)}</td></tr>
      <tr><td>volume</td><td>${fmt(volume, 3)}</td></tr>
    </table>
    <div class="legend">${(doc.tags ?? []).map((t) => `<span class="tag">${t}</span>`).join("")}</div>
    <table class="props" style="margin-top:8px">
      <tr><td>density</td><td>${fmt(doc.density)}</td></tr>
      <tr><td>hardness</td><td>${fmt(doc.hardness)}</td></tr>
      <tr><td>toughness</td><td>${fmt(doc.toughness)}</td></tr>
      <tr><td>elasticity</td><td>${fmt(doc.elasticity)}</td></tr>
      <tr><td>friction</td><td>${fmt(doc.friction)}</td></tr>
      <tr><td>heat capacity</td><td>${fmt(doc.heat_capacity)}</td></tr>
      <tr><td>thermal cond.</td><td>${fmt(doc.thermal_conductivity)}</td></tr>
      <tr><td>conductivity</td><td>${fmt(doc.conductivity)}</td></tr>
      <tr><td>permeability</td><td>${fmt(doc.aether_permeability)}</td></tr>
      <tr><td>corrosion res.</td><td>${fmt(doc.corrosion_resistance)}</td></tr>
    </table>
    ${phaseRows ? `<div class="legend">phase points</div><table class="props">${phaseRows}</table>` : ""}
    ${reactionRows ? `<div class="legend">reacts with</div><table class="props">${reactionRows}</table>` : ""}
  `;
}

function where(e: ReadoutEvent): string {
  return labels.get(e.entity) ?? `entity ${e.entity}`;
}

function describe(e: ReadoutEvent): string {
  const before = sim.materialName(e.materialBefore);
  const after = sim.materialName(e.materialAfter);
  switch (e.kind) {
    case "swung":
      return e.detail
        ? `${fmt(e.a)} of energy into ${after}`
        : `nothing within ${fmt(e.b)} reach`;
    case "impact":
      return `${where(e)}: ${before} absorbed ${fmt(e.a)} at ${fmt(e.b)} stress`;
    case "deformed":
      return `${where(e)}: ${before} lost ${fmt(e.a, 3)} integrity (stress ${fmt(e.b)})`;
    case "fractured":
      return `${where(e)}: ${before} broke into ${e.detail} — ${fmt(e.a)} past a threshold of ${fmt(e.b)}`;
    case "phase":
      return `${where(e)}: ${before} → ${after} crossing ${fmt(e.b, 0)} at ${fmt(e.a, 0)}`;
    case "reacted":
      return `${fmt(e.a, 3)} of ${before} → ${after}, ${e.b >= 0 ? "releasing" : "absorbing"} ${fmt(Math.abs(e.b))}`;
    case "discharged":
      return e.detail
        ? `${fmt(e.a)} arced away past a threshold of ${fmt(e.b)}`
        : `${fmt(e.a)} had nowhere to go and became heat`;
    case "destroyed":
      return `${where(e)}: ${before} is gone (${fmt(e.a, 3)} volume)`;
    case "spawned":
      return `${fmt(e.a, 3)} of ${before} became its own object`;
    case "committed":
      return `${fmt(e.b, 2)} of weapon needs ${fmt(e.a, 2)}s of windup — no way back now`;
    case "nearing":
      return `${where(e)}: ${before} held at ${fmt(e.a * 100, 0)}% of a ${fmt(e.b)} threshold`;
    case "dodged":
      return `${where(e)}: ${fmt(e.a, 2)}s of roll, ${fmt(e.b, 2)}s of it untouchable`;
    case "evaded":
      return `${where(e)}: ${fmt(e.a)} of energy passed through where it had been`;
    default:
      return `${fmt(e.a)} / ${fmt(e.b)}`;
  }
}

function renderReadout() {
  const host = $("readout");
  if (events.length === 0) {
    host.innerHTML = `<div class="panel-body"><p class="empty">Nothing has happened yet. Walk up to a dummy and swing — every line here is a physical quantity the resolver produced, never a damage number (§12.3).</p></div>`;
    return;
  }
  host.innerHTML = events
    .slice(0, 90)
    .map(
      (e) =>
        `<div class="ev ${e.kind}"><span class="t">${e.tick}</span><span class="k">${e.kind}</span><span class="d">${describe(e)}</span></div>`,
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const focus = inScenario ? centreOfWorld() : playerPosition();
  return {
    x: focus.x + (clientX - rect.left - rect.width / 2) / zoom,
    y: focus.y + (clientY - rect.top - rect.height / 2) / zoom,
  };
}

canvas.addEventListener("mousemove", (ev) => {
  mouseWorld = screenToWorld(ev.clientX, ev.clientY);
});

canvas.addEventListener("mousedown", (ev) => {
  canvas.focus();
  // Shift-click inspects instead of swinging, and so does any click in the
  // scenario view where there is no player to swing.
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  if (ev.shiftKey || inScenario || ev.button === 2) {
    pick(x, y);
    return;
  }
  // A click that lands on a part both swings and selects, which is what makes
  // the Lens useful while fighting.
  pick(x, y);
  mouseDown = true;
});

window.addEventListener("mouseup", () => {
  mouseDown = false;
});

canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());

function pick(x: number, y: number) {
  let best: DrawnPart | null = null;
  let bestDist = Infinity;
  for (const d of drawn) {
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist <= d.r + 6 && dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  if (best) {
    selection = { entity: best.entity, part: best.part };
    renderLens();
  }
}

canvas.addEventListener(
  "wheel",
  (ev) => {
    ev.preventDefault();
    zoomMul = Math.max(0.35, Math.min(3, zoomMul * (ev.deltaY < 0 ? 1.1 : 0.91)));
  },
  { passive: false },
);

window.addEventListener("keydown", (ev) => {
  if (ev.target instanceof HTMLSelectElement) return;
  held.add(ev.code);
  if (ev.code === "Space") ev.preventDefault();
  if (ev.code === "KeyR") {
    inScenario = false;
    buildArena();
    $("claim").textContent = "";
    $("note").textContent = "";
  }
  if (ev.code === "KeyQ") equip(equipped - 1);
  if (ev.code === "KeyE") equip(equipped + 1);
  const digit = ev.code.match(/^Digit([1-9])$/);
  if (digit) equip(Number(digit[1]) - 1);
});
window.addEventListener("keyup", (ev) => held.delete(ev.code));
window.addEventListener("blur", () => {
  held.clear();
  mouseDown = false;
});

$("rack").addEventListener("click", (ev) => {
  const slot = (ev.target as HTMLElement).closest<HTMLElement>("[data-slot]");
  if (slot) {
    equip(Number(slot.dataset.slot));
    canvas.focus();
  }
});

// ---------------------------------------------------------------------------
// Ship gate
// ---------------------------------------------------------------------------

const scenarios = sim.scenarios();
$<HTMLSelectElement>("scenario").innerHTML = scenarios
  .map((s) => `<option value="${s.index}">${s.index + 1}. ${s.name}</option>`)
  .join("");

function showScenario(index: number): boolean {
  const s = scenarios[index];
  inScenario = true;
  labels.clear();
  events = [];
  lastEventTick = 0;
  selection = null;
  const result = sim.runScenario(index);
  collectEvents();
  $("claim").textContent = s.claim;
  $("note").innerHTML =
    `<span class="verdict ${result.passed ? "pass" : "fail"}">${result.passed ? "held" : "did not hold"}</span> ` +
    result.note;
  renderLens();
  return result.passed;
}

$("run-one").addEventListener("click", () =>
  showScenario(Number($<HTMLSelectElement>("scenario").value)),
);

$("run-all").addEventListener("click", () => {
  let passed = 0;
  for (const s of scenarios) if (showScenario(s.index)) passed++;
  $("note").innerHTML =
    `<span class="verdict ${passed === scenarios.length ? "pass" : "fail"}">${passed} / ${scenarios.length} held</span> ` +
    `run from the same code the CI gate runs.`;
  $("claim").textContent = "§6.4: twenty distinct tactical outcomes, none of them implemented.";
});

$("restore").addEventListener("click", () => {
  inScenario = false;
  buildArena();
  $("claim").textContent = "";
  $("note").textContent = "";
  canvas.focus();
});

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

resize();
buildArena();
renderLens();
canvas.focus();

const TICK_MS = 1000 * rulesDoc.dt; // §13.2 — 20 Hz.
let accumulator = 0;
let last = performance.now();
let paintedTick = -1;

function frame(now: number) {
  // Fixed-step simulation, uncapped render (§13.2). The clamp stops a
  // backgrounded tab from trying to catch up on thousands of ticks at once.
  accumulator = Math.min(accumulator + (now - last), TICK_MS * 6);
  last = now;
  while (accumulator >= TICK_MS) {
    stepWorld();
    accumulator -= TICK_MS;
  }

  draw();
  if (sim.tick !== paintedTick) {
    paintedTick = sim.tick;
    renderStats();
    renderReadout();
    if (selection) renderLens();
  }
  requestAnimationFrame(frame);
}

// A handle for the browser-driven smoke test in `tools/`. This page is a
// development arena, not a shipped client, and being able to ask it where the
// player is standing is worth more than hiding it.
(window as unknown as Record<string, unknown>).arena = {
  player: () => player,
  weapon: () => weapon,
  equipped: () => arena.rack[equipped].label,
  position: () => playerPosition(),
  props: () =>
    (snapshot?.entities ?? []).map((e) => ({
      id: e.id,
      label: labels.get(e.id) ?? null,
      x: e.position.x,
      y: e.position.y,
    })),
  reach: () => sim.reachOf(player),
  attack: () => sim.attackOf(player),
  speed: () => sim.speedOf(player),
  integrity: (entity: number, part: number) => sim.partIntegrity(entity, part),
  material: (entity: number, part: number) => sim.materialName(sim.partMaterial(entity, part)),
};

requestAnimationFrame(frame);
