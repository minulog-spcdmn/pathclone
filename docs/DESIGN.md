# Untitled Systemic Sandbox ARPG — Design Document v1.0

**Status:** Pre-production specification. Intended to be executable by a dev team without further design intervention.
**Target:** Browser-playable (WebGPU/WebGL2), persistent shared world, ARPG-derived action layer, systems-first content model.

---

## 0. Read this first: the emergence thesis

There is a failure mode this document exists to prevent.

The intuitive route to "emergent gameplay" is **maximal proceduralism** — generate everything, hardcode nothing, and hope interesting behaviour falls out. It doesn't. Maximal proceduralism produces *noise*: a combinatorially enormous space in which every point is mechanically equivalent to every other point. Players correctly read this as "nothing here matters" and leave.

Emergence is produced by the opposite thing: **a small number of tightly constrained rules with dense mutual interaction.** Chess has six piece types. Dwarf Fortress has maybe two dozen real systems. Noita has one (materials) plus a physics solver. The combinatorial explosion should happen in the *interaction matrix*, not in the *rule count*.

So the operating constraint for this project is:

> **Few systems. Total interaction. Zero exceptions.**
>
> Every system must interact with every other system through a shared substrate. If a feature requires a special case to work, the feature is wrong, not the substrate.

"As little hardcoded stuff as possible" is therefore reinterpreted, and the team should hold this reinterpretation:

- **Hardcoded *rules*: as few as possible, and hand-authored with extreme care.** The rules are the game. They get design attention, iteration, and tuning.
- **Hardcoded *content*: zero.** No item list, no enemy list, no spell list, no quest list, no biome list. Content is what falls out of rules applied to procedurally generated inputs.

The second constraint below is equally load-bearing and is the one most often dropped:

> **Emergence the player cannot predict is indistinguishable from a random number generator.**

A systemic game only reads as systemic if the player can form a hypothesis, test it, and be right. Legibility is not polish applied at the end; it is a hard requirement on every system in this document (see §10). If a system cannot be made legible, cut it.

---

## 1. Product summary

A persistent, shared, effectively infinite 3D world. Players explore, fight, gather, refine, build, and trade. The action layer is ARPG-derived: third-person/isometric-ish camera, direct movement, active abilities, dodge, resource management, loot.

What distinguishes it from an ARPG: **there is no content database.** There is no table of 400 swords, no bestiary, no spell list. There is a material simulation, a fabrication system, an effect-composition system, and an ecology, and every sword, creature, and spell in the game is a runtime product of those four things interacting with a generated world.

The player-facing promise: *"Anything you can reason about, you can do. Nothing in this world was placed there for you."*

**Session shape:** 30–90 minute sessions, drop-in/drop-out, no hard progression gates, persistent character and persistent world consequences.

---

## 2. Design pillars

Each pillar is stated with a **falsifiable test.** If the test fails at any milestone, the pillar is not being met and the milestone is not complete.

### P1 — One substrate, no special cases

Everything in the world — the player, a wolf, a sword, a boulder, a campfire, a thrown potion — is the same kind of object made of the same kind of stuff, obeying the same rules.

> **Test:** A designer can take any property of the player character (inventory, abilities, metabolism, material composition, damage response) and give it to a rock, without writing code.

### P2 — Consequence, not permission

The world does not check whether the player is allowed to do something. It checks whether it is *physically possible* under the simulation.

> **Test:** At least three of the intended "solutions" observed in playtesting for any given obstacle were not anticipated by the design team.

### P3 — Legible causality

Every outcome is traceable by the player to a cause they could have observed beforehand.

> **Test:** A player who has never seen a given material can predict, with >60% accuracy after 10 minutes of experimentation, how it will behave when heated, struck, or charged.

### P4 — Scarcity gives space meaning

An infinite world is worthless unless locations differ in ways players care about. Difference comes from **non-uniform, finite, regenerating resources** and from world state that players have altered.

> **Test:** Given a choice between two unexplored regions, players consistently express a *reason* for choosing one.

### P5 — Other players are world state

Multiplayer is not a mode. Other players are entities in the same simulation, and their actions leave the same kind of persistent marks that anything else does.

> **Test:** A player can determine, from world state alone with no UI affordance, that another player was here and what they did.

### P6 — Knowledge is the progression curve

Character power grows slowly and mostly through equipment. What actually grows is what the player *knows*: which materials do what, where they occur, which effect combinations are efficient, how creatures behave.

> **Test:** A veteran player on a fresh character outperforms a novice on a maxed character in an unfamiliar region.

---

## 3. Non-goals (explicit anti-requirements)

These are listed so that the team can refuse them under pressure. Adding any of these is a design regression, not a feature request.

| Non-goal | Why |
|---|---|
| Authored quest content, NPC dialogue trees, story missions | Directly contradicts P2. Narrative comes from world history generation and player action. |
| A named item list ("Blade of Whatever") | Contradicts §1. Notable items arise from provenance and history, not authorship. |
| Class system / skill tree | Contradicts P6. Fixed archetypes collapse the combination space. |
| Global level scaling, or enemy level numbers | Destroys P4. Regional danger must come from what actually lives there. |
| Physical accuracy (real SI units, rigid-body everything) | Simulation is *physically inspired*, one abstraction above reality, tuned for legibility and determinism. Accuracy is a cost with no player-facing benefit. |
| Voxel terrain destruction at fine granularity | Kills the persistence model (§6.3) and the bandwidth budget. Coarse, bounded, expiring terrain deltas only. |
| Full-loot open PvP everywhere | Sandboxes with unbounded griefing self-select into a tiny hostile population. See §9.3. |
| Native client, launcher, install | Browser is a hard platform constraint and shapes every budget in §12. |

---

## 4. The simulation substrate

Four layers, bottom to top. Higher layers may only talk to lower layers through the defined interfaces. **No layer may special-case an entity type.**

```
┌─────────────────────────────────────────────────┐
│ L4  Agency      goals, needs, utility AI, players│
├─────────────────────────────────────────────────┤
│ L3  Form        shapes, assemblies, items, bodies│
├─────────────────────────────────────────────────┤
│ L2  Interaction impulses, reactions, state change│
├─────────────────────────────────────────────────┤
│ L1  Matter      materials and their properties   │
└─────────────────────────────────────────────────┘
```

### 4.1 Entity model

Strict ECS. Entities are integer IDs. There is no `Player` type, no `Enemy` type, no `Item` type — those are *component compositions*, and any entity can acquire or lose any component at runtime.

Baseline component set (non-exhaustive; the team will add, but must not add type-discriminating components):

| Component | Contents |
|---|---|
| `Transform` | position (fixed-point world coords), orientation, velocity |
| `Body` | assembly graph of parts, each part → `(form_id, material_id, volume, integrity)` |
| `Thermal` | stored heat, surface temp (derived) |
| `Charge` | stored aether/electric charge |
| `Integrity` | per-part damage state, fracture points |
| `Metabolism` | energy reserve, consumption rate, needs vector |
| `Sensors` | modality, range, acuity, FOV per modality |
| `Locomotion` | mode(s), speed curves, terrain affinity |
| `Effectors` | what this entity can *do* — attack forms, ability graph slots |
| `Inventory` | contained entity IDs, capacity by volume and mass |
| `Agency` | goal stack, utility evaluator config, memory |
| `Ownership` | claim references, provenance chain |
| `Persistence` | delta-log participation flag, decay policy |

**Rule:** if a system needs to know "is this a player?", the system is designed wrong. It should be asking "does this have `Agency` with an external controller?" — and behave identically for an AI-controlled entity with the same components.

### 4.2 Materials: the spine of the game

**Materials are the single most important system in this project.** Everything else derives leverage from them. Budget design attention accordingly.

A material is a data record. There is no material *code*. Schema:

```jsonc
{
  "id": "hoarfrost_quartz",
  "class": "mineral",            // taxonomy only; no mechanical effect

  // Mechanical
  "density":            2.1,     // game units, monotonic vs. real intuition
  "hardness":           0.72,    // resistance to plastic deformation
  "toughness":          0.18,    // resistance to fracture (hardness↑toughness↓ is common)
  "elasticity":         0.30,    // energy return on impact
  "friction":           0.42,

  // Thermal
  "heat_capacity":      0.55,
  "thermal_conductivity": 0.81,
  "phase_points":     { "melt": -20, "boil": 140, "ignite": null },
  "phase_products":   { "melt": "quartz_melt", "boil": "aether_vapor" },

  // Energetic / arcane
  "conductivity":       0.05,    // charge transfer
  "aether_permeability":0.90,    // how readily fields pass through
  "aether_capacity":    3.40,    // how much charge it can store before discharge
  "discharge_threshold":2.80,

  // Chemical
  "corrosion_resistance": 0.66,
  "reactions": [
    { "with": "*:solvent", "produces": "quartz_slurry", "rate": 0.4, "releases": { "thermal": -12 } },
    { "with": "*:reducer", "produces": "raw_quartz",    "rate": 0.1 }
  ],

  // Formation — links material existence to worldgen (§6)
  "formation": {
    "requires": { "temperature": [-40, -5], "aether_density": [0.6, 1.0], "depth": [20, 200] },
    "abundance": 0.03
  },

  // Presentation — DERIVED where possible, see §10.1
  "appearance": { "derive_from_properties": true, "hue_bias": 195 }
}
```

Notes for implementers:

- **Values are game units, not SI.** The requirement is *monotonicity and consistent ratios*, not accuracy. A material that is twice as hard should behave twice as hard in a way the player can feel.
- **Property correlations must be authored as tendencies, not laws.** Hard-and-brittle vs. soft-and-tough is the normal relationship; a material that breaks the correlation is automatically interesting and should be rare. Procedural material generation (§6.4) should sample from a correlated distribution, with a small chance of anti-correlated outliers.
- **Reaction tags (`*:solvent`) let materials interact without an N² table.** Materials carry role tags; reactions match on tags. This keeps the interaction matrix authorable as the material count grows into the hundreds.
- **Target count:** ~40 hand-authored base materials at vertical slice; procedural variants and alloys expand this into the thousands at runtime. Hand-author the *archetypes*, generate the *space between them*.

### 4.3 The impulse model: there are no damage types

The single largest de-hardcoding win in this design. **Delete the damage type enum.** Nothing in this game deals "fire damage."

Every interaction — a sword hit, a spell, falling off a cliff, standing in lava, an arrow, a potion — produces an **Impulse**, a packet of transferred quantities:

```rust
struct Impulse {
    kinetic:     Fixed,  // energy transferred mechanically
    contact_area:Fixed,  // small area + high kinetic = penetration; large = blunt trauma
    thermal:     Fixed,  // may be negative (heat extraction)
    charge:      Fixed,  // electrical/aetheric
    corrosive:   Fixed,  // chemical potential, carries a reagent tag
    reagent:     TagSet, // what it's made of, for reaction matching
    aether_flux: Fixed,  // field disturbance; drives arcane effects
}
```

Resolution algorithm (fixed-point, deterministic, order-independent within a tick):

1. For each affected `Body` part, compute **stress** = `kinetic / contact_area`.
2. If `stress > hardness` → plastic deformation, reduce `Integrity`.
3. If `stress > hardness * (1 + toughness * k)` → **fracture**, part separates. Fractured parts become entities in their own right.
4. Distribute `thermal` into `Thermal` weighted by `heat_capacity`; propagate to adjacent parts by `thermal_conductivity`.
5. Check `phase_points` — a part whose temperature crosses a phase point transforms into its `phase_product` **including parts of the player and parts of items.**
6. Distribute `charge` by `conductivity`; if a part exceeds `discharge_threshold`, emit a secondary Impulse to the nearest conductive neighbour (this is how chain lightning happens without a "chain lightning" feature).
7. Match `reagent` tags against each part's `reactions`; apply products and released energy as a further Impulse (bounded to 3 cascade generations to guarantee termination).

**What this buys you, for free, with no additional code:**

- Wet targets conduct charge better → rain, rivers, and thrown water become tactical.
- A blade with high hardness and low contact area penetrates armour; a maul with high kinetic and large contact area doesn't penetrate but transfers enough energy to fracture brittle armour.
- Freezing an elastic creature makes it brittle, so the follow-up hit shatters it. Nobody implemented "freeze then shatter." It falls out of `elasticity`, `phase_points`, and step 3.
- An ice weapon melts if you fight near lava. Then you're unarmed. That is a *good* outcome and must not be patched out.

**Implementation warnings:**

- Cascades must be bounded (3 generations) and total energy must be conservative-or-lossy, never generative. Energy-generating loops are the #1 exploit vector in this design. Add an assertion in debug builds: total system energy after resolution ≤ energy before + injected.
- Resolution must be **order-independent**: gather all impulses for a tick, then apply. Otherwise multiplayer desyncs and hit-order exploits appear.
- Everything above runs in fixed-point (Q32.32). See §12.4.

### 4.4 The interaction matrix is the deliverable

Concretely, the design team's core artifact is not a document — it is a spreadsheet of ~40 materials × ~8 property axes, plus a tag-reaction table, tuned until the derived behaviours are interesting. Everything else in this document is scaffolding around that spreadsheet.

**Ship gate:** before any content work begins, the team must be able to demonstrate 20 distinct, useful, unanticipated tactical outcomes produced solely by the material table and the impulse resolver in a bare test arena.

---

## 5. World generation

### 5.1 Causal layering

The world is not generated as "terrain plus decoration." It is generated as a **causal chain**, each layer consuming the one below. This is what makes a procedural world feel explicable rather than arbitrary — the player can reason backwards from what they see to why it's there, which is P3 applied at world scale.

```
1. Tectonics      → plate field, uplift, fault lines            (continental, 100km)
2. Elevation      → heightfield from uplift + erosion passes    (regional, 1km)
3. Climate        → temperature from latitude+altitude,
                    moisture from prevailing wind + rain shadow (regional, 1km)
4. Hydrology      → flow accumulation → streams, rivers, lakes,
                    aquifers, erosion feedback into layer 2     (local, 64m)
5. Aether field   → 3D scalar field, anchored to fault lines
                    and deep water; the "magic weather"         (regional → local)
6. Lithology      → which materials formed where, from
                    material.formation constraints × layers 1–5 (local, 64m)
7. Flora          → species viability from climate + soil       (local, 8m)
8. Fauna          → ecology solve from flora + terrain (§8.2)   (local, continuous)
9. History        → settlement, conflict, ruin, and abandonment
                    simulated over N generations                (regional, one-shot)
10. Player deltas → everything anyone has ever changed          (sparse)
```

Each layer is a deterministic pure function of `(world_seed, coordinates)` — **except layer 10**. This is the entire persistence strategy and it is discussed in §5.3.

**Layer 5 (the aether field) is the design lever for making the world non-uniform in a way that matters.** It is a smooth 3D noise field with hard anchors (high at fault lines, deep water, and history-layer sites of catastrophe). It determines: which exotic materials can form, how much charge the environment holds, how expensive abilities are to cast locally, and which creatures can exist. Aether-high regions are the "deep water" of the map — better materials, worse odds. This is the primary source of P4.

**Layer 9 (history) is where narrative comes from.** Run a coarse agent simulation over the generated map for ~500 abstract years: settlements found near water and resources, grow, compete for scarce deposits, war, migrate, collapse. Then *bake the output as ruins, roads, borders, graves, and abandoned works.* The player never sees the simulation; they see its residue and can reconstruct it. This replaces the entire quest system. Budget: this runs once per region at first-touch, on the server, off the hot path, ~200ms per 16km² region.

### 5.2 Infinite world, finite meaning

Infinity is trivial to generate and hard to make matter. Three mandatory mechanisms:

1. **Gradients, not tiles.** Property fields (aether density, material rarity, ecological pressure) vary continuously with distance-from-origin *and* with local geography. Going 50km in any direction should feel like arriving somewhere, not like re-rolling.
2. **Non-renewable strata.** Certain deep material deposits do not regenerate. Once a region is mined out, it is mined out — the map has a memory and players compete over it. This is what makes territory real.
3. **Seeded uniqueness.** Roughly 1 in 200 regions contains an *anomaly*: a formation-condition outlier that produces a material with anti-correlated properties, or an aether well, or a history-layer catastrophe site. These are generated, not authored, but they are the map's landmarks and players will name and fight over them.

**Explicit design note:** do not add fast travel until §5.2 mechanisms are proven. Travel time is the mechanism that converts distance into value. If players teleport, the infinite world becomes a menu.

### 5.3 Persistence: deltas over generators

The hard problem in a persistent infinite world is storage. The solution:

> **World state = `generate(seed, coords)` + a sparse, expiring delta log.**

- The generated world is *free* — it is a function, stored nowhere.
- Only *differences* are stored: this tree was felled, this ore vein depleted by 40%, this structure was built, this corpse is here, this claim exists.
- Deltas are stored per-chunk as an append-only op list, compacted periodically.
- **Deltas expire.** Every delta has a decay policy: felled trees regrow (~14 real days), corpses decompose (~1 hour), terrain scars smooth (~7 days), ore veins refill partially (~30 days, capped below original), player-built structures decay unless maintained by an active claim (§9.2). When a chunk's delta list empties, the chunk is deleted from storage entirely and reverts to being a pure function.
- **Result:** storage scales with *player activity*, not with world size. An infinite world with 5,000 players costs roughly what 5,000 players' recent activity costs. This is the only reason the project is viable.

Budgets: hard cap 4KB of delta per 64m chunk; on overflow, oldest low-value deltas are compacted or dropped. Structures are stored as parameterized assemblies, not voxels.

### 5.4 Procedural materials

Hand-authored base materials (~40) define anchor points in property space. Runtime material generation fills the space:

- **Regional variants:** a base material sampled under specific `formation` conditions yields a variant with perturbed properties (±15%), a derived name, and derived appearance. "Quartz" from a high-aether region genuinely has higher `aether_capacity`, and the player can learn to seek it.
- **Alloys and compounds:** produced by the process system (§6.2). Properties interpolate non-linearly — the alloy curve should have local optima so that specific ratios are discoveries, not sliders.
- **Anomalies:** rare anti-correlated outliers (hard *and* tough, conductive *and* aether-permeable). These are the "legendary materials" of the game and they were never authored.

---

## 6. Items: form, material, process

### 6.1 There is no item database

An item is: **a form, made of materials, produced by a process, with a history.**

```jsonc
{
  "form": "blade_curved_single_edge",   // geometry template, ~60 of these total
  "assembly": [
    { "part": "blade",  "material": "hoarfrost_quartz", "volume": 0.4 },
    { "part": "guard",  "material": "cold_iron",        "volume": 0.1 },
    { "part": "grip",   "material": "boarhide",         "volume": 0.15 },
    { "part": "socket", "material": null, "contains": "aether_core:pale" }
  ],
  "process_quality": 0.72,               // from the crafting act, §6.2
  "integrity": [ /* per part */ ],
  "provenance": [ /* §6.4 */ ]
}
```

**All statistics are derived, none are stored.** The blade's reach, swing speed, and impulse profile are computed from form geometry + material density + volume. A quartz blade is light and fast and penetrates well and shatters when it meets something harder. Nobody balanced that; it fell out.

Derivation rules (all deterministic pure functions):

| Derived stat | From |
|---|---|
| Mass | Σ(volume × density) |
| Swing speed | wielder strength / mass, × form's leverage coefficient |
| Impulse profile | mass × velocity → kinetic; form's edge geometry → contact_area |
| Durability | material toughness × process_quality × part volume |
| Thermal behaviour | material thermal properties, directly |
| Ability affinity | Σ(aether_permeability × volume) of the assembly, and socket contents |

**Form count target:** ~60 forms total, covering weapons, tools, armour pieces, containers, and structural components. Forms are hand-authored geometry + attachment topology. This is the one place where hand-authored content is correct: forms are *rules about shape*, not content.

### 6.2 Crafting as process, not recipe

**No recipe list.** Crafting is the application of **processes** to **inputs**. A process is a data record describing a transformation with conditions:

| Process | Requires | Effect |
|---|---|---|
| Heat | sustained thermal input | raises temperature; drives phase change and reaction |
| Deform | kinetic impulse above material hardness, below fracture | shapes material toward a target form |
| Combine | two materials above respective melt points | alloy, ratio-dependent property interpolation |
| Quench | rapid thermal extraction | locks in a hardness/toughness tradeoff based on rate |
| Dissolve | solvent contact | separates compounds |
| Charge | sustained aether flux | raises stored charge; above capacity → transmutation |
| Bind | mechanical or adhesive | joins parts into an assembly |
| Grind | abrasive contact, abrasive.hardness > target.hardness | reduces volume, refines edge geometry |

The player does not select "craft sword." They heat ore until it melts, pour it into a blade form, quench it at a rate they control, grind an edge, and bind a grip. **Each step is the same simulation used everywhere else** — the forge fire is a `Thermal` source, the hammer blow is an `Impulse`. There is no crafting subsystem; there is the world, plus tools that let you apply it precisely.

`process_quality` derives from how well the player hit the process's optimal conditions (temperature windows, deformation rate, quench rate). Skill expression without a skill stat.

**Consequence to embrace:** players will craft things nobody designed, including things that are useless, and including things that are better than anything the team made. Both are correct outcomes.

### 6.3 Upgrading, wear, and repair

- Items accumulate `Integrity` damage from the same resolver as everything else. There is no separate durability system.
- **Repair** is re-application of processes: heat, deform, re-quench. Each repair cycle slightly degrades the material (work hardening → toughness loss) so items have a finite but long life. Nothing lasts forever; nothing is destroyed arbitrarily.
- **Upgrading** is replacing a part with a better material, or adding charge, or re-grinding geometry. There is no upgrade level. A "+5 sword" is a sword whose blade was replaced with better material and whose edge geometry was refined.
- **Sockets and cores:** aether cores harvested from creatures and anomalies can be bound into forms with socket topology, granting ability-graph nodes (§7). This is the main vector for "magic items" and it is entirely compositional.

### 6.4 Provenance: where notable items come from

Every item carries an append-only provenance chain: who made it, from material sourced where, what it has killed, how many times repaired, who has owned it. This is cheap (a few hundred bytes), fully emergent, and is the mechanism by which the community generates legendary items without the team authoring any.

Provenance is **queryable in-world** — an appraisal tool reads an item's history. Expect players to build reputation economies around this. Support it; do not systematize it further.

---

## 7. Abilities: composable effect graphs

### 7.1 No spell list

An ability is a small directed graph of nodes, assembled by the player. Node categories:

| Category | Examples | Notes |
|---|---|---|
| **Source** | self, wielded item, ambient field, target | Determines where the effect originates and what it costs |
| **Shape** | point, cone, ray, sphere, plane, arc, path | Geometry of application |
| **Delivery** | instant, projectile, beam, lobbed, attached, delayed, persistent-field | How the shape reaches the target |
| **Payload** | impulse composition (kinetic/thermal/charge/corrosive/aether), material emission, entity spawn, state transfer | *This is where it plugs into §4.3 — payloads are Impulses. Nothing else.* |
| **Trigger** | on cast, on impact, on threshold, on interval, on death, on material contact, on charge exceeded | Enables chaining and traps |
| **Modifier** | amplify, split, chain, delay, mirror, invert, home, pierce | Applied to downstream nodes |

An ability graph is capped (start: 4 nodes; max: ~9 via progression) and slotted into `Effectors`. Nodes are acquired as physical objects in the world — harvested from creatures, extracted from anomalies, purchased from other players. **Node acquisition is loot.**

Examples of things nobody implemented:

- `Source(self) → Shape(sphere) → Payload(thermal: -400)` = an area freeze. Combined with §4.3 step 3, enemies become brittle. Follow with a maul.
- `Source(item) → Delivery(lobbed) → Payload(emit: solvent) → Trigger(on material contact) → Payload(charge: 30)` = you threw water and then electrified it.
- `Trigger(on death) → Delivery(persistent-field) → Payload(corrosive)` = a corpse that dissolves whatever approaches it. Including you.

### 7.2 The cost model — how this stays balanced without a balance team

This is the section most systemic-sandbox projects skip and it is why they collapse into a single dominant strategy. **It is mandatory.**

Every node has a base cost. Cost of a graph:

```
cost = Σ(node_base × scale^α) × interaction_multiplier × context_modifier
```

Requirements on this formula, all of which are testable:

1. **Superlinear in magnitude.** `α > 1` (start at 1.4). Doubling a payload's magnitude must cost more than double. This is the single mechanism that prevents scaling exploits.
2. **Superlinear in node count.** A 9-node graph costs more than 9 × the average node. Complexity is powerful and must be priced.
3. **Interaction-aware.** If two nodes are known to combo (charge payload + solvent emission), the multiplier catches it. Maintained as a sparse table, populated by the fuzzer (below), not by hand.
4. **Context-modified.** Casting costs scale inversely with local aether density (§5.1 layer 5). Powerful abilities are cheap in dangerous places. This is a geography-into-combat coupling and it is deliberate.

**The combinatorial balance fuzzer.** Build this in Milestone 3, not later. It is a CI job that:

- enumerates/samples the ability graph space (millions of combinations),
- runs each in a headless deterministic arena against a standard target set,
- computes effect-per-cost,
- flags any combination more than 2σ above the mean as a **balance defect**,
- fails the build if the top 0.1% exceeds the median by more than 4×.

The fuzzer replaces manual balance passes and is the only way a combinatorial system stays sane. Assign an engineer to it permanently. The same harness runs against the crafting space (§6) and the material table (§4.2).

### 7.3 Progression without a skill tree

Four vectors, none of them a tree:

1. **Equipment** — the primary power curve. Better materials, better processes, better sockets.
2. **Ability nodes** — acquired as world objects; graph slot count grows slowly (4 → 9 over the full arc).
3. **Attunement** — a small number of permanent-ish, mutually exclusive body adaptations acquired by sustained exposure. Live in a cold high-aether region long enough and your body's material properties shift (higher thermal resistance, higher aether capacity, lower toughness). Attunements are **material property changes to the player's `Body`** — they run through the same resolver as everything else, so they have real, non-obvious downsides. Reversible, slowly.
4. **Knowledge** — the real curve (P6). Tracked implicitly; see §10.2.

Deliberately absent: XP, levels, stat points. A character's power is legible from what they carry and what they've become, not from a number.

---

## 8. Creatures and ecology

### 8.1 Creatures are entities, not enemies

A creature is a `Body` (assembly of parts with materials, same as an item), `Metabolism`, `Sensors`, `Locomotion`, `Effectors`, and `Agency`. **Creatures use the same ability system as players** (§7) and the same impulse resolution (§4.3).

Direct consequences, all desirable:

- Creature parts are made of materials, so they butcher into usable materials with real properties. Hide from a cold-region beast genuinely has thermal resistance.
- A creature with a chitin plate of high hardness/low toughness is defeated by blunt force, and the player can *see* this before engaging (P3).
- Creatures can pick up, use, and be killed by items. A wolf can be set on fire by a burning tree. Nobody wrote that.
- A creature's abilities are graphs, so they can be harvested as nodes.

**Bodies are procedurally assembled** from a body-plan grammar: segments, limb attachment points, sensor placements, effector mounts, material assignment by region. ~12 hand-authored body plans × material/scale/effector variation = the entire bestiary. Appearance derives from materials (§10.1), so a creature *looks like what it is made of*.

### 8.2 Ecology and the two-LOD population model

Creatures are not spawners. There is a population simulation.

- Each region carries a **population vector** per species with birth, death, predation, and migration rates driven by flora density, terrain, aether level, and competition. Standard Lotka-Volterra-ish coupled equations, stepped coarsely (once per game hour).
- **Near a player (< 512m): individuals are instantiated**, drawn from the aggregate, with individual `Agency`. Kills decrement the aggregate.
- **Far from any player: only the aggregate exists**, stepped statistically. Cost per region: negligible.
- **Handoff must be consistent.** When a player enters, instantiation samples from the aggregate; when they leave, individuals are folded back in. This is the mechanism that makes an infinite living world affordable and it must be built correctly in Milestone 4 — retrofitting it is expensive.

**Player pressure is real.** Overhunt a region and the population crashes, its predators starve or migrate, the flora they suppressed overgrows, and the region's material yield changes. This resolves in days-to-weeks of real time and it is the strongest available source of P4 and P5. Do not add artificial floors that prevent extinction — add long migration-driven recovery instead.

### 8.3 Agency: utility AI, not behaviour trees

Behaviour trees encode designer intent and therefore prevent emergence. Use **utility AI**:

- Each agent has a **needs vector**: energy, safety, temperature, territory, reproduction, and (for social species) group cohesion.
- Each tick, the agent scores available actions against current needs and situation, and picks stochastically from the top candidates (softmax, not argmax — determinism preserved via seeded PRNG per agent).
- Actions are generic: approach, flee, attack, feed, rest, patrol, hoard, follow, call. Their *parameters* come from the creature's components.
- **Sensor modality matters.** A creature that senses by heat can be evaded by cooling yourself. A creature that senses by aether can be evaded by discharging. This is the primary stealth system and it required no stealth system.

Agents keep a small memory (last N notable events, decaying) so they can learn locally: a wolf pack that lost members to a player retreats from that player's scent profile. Cap memory at 32 entries per agent; it is not machine learning, it is a decaying event list, and that is sufficient.

---

## 9. Society, ownership, and conflict

### 9.1 No guild system

Groups are not a feature. Grouping falls out of two primitives: **shared claims** and **transferable keys**. A "guild" is a set of players on a claim's permission list. A "raid" is people who agreed to walk in the same direction. Do not build social systems; build the primitives and let players build the social systems. Provide good communication tools (proximity voice/text, a written-note item that is a physical object, map annotation) and nothing else.

### 9.2 Claims: how players own space

A claim is a physical, destructible marker that:

- consumes material upkeep continuously (this is the primary economic sink),
- suspends delta decay (§5.3) within its radius — **this is the actual mechanical purpose**: a claim is what stops your base from rotting back into wilderness,
- carries a permission set for build/harvest/access,
- is visible and appraisable from outside.

Claim radius scales with upkeep cost superlinearly, so empires are expensive and small holdings are cheap. There is no claim limit; there is an economics of claims.

### 9.3 Conflict is geographic, not a toggle

PvP rules are not a menu setting. They are a property of the aether field (§5.1 layer 5):

| Aether density | Materials | Conflict rules |
|---|---|---|
| Low (< 0.3) | Common | No unconsented damage between players. Claims fully enforced. |
| Mid (0.3–0.7) | Good | Unconsented damage allowed; on death, drop carried materials only, keep equipped items. |
| High (> 0.7) | Anomalous, best in game | Full drop. Claims decay rapidly regardless of upkeep. |

This resolves the sandbox PvP problem correctly: risk and reward are the same axis, the choice is made by walking, and players who want no conflict have an entire (poorer) world available. It also gives §5.2's gradients teeth.

### 9.4 Economy

- **No fiat currency.** Materials are money. Expect a high-density, universally useful material to emerge as a de facto currency; do not prevent this, and do not designate it.
- **Sinks** (mandatory, or the economy inflates to uselessness): claim upkeep, item wear and repair degradation, ability aether cost, food/metabolism, process input losses (smelting is lossy).
- **Faucets:** regenerating deposits, ecology yield, anomaly discovery.
- Trade is physical: goods change hands in the world, or through player-built trade posts (a claim with a storage assembly and a permission set). No global auction house — it collapses geography, which is the game's main asset.

Ship a **read-only economy telemetry API** so players build their own market trackers. They will do this whether or not it is supported; supporting it costs almost nothing and generates community infrastructure.

---

## 10. Legibility and discovery

Restating P3, because this is where systemic games actually die: **a system the player cannot read is a random number generator with extra steps.**

### 10.1 Appearance is derived from properties

One shader family, applied to every entity in the game, driving surface parameters from material properties:

| Visual channel | Driven by |
|---|---|
| Base hue | material class + `hue_bias` |
| Roughness | inverse of `hardness` (hard things polish) |
| Metallic | `conductivity` |
| Emissive intensity/colour | current `Thermal` (blackbody-ish ramp) |
| Surface arc/shimmer VFX | current `Charge` relative to `discharge_threshold` |
| Translucency / internal scatter | `aether_permeability` |
| Surface wear detail | `Integrity` |

This is not a cosmetic decision. It means a player who has never seen a material can *read four of its properties off its surface at a glance*, and can see at a glance that the thing they just hit is now dangerously charged. It also means procedurally generated materials and creatures look coherent for free, with no art pass. **Non-negotiable.**

### 10.2 Instruments and the Codex

- **The Lens** — a craftable instrument that reads numeric properties off a target. Tiered: a crude lens reads 2 properties with ±30% error; a refined high-aether lens reads all of them exactly. This makes *information* a crafted good and a trade good.
- **The Codex** — an automatic, personal record of what *this player has personally observed*: materials encountered with the properties they measured, reactions they witnessed, creature behaviours they saw, locations of deposits. It is not a wiki; it does not contain unobserved facts. This is P6 made visible: a veteran's Codex is their actual character sheet.
- **The Readout** — after any significant impulse resolution, a compact, optional post-hit panel: energy transferred, what deformed, what fractured, what reacted, what changed phase. This is the hypothesis-testing loop. Without it, combat is opaque and players will conclude the game is random. Make it toggleable, default on, and make it fast to read.

### 10.3 What not to do

- Do not display derived DPS, "item level," or a power score. Display physical properties. The reasoning is the gameplay.
- Do not add tutorial pop-ups explaining interactions. Every interaction explained is an interaction not discovered. Teach the *instruments*, not the *facts*.
- Do not hide the numbers behind flavour text. This game's audience wants the numbers.

---

## 11. Multiplayer architecture

### 11.1 Topology

- **Server-authoritative.** The client is a renderer and an input device. It runs a *copy* of the simulation for prediction only.
- **Region shards.** Each shard authoritatively owns a 2km × 2km world area and everything in it. Target 32–64 concurrent players per shard; shards spin up on demand and hibernate when empty (persisting deltas).
- **Seamless handoff.** 200m overlap band at shard boundaries; entities crossing are migrated with a two-phase handoff. Players in the band receive updates from both shards.
- **Interest management.** Per-player subscription to a 512m radius plus a coarse 4km horizon feed (aggregate, low-frequency: other players' rough positions, weather, large structures).

### 11.2 Netcode

| Parameter | Value |
|---|---|
| Server sim tick | 20 Hz (50ms) |
| Snapshot rate | 20 Hz, delta-compressed against last acked |
| Client render | uncapped, decoupled |
| Interpolation buffer | 100 ms for remote entities |
| Client prediction | **own locomotion only**, with reconciliation |
| Lag compensation | 200 ms rewind window for hit resolution |
| Position quantization | 1 cm, 16-bit per axis relative to chunk |
| Bandwidth target | ≤ 40 kB/s steady, ≤ 150 kB/s peak, per player |

Deliberately *not* doing rollback/GGPO-style netcode. This is a co-op-leaning ARPG, not a fighting game; server authority with lag compensation is correct, cheaper, and far more resistant to the cheating vectors a sandbox invites.

**Anti-cheat posture:** the client simulates for prediction but is never trusted. Impulse resolution, crafting, loot, and ecology run server-side only. Assume the client is fully compromised — it is a browser tab. Rate-limit and sanity-check all input. Do not send data outside the player's interest radius (this alone kills map hacks).

### 11.3 Backend recommendation: SpacetimeDB

Recommended, with justification, because the fit is unusually tight:

- Server logic is **Rust compiled to WASM** — the same simulation crate the client runs for prediction. One sim, two hosts. This largely solves the determinism problem (§12.4).
- State *is* the database; there is no ORM layer, no cache invalidation, no separate persistence path. The delta log (§5.3) is just tables.
- Row-level subscriptions map directly onto interest management.
- Transactional per-tick semantics give clean atomicity for impulse resolution.

**Risks to accept knowingly:** smaller ecosystem, less operational precedent at scale, and shard-level scaling behaviour must be load-tested early (Milestone 5, not later). **Fallback:** custom Rust server over WebTransport with Postgres for deltas and Redis for hot state — costs roughly 6–10 engineer-weeks more and loses the shared-sim elegance.

---

## 12. Technical architecture

### 12.1 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Simulation core | **Rust → WASM** | One codebase, client + server. Deterministic. Fast. |
| Rendering | **Babylon.js 8.x, WebGPU with WebGL2 fallback** | Mature WebGPU path, node materials fit property-derived shading (§10.1), thin instances, inspector saves weeks of tooling. Three.js is a defensible alternative if the team has deep graphics experience — but the renderer must never leak into the sim layer, so the choice stays reversible. |
| Terrain meshing | Rust → WASM in a worker pool (4 workers) | Surface Nets over a density field; keep off the main thread. |
| Networking | WebSocket (binary) now; WebTransport when Safari support justifies it | |
| Backend | SpacetimeDB (§11.3) | |
| Asset delivery | KTX2/Basis textures, Draco/meshopt geometry, CDN, aggressive caching | |
| Build | Vite, wasm-pack, Cargo workspace | |

**Hard requirement:** the simulation crate must have zero dependencies on rendering, networking, or platform APIs. It takes state + inputs, returns state + events. Everything else is a host.

### 12.2 Performance budgets

Treat these as build-gate assertions, not aspirations. Reference hardware: 2021 laptop, integrated Iris Xe class GPU, Chrome, 1080p.

| Budget | Target | Floor |
|---|---|---|
| Frame time | 16.6 ms | 33 ms |
| Initial download | ≤ 20 MB | 35 MB |
| Time to first interactive frame | ≤ 8 s | 15 s |
| JS heap | ≤ 1.2 GB | 1.6 GB |
| GPU memory | ≤ 900 MB | 1.2 GB |
| Draw calls / frame | ≤ 1,500 | 2,500 |
| Visible simulated entities | 250 | 400 |
| Entities per shard | 2,000 | 3,500 |
| Sim step (server, full shard) | ≤ 12 ms | 25 ms |

**Threading:** render on the main thread; simulation (prediction) in a dedicated worker; meshing in a worker pool; asset decode in workers. Use `SharedArrayBuffer` for zero-copy state transfer — **note this requires COOP/COEP headers on all served assets**, which constrains third-party embeds and must be settled in Milestone 0, not discovered in Milestone 5.

### 12.3 Streaming and LOD

| Ring | Radius | Content |
|---|---|---|
| Active | 0–128 m | Full simulation, full mesh detail, individual creatures |
| Near | 128–512 m | Simulation at reduced tick, reduced mesh, individual creatures |
| Far | 512 m–4 km | No entity simulation (aggregate only), heavily decimated terrain, impostors |
| Horizon | 4–20 km | Heightfield-only silhouette, single draw call |

Chunk size 64 m × 64 m × full height column. Generation is a pure function, so chunks are never stored, only cached — evict aggressively under memory pressure and regenerate. Prefetch along the movement vector.

### 12.4 Determinism (read this carefully)

Client prediction, server authority, and replay debugging all require bit-identical simulation. The failure mode is subtle desync that appears only under load and takes weeks to diagnose. Mandatory rules:

1. **Fixed-point arithmetic (Q32.32) for all simulation math.** Not floats. Floats are used only for rendering.
2. **No transcendental functions from the platform.** `sin`, `cos`, `exp`, `sqrt`, `pow` are *not* specified identically across WASM runtimes and libm versions. Implement them in-crate as fixed-point polynomial or table approximations. This is the single most common source of cross-platform desync and it must be closed at Milestone 0.
3. **No iteration over hash maps** in simulation code. Use sorted, stable-ordered containers everywhere.
4. **Seeded PRNG per entity**, advanced deterministically. Never a global RNG.
5. **Impulse resolution is gather-then-apply**, order-independent within a tick (§4.3).
6. **CI desync test:** run 10,000 ticks of a seeded scenario on server and client builds, assert identical state hashes. This test runs on every commit. If it goes red, nothing else ships.

### 12.5 Data pipeline and modding

Every non-code definition is a schema-validated data file: materials, forms, processes, ability nodes, body plans, worldgen layer parameters, reaction tags, cost model coefficients.

- Schemas in JSON Schema; validation in CI; hot reload in development.
- **Design the data format as if it were a public modding API from day one**, because it should become one. A systems game with a modding community gets content contribution for free, and this design's content model is unusually mod-friendly — a mod is a materials file.
- Server-side mod support is a post-launch concern, but **do not make decisions that foreclose it.** Concretely: no compiled-in content, no content identifiers that are enum discriminants, no assumptions about a fixed material count.

---

## 13. Balance methodology and telemetry

Because there is no content list, there is nothing to balance by hand. Balance is a *process*, owned permanently by one engineer plus one designer.

**Automated (runs in CI):**

- Ability graph fuzzer (§7.2) — flags effect-per-cost outliers.
- Crafting space fuzzer — enumerates form × material × process combinations, flags derived-stat outliers.
- Material property fuzzer — searches for degenerate reaction loops and energy-generating cascades.
- Determinism test (§12.4).

**Observed (from live telemetry):**

- Usage concentration: if >15% of players converge on the same ability graph shape, the cost model has a defect. Fix the *formula*, never the specific combination.
- Material demand curves: reveals which properties are actually valuable, which reveals where the property space is badly shaped.
- Region abandonment rate: measures whether P4 is real.
- Time-to-first-unanticipated-solution for new players: measures whether P2 is real.
- Codex growth rate vs. character power: measures whether P6 is real.

**Balance philosophy:** when something is overpowered, the correct fix is almost always to adjust a *coefficient in a derivation* or a *property in the material table* — never to add a special case. Adding a special case is how this design dies. Enforce this in code review.

---

## 14. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Emergence reads as noise.** Systems interact, but the result is incoherent rather than interesting. | Critical | §4.4 ship gate. Do not proceed past M1 until 20 unanticipated tactical outcomes are demonstrable. If the material table can't produce them, the property axes are wrong — fix them before building anything else. |
| R2 | **Degenerate dominant strategy.** One ability graph or crafting recipe invalidates the space. | Critical | Cost model with superlinear exponents (§7.2) + fuzzer as a build gate from M3. |
| R3 | **Infinite world is uniformly boring.** | High | §5.2 gradients, non-renewables, anomalies. Test P4 directly at M4. |
| R4 | **Browser performance ceiling.** Ambition exceeds what a tab can do. | High | Budgets in §12.2 as build-gate assertions from M0. Cut scope against budgets, not schedule. |
| R5 | **Determinism drift.** Subtle client/server divergence. | High | §12.4, all six rules, enforced from M0. Retrofitting fixed-point is a rewrite. |
| R6 | **Scope explosion.** Systems games are unbounded; "just one more system" is always tempting. | Critical | Non-goals in §3 are contractual. New systems require removing an existing one, or explicit sign-off that the interaction matrix grows meaningfully. |
| R7 | **No onboarding path.** Players bounce in the first 10 minutes because nothing tells them what to do. | High | §10 instruments. Also: the first 200 m of a new character's world is generated with elevated legibility (high material contrast, obvious causal demonstrations) — a tutorial made of terrain, not text. |
| R8 | **Griefing collapses the population.** | Medium | §9.3 geographic conflict rules. Low-aether world is genuinely safe and genuinely playable. |
| R9 | **SpacetimeDB scaling surprises.** | Medium | Load-test at 500 concurrent by M5. Keep the sim crate host-agnostic so the fallback (§11.3) stays cheap. |
| R10 | **Ecology sim produces extinction cascades or population explosions.** | Medium | Bounded rate equations, migration-driven recovery, telemetry alarms on population derivatives. Do not add hard floors; add slow recovery. |
| R11 | **Art coherence.** Procedurally composed creatures and items look like assembled garbage. | Medium | §10.1 property-derived shading gives coherence for free. Body-plan grammar must be authored by an artist, not an engineer. Budget a dedicated technical artist from M2. |

---

## 15. Roadmap

Milestones are gated on **acceptance criteria**, not dates. Durations assume the team in §16.

### M0 — Foundations (6–8 weeks)

Deterministic fixed-point sim core in Rust/WASM, running in a browser worker. Flat test arena. Three materials. Impulse resolver. No rendering beyond debug primitives.

> **Accept when:** 10,000-tick determinism test passes across client and server builds; transcendental functions are in-crate; COOP/COEP header strategy is settled; a hot object and a cold object exchange heat correctly and the numbers are identical on both hosts.

### M1 — The substrate proves itself (8–10 weeks)

40 hand-authored materials. Full impulse resolution including fracture, phase change, charge discharge, and tag reactions. Basic forms and melee. Single-player, one small hand-made arena. Readout panel (§10.2).

> **Accept when:** §4.4 ship gate passes — 20 distinct, useful, unanticipated tactical outcomes, demonstrated to stakeholders, none of which were designed. **If this fails, stop and fix the material table. Do not proceed.**

### M2 — World (10–12 weeks)

Worldgen layers 1–7. Chunk streaming, LOD rings, meshing worker pool. Property-derived shading (§10.1). Delta persistence (§5.3), single-player local.

> **Accept when:** a player can walk 20 km continuously at ≥ 30 fps within §12.2 budgets; felled trees regrow; a mined region stays mined; storage per player-hour is measured and within projection.

### M3 — Fabrication and abilities (10–12 weeks)

Process-based crafting. Ability graph system. Cost model. **Balance fuzzer in CI.** Sockets and cores.

> **Accept when:** fuzzer runs on every commit; top 0.1% of the ability space is within 4× of median effect-per-cost; a designer has built a working weapon and a working ability without an engineer.

### M4 — Life (10–12 weeks)

Body-plan grammar, utility AI, two-LOD ecology, sensor modalities. Layer 8.

> **Accept when:** overhunting a region measurably crashes its population and its predators respond; a creature is killed by an environmental hazard the player set up; population aggregate ↔ individual handoff is consistent across 100 entry/exit cycles.

### M5 — Multiplayer (12–14 weeks)

Shards, handoff, interest management, netcode, claims, conflict zones, provenance. Layer 9 history generation.

> **Accept when:** 64 players on one shard within bandwidth and tick budgets; 500 concurrent across shards in load test; a player can identify from world state alone that another player was present and infer what they did (P5).

### M6 — Playable loop and closed alpha (10–12 weeks)

Codex, Lens tiers, economy sinks, onboarding region, trade posts, telemetry pipeline, economy API.

> **Accept when:** median new-player session ≥ 40 minutes; day-7 retention measured; all six pillar tests in §2 pass under observation.

**Total to closed alpha: roughly 16–20 months.** Treat any estimate below 14 months as a scoping error, and expect M1 to overrun — that milestone is where the game either exists or doesn't.

---

## 16. Team

Minimum viable composition:

| Role | Count | Notes |
|---|---|---|
| Simulation engineer (Rust) | 2 | Owns the sim crate, determinism, impulse resolution |
| Graphics engineer | 1 | Rendering, meshing, LOD, property-derived shading |
| Backend/network engineer | 1 | Shards, netcode, persistence, SpacetimeDB |
| Tools/pipeline engineer | 1 | Data schemas, hot reload, fuzzers, telemetry — **this role is not optional in a data-driven design** |
| Systems designer | 2 | Material table, cost model, worldgen tuning. The material table is a full-time job. |
| Technical artist | 1 | Body-plan grammar, form geometry, shader authoring |
| Generalist / QA | 1 | Determinism testing, playtest coordination |

**9 people.** Fewer is possible but the tools engineer and one systems designer are load-bearing; cutting them converts this design into a normal game with extra steps.

---

## 17. Open questions the team must resolve

Stated honestly rather than papered over. Each needs a decision before the milestone noted.

1. **Camera and control scheme.** ARPG-derived is stated, but isometric-with-click, isometric-with-WASD, and third-person-over-shoulder have very different implications for the readability of 3D material states (a charged surface behind you is not information). **Resolve in M1** with prototypes; it affects meshing, LOD, and combat feel.
2. **Time scale.** How fast do days pass, how fast do ecologies recover, how fast do deltas decay? These must be consistent with each other and with a 30–90 minute session. **Resolve in M2.**
3. **Death penalty outside high-aether zones.** §9.3 covers item loss, but not time loss or attunement loss. **Resolve in M5.**
4. **How much of layer 9 (history) is legible?** Ruins that can't be interpreted are set dressing. There may need to be a readable artifact system (inscriptions, records) that is itself generated. **Resolve in M5.**
5. **Body-plan grammar expressiveness vs. animation cost.** Fully procedural bodies need procedural animation, which is expensive and often looks bad. Likely answer: constrain the grammar to a fixed set of skeletal topologies with variable proportions and materials. **Resolve in M4**, and expect this to be the biggest compromise in the project.
6. **Whether the aether field is enough of a hook.** It carries an enormous amount of weight in this design — material rarity, ability cost, PvP rules, creature distribution. If playtesting shows players don't read it as a coherent thing, it needs a stronger identity. **Watch from M2 onward.**
7. **Renderer.** Babylon is recommended (§12.1) but the call is close. Make it in M0 and keep the sim crate clean so it stays reversible.

---

## Appendix A — Minimum system interaction matrix

Every cell must be non-empty at M4. If a cell is empty, the two systems are not really interacting and one of them is decoration.

|  | Materials | Worldgen | Items | Abilities | Creatures | Players |
|---|---|---|---|---|---|---|
| **Materials** | reactions, alloys | formation conditions | composition | payload reagents | body composition | attunement |
| **Worldgen** | where matter is | erosion feedback | resource access | aether cost field | habitat, ecology | claims, travel |
| **Items** | wear, phase change | terrain modification | assembly, repair | sockets, affinity | butchering yield | provenance, trade |
| **Abilities** | reagent emission | field disturbance | item-sourced casts | node chaining | harvested nodes | attunement cost |
| **Creatures** | consume, produce | population ↔ flora | use and drop items | own ability graphs | predation | hunting pressure |
| **Players** | discovery, refining | delta persistence | crafting, ownership | graph authoring | pressure, taming | claims, conflict, trade |

---

*End of document. Version 1.0.*
