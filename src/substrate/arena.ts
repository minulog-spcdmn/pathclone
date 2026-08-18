/**
 * The bare test arena of DESIGN.md §4.4, and the §15 M1 deliverable that goes
 * with it: "Single-player, one small hand-made arena. Readout panel (§10.2)."
 *
 * Three things happen on this page, and all three are the design's own asks:
 *
 *   - the twenty §4.4 ship-gate outcomes can be run and watched, using the same
 *     code the CI gate runs, so what a stakeholder sees is what the build checks;
 *   - every surface is coloured by §10.1's property derivation, so a material's
 *     hardness, conductivity, permeability, heat and charge are legible before
 *     anyone opens a panel;
 *   - the §10.2 Readout prints what the resolver actually did, in physical
 *     quantities, because §10.3 is emphatic that hiding the numbers is how this
 *     kind of game dies.
 *
 * Rendering is 2D canvas on purpose. §15 M0 says "no rendering beyond debug
 * primitives", §17 leaves the renderer open until it is worth deciding, and
 * §12.1 requires that the choice stay reversible — which it only does while
 * nothing above the substrate assumes one.
 */

import "./arena.css";

import materialsDoc from "../../data/materials.json";
import formsDoc from "../../data/forms.json";
import rulesDoc from "../../data/rules.json";

import { Substrate, type EntityView, type ReadoutEvent, type PartView } from "./host.ts";
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
    <p>The arena loads <code>public/sim.wasm</code>, which is produced from the Rust crate:</p>
    <code>npm run sim:build</code>
    <p>${String(err)}</p></div>`;
  throw err;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

root.innerHTML = `
  <header class="bar">
    <h1>Substrate arena</h1>
    <span class="spec">DESIGN.md §4.4 — materials × impulses, nothing else</span>
    <div class="stats">
      <span>tick <b id="s-tick">0</b></span>
      <span>entities <b id="s-entities">0</b></span>
      <span>stored energy <b id="s-energy">0</b></span>
      <span>state <b id="s-hash">—</b></span>
    </div>
  </header>

  <main class="stage">
    <canvas id="view"></canvas>
    <div class="stage-overlay">
      <span id="hint">click a part to inspect it · scroll to zoom</span>
      <span id="surface-legend"></span>
    </div>
  </main>

  <aside class="side">
    <section class="panel">
      <h2>Ship gate <span>§4.4 — 20 outcomes</span></h2>
      <div class="panel-body">
        <div class="row">
          <select id="scenario" class="grow"></select>
        </div>
        <div class="row">
          <button id="run-one">Run</button>
          <button id="run-all">Run all 20</button>
          <span id="tally" class="empty"></span>
        </div>
        <p class="claim" id="claim"></p>
        <p class="note" id="note"></p>
      </div>
    </section>

    <section class="panel">
      <h2>Sandbox</h2>
      <div class="panel-body">
        <div class="row">
          <label>material</label>
          <select id="material" class="grow"></select>
        </div>
        <div class="row">
          <label>volume</label>
          <input id="volume" type="number" value="1" min="0.05" step="0.05" style="width:70px" />
          <label>temp</label>
          <input id="temp" type="number" value="20" step="10" style="width:70px" />
          <button id="place">Place</button>
        </div>
        <div class="row">
          <label>impulse</label>
          <input id="magnitude" type="number" value="400" step="50" style="width:78px" />
          <button id="heat">Heat</button>
          <button id="chill">Chill</button>
          <button id="charge">Charge</button>
        </div>
        <div class="row">
          <label>reagent</label>
          <select id="reagent" style="flex:1"></select>
          <button id="douse">Apply</button>
        </div>
        <div class="row">
          <label>weapon</label>
          <select id="form" class="grow"></select>
        </div>
        <div class="row">
          <label>made of</label>
          <select id="weapon-material" class="grow"></select>
          <button id="strike">Strike selection</button>
        </div>
        <div class="row">
          <button id="tick">Step</button>
          <button id="play">Run</button>
          <button id="clear">Clear world</button>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>Lens <span>§10.2</span></h2>
      <div class="panel-body" id="lens">
        <p class="empty">Nothing selected.</p>
      </div>
    </section>

    <section class="panel">
      <h2>Readout <span>§10.2 — what the resolver did</span></h2>
      <div class="readout" id="readout"></div>
    </section>
  </aside>
`;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("view");
const ctx = canvas.getContext("2d")!;

// ---------------------------------------------------------------------------
// Control population
// ---------------------------------------------------------------------------

const scenarios = sim.scenarios();
$<HTMLSelectElement>("scenario").innerHTML = scenarios
  .map((s) => `<option value="${s.index}">${s.index + 1}. ${s.name}</option>`)
  .join("");

const materialOptions = sim.materials.docs
  .map((m, i) => `<option value="${i}">${m.id}</option>`)
  .join("");
$<HTMLSelectElement>("material").innerHTML = materialOptions;
$<HTMLSelectElement>("weapon-material").innerHTML = materialOptions;
$<HTMLSelectElement>("weapon-material").value = String(sim.materialId("cold_iron"));

$<HTMLSelectElement>("form").innerHTML = sim.forms.docs
  .map((f, i) => `<option value="${i}">${f.id}</option>`)
  .join("");
$<HTMLSelectElement>("form").value = String(sim.formId("blade_straight_single_edge"));

$<HTMLSelectElement>("reagent").innerHTML = [...sim.materials.tagBits.keys()]
  .map((t) => `<option value="${t}">${t}</option>`)
  .join("");
$<HTMLSelectElement>("reagent").value = "acid";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface Selection {
  entity: number;
  part: number;
}

let selection: Selection | null = null;
let running = false;
let lastEventTick = 0;
let events: ReadoutEvent[] = [];
// The view frames itself; the wheel multiplies that fit rather than replacing
// it, so zooming never loses the world off-screen.
let zoom = 26;
let zoomMul = 1;
let wielder: number | null = null;
let weapon: number | null = null;

/** Layout cache so clicks can hit-test exactly what was drawn. */
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
// Simulation control
// ---------------------------------------------------------------------------

function collectEvents() {
  const fresh = sim.events(lastEventTick);
  if (fresh.length) {
    events = [...fresh.reverse(), ...events].slice(0, 400);
  }
  lastEventTick = sim.tick;
}

function step(ticks = 1) {
  sim.step(ticks);
  collectEvents();
}

function resetWorld() {
  sim.reset();
  selection = null;
  events = [];
  lastEventTick = 0;
  wielder = null;
  weapon = null;
}

/** Lazily build something that can hold a weapon (§4.1: it is just components). */
function ensureWielder(): number {
  const formId = Number($<HTMLSelectElement>("form").value);
  const materialId = Number($<HTMLSelectElement>("weapon-material").value);
  const formDoc = sim.forms.docs[formId];
  const materials = formDoc.parts.map((_, i) =>
    // Blade and head take the chosen material; hafts and grips are wood and
    // hide, because a solid-iron grip is a different (and worse) weapon.
    i === 0 ? sim.materialName(materialId) : i === formDoc.parts.length - 1 ? "boarhide" : "heartwood",
  );
  if (weapon !== null) sim.despawn(weapon);
  weapon = sim.assemble(formDoc.id, materials, { x: -6, y: -6, z: 0 });
  if (wielder === null) {
    wielder = sim.assemble(
      "body_bipedal",
      ["flesh", "flesh", "flesh", "flesh", "flesh", "flesh", "boarhide"],
      { x: -8, y: -6, z: 0 },
    );
  }
  sim.setEffectors(wielder, 3.5, weapon);
  return wielder;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resize);

/** Parts have no position of their own; fan them around the entity. */
function layout(entity: EntityView, cx: number, cy: number): DrawnPart[] {
  const live = entity.parts.filter((p) => p.attached && p.volume > 0);
  if (live.length === 0) return [];
  const out: DrawnPart[] = [];
  if (live.length === 1) {
    const p = live[0];
    out.push({ entity: entity.id, part: p.slot, x: cx, y: cy, r: radiusOf(p), view: p });
    return out;
  }
  const spread = zoom * 0.42;
  live.forEach((p, i) => {
    const a = (i / live.length) * Math.PI * 2 - Math.PI / 2;
    out.push({
      entity: entity.id,
      part: p.slot,
      x: cx + Math.cos(a) * spread,
      y: cy + Math.sin(a) * spread,
      r: radiusOf(p),
      view: p,
    });
  });
  return out;
}

function radiusOf(p: PartView): number {
  return Math.max(3, Math.cbrt(Math.max(p.volume, 0.001)) * zoom * 0.38);
}

function draw() {
  const snapshot = sim.snapshot();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // Fit the world, so the view never has to be driven manually.
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const e of snapshot.entities) {
    minX = Math.min(minX, e.position.x);
    maxX = Math.max(maxX, e.position.x);
    minY = Math.min(minY, e.position.y);
    maxY = Math.max(maxY, e.position.y);
  }
  if (!Number.isFinite(minX)) {
    minX = maxX = minY = maxY = 0;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Fit the extent, with room for the part fan and the labels beneath it.
  const margin = 3;
  const spanX = Math.max(maxX - minX, 0.001) + margin * 2;
  const spanY = Math.max(maxY - minY, 0.001) + margin * 2;
  const fit = Math.min(w / spanX, h / spanY);
  zoom = Math.max(7, Math.min(110, fit * zoomMul));

  const toScreen = (x: number, y: number): [number, number] => [
    w / 2 + (x - cx) * zoom,
    h / 2 + (y - cy) * zoom,
  ];

  // Ground grid, so scale is visible.
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  const gridStep = zoom;
  const [ox, oy] = toScreen(Math.floor(minX) - 2, Math.floor(minY) - 2);
  for (let x = ox % gridStep; x < w; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = oy % gridStep; y < h; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  drawn = [];
  for (const e of snapshot.entities) {
    const [sx, sy] = toScreen(e.position.x, e.position.y);
    drawn.push(...layout(e, sx, sy));
  }

  // Assembly links first, so parts sit on top of them.
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1.5;
  for (const e of snapshot.entities) {
    const parts = drawn.filter((d) => d.entity === e.id);
    if (parts.length < 2) continue;
    for (let i = 1; i < parts.length; i++) {
      ctx.beginPath();
      ctx.moveTo(parts[0].x, parts[0].y);
      ctx.lineTo(parts[i].x, parts[i].y);
      ctx.stroke();
    }
  }

  const surfaces = new Map<DrawnPart, ReturnType<typeof surfaceOf>>();
  for (const d of drawn) {
    const doc = sim.materials.docs[d.view.material];
    if (!doc) continue;
    surfaces.set(
      d,
      surfaceOf(doc, {
        temperature: d.view.temperature,
        charge: d.view.charge,
        integrity: d.view.integrity,
      }),
    );
  }

  // Glows first, all of them, so a hot part cannot wash out the silhouette of
  // whatever is drawn after it. This is the §10.1 emissive channel, cheaply.
  for (const [d, surface] of surfaces) {
    if (surface.emissive.intensity <= 0.02) continue;
    const reach = d.r * 2.6;
    const glow = ctx.createRadialGradient(d.x, d.y, d.r * 0.5, d.x, d.y, reach);
    const e = surface.emissive;
    const rgb = `${Math.round(e.r * 255)},${Math.round(e.g * 255)},${Math.round(e.b * 255)}`;
    glow.addColorStop(0, `rgba(${rgb},${(e.intensity * 0.42).toFixed(3)})`);
    glow.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(d.x, d.y, reach, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const [d, surface] of surfaces) {
    ctx.fillStyle = fillOf(surface);
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = strokeOf(surface);
    ctx.lineWidth = surface.arc > 0.05 ? 1 + surface.arc * 2.5 : 1;
    ctx.stroke();

    // Wear reads as a bite out of the outline.
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

  // Label the larger parts once there is room.
  if (zoom > 14) {
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const placed: Array<{ x: number; y: number; w: number }> = [];
    // Biggest first: when labels would collide, the larger object keeps its name.
    for (const d of [...drawn].sort((a, b) => b.r - a.r)) {
      if (d.r < 7) continue;
      const label = d.view.materialName;
      const width = ctx.measureText(label).width;
      const x = d.x;
      const y = d.y + d.r + 10;
      if (placed.some((p) => Math.abs(p.y - y) < 11 && Math.abs(p.x - x) < (p.w + width) / 2 + 4)) {
        continue;
      }
      placed.push({ x, y, w: width });
      ctx.fillStyle = "rgba(11,13,16,0.75)";
      ctx.fillRect(x - width / 2 - 2, y - 6, width + 4, 12);
      ctx.fillStyle = "rgba(215,222,231,0.72)";
      ctx.fillText(label, x, y);
    }
  }
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

const fmt = (v: number, places = 2) =>
  Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(places);

function renderStats() {
  $("s-tick").textContent = String(sim.tick);
  $("s-entities").textContent = String(sim.entityCount);
  $("s-energy").textContent = fmt(sim.storedEnergy(), 1);
  $("s-hash").textContent = sim.hash().toString(16).padStart(16, "0").slice(0, 12);
}

function renderLens() {
  const host = $("lens");
  if (!selection) {
    host.innerHTML = `<p class="empty">Nothing selected. Click a part in the arena.</p>`;
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
        `<tr><td>${rx.with}</td><td>${rx.produces} ${
          rx.releases?.thermal ? `(${rx.releases.thermal > 0 ? "+" : ""}${rx.releases.thermal})` : ""
        }</td></tr>`,
    )
    .join("");

  // §10.3: display physical properties, never a derived power score.
  host.innerHTML = `
    <table class="props">
      <tr><td>material</td><td><b>${doc.id}</b></td></tr>
      <tr><td>entity·part</td><td>${entity}·${part}</td></tr>
      <tr><td>temperature</td><td>${fmt(temperature, 1)}</td></tr>
      ${
        target
          ? `<tr><td>${target}ing</td><td>${fmt(Math.abs(progress), 1)} banked</td></tr>`
          : ""
      }
      <tr><td>charge</td><td>${fmt(charge, 2)} / ${fmt(doc.discharge_threshold, 2)}${bar(
        charge,
        doc.discharge_threshold,
      )}</td></tr>
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
      <tr><td>aether cap.</td><td>${fmt(doc.aether_capacity)}</td></tr>
      <tr><td>corrosion res.</td><td>${fmt(doc.corrosion_resistance)}</td></tr>
    </table>
    ${phaseRows ? `<div class="legend">phase points</div><table class="props">${phaseRows}</table>` : ""}
    ${reactionRows ? `<div class="legend">reacts with</div><table class="props">${reactionRows}</table>` : ""}
  `;
}

function describe(e: ReadoutEvent): string {
  const before = sim.materialName(e.materialBefore);
  const after = sim.materialName(e.materialAfter);
  switch (e.kind) {
    case "impact":
      return `${before} absorbed ${fmt(e.a)} at ${fmt(e.b)} stress`;
    case "deformed":
      return `${before} lost ${fmt(e.a, 3)} integrity (stress ${fmt(e.b)})`;
    case "fractured":
      return `${before} broke into ${e.detail} — ${fmt(e.a)} past a threshold of ${fmt(e.b)}`;
    case "phase":
      return `${before} → ${after} crossing ${fmt(e.b, 0)} at ${fmt(e.a, 0)}`;
    case "reacted":
      return `${fmt(e.a, 3)} of ${before} → ${after}, ${e.b >= 0 ? "releasing" : "absorbing"} ${fmt(Math.abs(e.b))}`;
    case "discharged":
      return e.detail
        ? `${fmt(e.a)} arced away past a threshold of ${fmt(e.b)}`
        : `${fmt(e.a)} had nowhere to go and became heat`;
    case "destroyed":
      return `${before} is gone (${fmt(e.a, 3)} volume)`;
    case "spawned":
      return `${fmt(e.a, 3)} of ${before} became its own object`;
    default:
      return `${fmt(e.a)} / ${fmt(e.b)}`;
  }
}

function renderReadout() {
  const host = $("readout");
  if (events.length === 0) {
    host.innerHTML = `<div class="panel-body"><p class="empty">Nothing has happened yet. §10.2: this panel is the hypothesis-testing loop — every line is a physical quantity the resolver produced, never a damage number.</p></div>`;
    return;
  }
  host.innerHTML = events
    .slice(0, 120)
    .map(
      (e) =>
        `<div class="ev ${e.kind}"><span class="t">${e.tick}</span><span class="k">${e.kind}</span><span class="d">${describe(e)}</span></div>`,
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

canvas.addEventListener("click", (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  let best: DrawnPart | null = null;
  let bestDist = Infinity;
  for (const d of drawn) {
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist <= d.r + 6 && dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  selection = best ? { entity: best.entity, part: best.part } : null;
  renderLens();
});

canvas.addEventListener(
  "wheel",
  (ev) => {
    ev.preventDefault();
    zoomMul = Math.max(0.25, Math.min(8, zoomMul * (ev.deltaY < 0 ? 1.12 : 0.89)));
  },
  { passive: false },
);

function withSelection(fn: (entity: number, part: number) => void) {
  if (!selection) {
    $("hint").textContent = "select a part first — click one in the arena";
    return;
  }
  fn(selection.entity, selection.part);
  step(1);
}

$("place").addEventListener("click", () => {
  const material = Number($<HTMLSelectElement>("material").value);
  const volume = Number($<HTMLInputElement>("volume").value) || 1;
  const temp = Number($<HTMLInputElement>("temp").value) || 20;
  // Spread new lumps along a line so they are within radiant range of each
  // other — which is how fire spreading becomes visible without staging it.
  const n = sim.entityCount;
  sim.spawnLump(material, volume, { x: (n % 8) * 1.6 - 5, y: Math.floor(n / 8) * 1.6, z: 0 }, temp);
  step(1);
});

$("heat").addEventListener("click", () =>
  withSelection((e, p) => sim.inject(e, p, { thermal: Number($<HTMLInputElement>("magnitude").value) })),
);
$("chill").addEventListener("click", () =>
  withSelection((e, p) => sim.inject(e, p, { thermal: -Number($<HTMLInputElement>("magnitude").value) })),
);
$("charge").addEventListener("click", () =>
  withSelection((e, p) =>
    sim.inject(e, p, { charge: Math.abs(Number($<HTMLInputElement>("magnitude").value)) / 10 }),
  ),
);
$("douse").addEventListener("click", () =>
  withSelection((e, p) =>
    sim.inject(e, p, { corrosive: 3, reagent: [$<HTMLSelectElement>("reagent").value] }),
  ),
);

$("strike").addEventListener("click", () => {
  if (!selection) {
    $("hint").textContent = "select a target first — click a part in the arena";
    return;
  }
  const hand = ensureWielder();
  sim.strike(hand, selection.entity, selection.part);
  step(1);
});

$("tick").addEventListener("click", () => step(1));
$("clear").addEventListener("click", () => {
  resetWorld();
  $("claim").textContent = "";
  $("note").textContent = "";
});

$("play").addEventListener("click", () => {
  running = !running;
  $("play").textContent = running ? "Pause" : "Run";
});

function showScenario(index: number) {
  const s = scenarios[index];
  events = [];
  lastEventTick = 0;
  const result = sim.runScenario(index);
  collectEvents();
  selection = null;
  $("claim").textContent = s.claim;
  $("note").innerHTML =
    `<span class="verdict ${result.passed ? "pass" : "fail"}">${result.passed ? "held" : "did not hold"}</span> ` +
    result.note;
  renderLens();
  return result.passed;
}

$("run-one").addEventListener("click", () => {
  showScenario(Number($<HTMLSelectElement>("scenario").value));
  $("tally").textContent = "";
});

$("run-all").addEventListener("click", () => {
  let passed = 0;
  for (const s of scenarios) if (showScenario(s.index)) passed++;
  const tally = $("tally");
  tally.textContent = `${passed} / ${scenarios.length} held`;
  tally.className = passed === scenarios.length ? "verdict pass" : "verdict fail";
  $<HTMLSelectElement>("scenario").value = String(scenarios.length - 1);
});

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

resize();

let lastStep = performance.now();
const TICK_MS = 1000 * rulesDoc.dt; // §11.2 — 20 Hz.

// The canvas is cheap to redraw every frame; the panels are not, and rebuilding
// their markup at 60 Hz is the difference between a responsive page and a warm
// laptop. They only change when the simulation does.
let paintedTick = -1;

function frame(now: number) {
  if (running && now - lastStep >= TICK_MS) {
    const catchUp = Math.min(6, Math.floor((now - lastStep) / TICK_MS));
    step(catchUp);
    lastStep = now;
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

// Start with something on screen: the first ship-gate outcome, already run.
showScenario(0);
requestAnimationFrame(frame);
