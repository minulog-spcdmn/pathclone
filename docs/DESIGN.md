# Untitled Systemic Sandbox ARPG — Design Document v1.0

**Status:** Pre-production specification. Intended to be executable by a dev team without further design intervention.
**Target:** Browser-playable (WebGPU/WebGL2), persistent shared world, ARPG-derived action layer, systems-first content model.

---

## 0. Read this first: the emergence thesis

There is a failure mode this document exists to prevent.

The intuitive route to "emergent gameplay" is **maximal proceduralism** — generate everything, hardcode nothing, and hope interesting behaviour falls out. It doesn't. Maximal proceduralism produces *noise*: a combinatorially enormous space in which every point is mechanically equivalent to every other point. Players correctly read this as "nothing here matters" and leave.

Emergence is produced by the opposite thing: **a small number of tightly constrained rules with dense mutual interaction.** Chess has six piece types. Dwarf Fortress has maybe two dozen real systems. Noita has one (materials) plus a physics solver. The combinatorial explosion should happen in the *interaction matrix*, not in the *rule count*.

### 0.1 Complexity is not emergence

The second failure mode, and the one that kills projects that survive the first: a team correctly rejects maximal proceduralism, builds many carefully-designed interacting systems, and still produces something inert. Interaction count is not the variable. The variable is **shared scarcity**.

Two systems that interact but draw on separate resources are not really coupled — they are two games running in the same window. Emergence requires that acting in one system *costs you something in another*. That is what turns a mechanic into a decision, and a decision into a plan, and a plan into a story the player tells afterwards.

The necessary and sufficient conditions, stated so the team can audit against them:

1. **Shared scarce resources.** Every system competes for the same small set of scarce things. If a new system arrives with its own private currency, it adds complexity and zero emergence. Cut it or couple it.
2. **Irreversibility.** A choice that can be undone at will is not a choice. Some consequences must persist — in the world (§7.3), in the item (§8.3), in the body (§9.3).
3. **Causal chains of depth ≥ 3 that the player can plan.** `A → B` is a mechanic. `A → B → C → D`, anticipated in advance, is emergence. If your systems only ever produce two-step chains, you have a physics toy.
4. **Agents with independent goals.** The world must be pursuing its own objectives whether or not the player is watching, or "emergence" is just the player playing with themselves.
5. **Pressure.** Without something forcing action, an unconstrained sandbox resolves to the player doing nothing. See §4.

**The resource spine.** There are exactly four scarce things in this game. Every system must draw on at least two of them, and this is a design review gate:

| Resource | Scarce because |
|---|---|
| **Time** | real-world session length; travel distance; process duration; regeneration rates |
| **Matter** | finite deposits, lossy processes, wear, non-renewable strata |
| **Aether** | ability cost, material formation, and danger are the same axis |
| **Territory** | claims cost upkeep, deposits are located, presence is required |

If a proposed feature does not spend at least two of these, it is decoration. This rule is what keeps the system count honest, and it is a stronger constraint than the non-goals list.

### 0.2 Autonomy is not the absence of direction

Player autonomy is often mistaken for "the game tells you nothing." That produces paralysis, not freedom. Autonomy is **many legible goals and no mandated one**. The player must be able to see, at any moment, five things worth doing and be free to want none of them. A game that offers zero visible goals has not granted autonomy; it has outsourced design work to the player.

§4 is the section that makes this concrete, and it is the section this document originally lacked.

---

So the operating constraint for this project is:

> **Few systems. Total interaction. Zero exceptions.**
>
> Every system must interact with every other system through a shared substrate. If a feature requires a special case to work, the feature is wrong, not the substrate.

"As little hardcoded stuff as possible" is therefore reinterpreted, and the team should hold this reinterpretation:

- **Hardcoded *rules*: as few as possible, and hand-authored with extreme care.** The rules are the game. They get design attention, iteration, and tuning.
- **Hardcoded *content*: zero.** No item list, no enemy list, no spell list, no quest list, no biome list. Content is what falls out of rules applied to procedurally generated inputs.

The second constraint below is equally load-bearing and is the one most often dropped:

> **Emergence the player cannot predict is indistinguishable from a random number generator.**

A systemic game only reads as systemic if the player can form a hypothesis, test it, and be right. Legibility is not polish applied at the end; it is a hard requirement on every system in this document (see §12). If a system cannot be made legible, cut it.

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

### P7 — The world acts on you
The world pursues its own processes and arrives at the player's door. The player is never the only source of events.

> **Test:** A player who logs in with no plan is given a reason to act within 3 minutes, by the world, without a quest.

### P6 — Knowledge is the progression curve
Character power grows slowly and mostly through equipment. What actually grows is what the player *knows*: which materials do what, where they occur, which effect combinations are efficient, how creatures behave.

> **Test:** A veteran player on a fresh character outperforms a novice on a maxed character in an unfamiliar region.

---

## 3. Non-goals (explicit anti-requirements)

These are listed so that the team can refuse them under pressure. Adding any of these is a design regression, not a feature request.

| Non-goal | Why |
|---|---|
| Authored quest content, NPC dialogue trees, story missions | Contradicts P2. Motivation comes from §4 — the Surge, gap-driven goals, and the premise baked into terrain. **Note: "no quests" is not "no direction." See §0.2.** |
| A named item list ("Blade of Whatever") | Contradicts §1. Notable items arise from provenance and history, not authorship. |
| Class system / skill tree | Contradicts P6. Fixed archetypes collapse the combination space. Note: the *starter presets* in §12.7 are not classes — they are ordinary data, editable from hour one, and deliberately inefficient. |
| Global level scaling, or enemy level numbers | Destroys P4. Regional danger must come from what actually lives there. |
| Physical accuracy (real SI units, rigid-body everything) | Simulation is *physically inspired*, one abstraction above reality, tuned for legibility and determinism. Accuracy is a cost with no player-facing benefit. |
| Voxel terrain destruction at fine granularity | Kills the persistence model (§8.3) and the bandwidth budget. Coarse, bounded, expiring terrain deltas only. |
| Full-loot open PvP everywhere | Sandboxes with unbounded griefing self-select into a tiny hostile population. See §11.3. |
| Native client, launcher, install | Browser is a hard platform constraint and shapes every budget in §14. |

---

## 4. Motivation: why the player does anything

This section is the answer to *"why would I do that?"* and it takes precedence over every system in §6–§13. A perfect simulation nobody has a reason to touch is a tech demo.

### 4.1 What was removed, and what has to replace it

An ARPG runs on five engines. This design deletes or weakens all five, so each needs an explicit replacement:

| ARPG engine | What this design did to it | Replacement |
|---|---|---|
| Loot dopamine | Replaced discrete drops with "materials and processes" | §4.5 — drops stay discrete, surprising, and instantly readable |
| Build fantasy | Deleted the skill tree, where aspiration lives | §4.6 — aspiration through *visible unowned* options |
| Power escalation | Deleted levels and level scaling | §4.7 — escalation is geographic and felt, not numeric |
| Authored narrative | Deleted entirely | §4.3 — premise expressed as mechanic, discovered through ruins |
| External pressure | Nothing ever came to the player | §4.4 — the Surge |

**The last row is the most important and was the largest hole in v1.0.** In v1.0 the world only did things when the player travelled to it. That means 100% of motivation had to be self-generated, which describes the Dwarf Fortress audience and almost nobody else.

### 4.2 Five things worth doing, always

Design target, checkable at any moment in any session: a player who opens the map can see at least five concrete, spatially located, personally relevant things to do, none of which are mandatory. Sources, in rough order of how often they should fire:

1. Something is threatening a place you care about (§4.4).
2. A gap in your Codex points at a specific place (§4.8).
3. A material you need for a thing you already want to build is sourced *there*.
4. Another player wants something you can get, or has something you want (§13).
5. Something you have never seen is visible on the horizon (anomalies, §7.2).

If a playtest shows a player idling with no perceived options, that is a bug in this section, not a player failure.

### 4.3 The premise

Not a plot. A premise, expressed entirely as mechanics, discoverable entirely through play:

> **Everything worth having is made of the thing that keeps the world stable, and someone already did this once.**

Aether is what makes exotic materials form, makes abilities cheap, and makes the best regions dangerous. It is also the thing whose removal destabilises a region. Layer 9 of worldgen (§7.1) simulates a prior civilisation that extracted at scale and collapsed — and it bakes that collapse into the map as ruins, drained strata, and permanently destabilised zones.

This is the entire story. It is not told; it is *inferable* from terrain, and it pre-teaches the mechanic in §4.4 before the player ever triggers it. Players who read the world correctly will predict the Surge before it happens to them. That is a far better story delivery mechanism than dialogue, and it costs one worldgen layer that was already in the budget.

**Tone brief for art and audio:** cold, mineral, post-industrial, quiet. The world is not evil; it is indifferent and depleted, with something still moving in it. Aether-high regions are *beautiful and wrong*. Avoid heroic fantasy framing entirely — nobody here is chosen.

### 4.4 The Surge: pressure that the players create themselves

*(Name is a placeholder.)* The motivation engine. It emerges from the extraction economy that already exists, and it requires no authored content.

**Mechanic:**

1. Every extraction of aether-bearing material raises a hidden `instability` scalar for that region. Instability decays slowly (~days).
2. Above threshold T1, the local aether field destabilises: **local aether density rises.** Materials improve, abilities get cheaper, and hostile density rises. A destabilised region is a *frontier*, not merely a problem — this is essential, or the whole system reads as a punishment for playing.
3. Above threshold T2, instability propagates along the aether gradient — preferentially **downhill, into settled low-aether land.**
4. Propagated instability generates incursion: creatures whose body materials formed under the elevated field migrate outward. These are ordinary creatures under §10, with ordinary generated bodies. There is no raid code, no boss script, no spawn director.
5. Players may **defend** (fight it at their claims), **suppress** (return aether-bearing matter to the strata — expensive), or **abandon**.

**The critical number:** suppression costs roughly **1.3× the value extracted**. Extraction is individually profitable and collectively negative. This is a deliberate tragedy of the commons and it is the single most productive thing in this document, because it generates:

- a reason to log in (something you built is threatened),
- a reason to cooperate (suppression is unaffordable alone),
- a reason to fight over territory (who gets to extract near whom),
- an economy sink that scales with economy size,
- politics, which no one has to write.

**The griefing hole, and how it is closed.** As stated above, the Surge is an optimal griefing tool requiring no PvP flag and no combat: a transient player drains a region to maximum instability, triggers incursion, and leaves settled players to pay a bill 1.3× the profit that player just walked off with. This must be closed structurally, and *not* by penalising unclaimed extraction — wandering prospectors are the exploration loop, and taxing them would gut §4.

Four mechanisms, in order of importance:

1. **Front-load the consequence onto the extractor.** Local danger rises *immediately and steeply* with local instability, while propagation to neighbours is slow and heavily attenuated. The person doing the extracting eats the first-order risk while they are still standing there. Walking away does not dodge it, because there is nothing to walk away from yet — the cost was concurrent.
2. **Defence must be cheaper than suppression.** The 1.3× ratio is the cost of *restoring* a region to baseline. Merely surviving an incursion is a fraction of that. Settled players are never forced to pay a griefer's full bill to keep living where they live; they choose between cheap tolerance and expensive restoration.
3. **Attribution, not prevention.** Aether-bearing material carries provenance (§8.4) recording where it was drawn. Extraction near a claim is logged to that claim's records and is visible to its holders. The response is social — reputation, denial of trade, bounties, escalation — which is the sandbox-native answer and generates content rather than suppressing behaviour.
4. **Claims absorb, and permission gates.** Extraction inside a claim is already permission-gated (§11.2). Propagation crossing into a claimed region arrives attenuated, with claim upkeep absorbing part of it — so investment in a place buys real resilience.

**Explicit warning to the team:** this is the mechanic most likely to be exploited in ways not anticipated here. It must be in a closed alpha with adversarial players by M4.5, and the team should assume the first tuning is wrong.

**Guardrails:**
- Regions with no nearby extraction stay genuinely stable indefinitely. Players who want to be left alone can be left alone; they simply live somewhere poorer.
- Incursion intensity scales with local claim density, so a solo player's homestead faces a solo player's problem.
- Instability is **visible before it is dangerous** — sky colour, aether shimmer, creature behaviour changes, migration precedes incursion by hours.
- Never fully resettable. A region suppressed many times retains a floor. The map accumulates history, per §0.1 condition 2.

### 4.5 Restoring the loot loop

Materials-and-processes is a correct content model and an *awful* reward schedule. Procedural generation does not remove the need for the moment where something drops and you immediately want it. Requirements:

- **Drops are discrete objects, not resource counts.** "Aether core, pale, drawn from a plated crawler" is a thing. "+12 ore" is not.
- **Instantly evaluable.** Badges (§12.5) do the work a rarity colour does in a normal ARPG — a drop reads in under a second without opening anything. This is why §12.5 is load-bearing for *fun*, not just accessibility.
- **Cadence, tuned as a hard target:** something worth stopping for every ~90 s of combat; something that changes a decision every ~20 min; something that changes a plan every ~3 h.
- **Three drop classes:** material samples (property outliers from the local formation roll), ability nodes (§9.1), and aether cores (anomalous, provenance-carrying, the "unique" tier).
- **Surprise comes from property outliers, not from a rarity table.** A common material rolled at the tail of its distribution is the game's equivalent of a good drop, and it happens on the same schedule.

### 4.6 Build fantasy through visible absence

A skill tree's real function is not progression — it is *showing you what you could become*. Deleting it deleted aspiration. Replacement:

- **The Node Codex records node types the player has *observed but does not own*.** Seeing a creature or another player use a node registers its silhouette and its category. You now want it, you know roughly what it does, and you don't have it.
- **Graphs are inspectable.** Appraising another player reveals their ability graph shape and their gear's provenance (§8.4). Other players become the aspiration showcase — this is a major reason the game is multiplayer.
- **Slot growth is visible and slow.** The player can see the locked slots from hour one. 4 → 9 over the full arc.

### 4.7 Escalation without levels

Power growth must be *felt*, or removing levels removes the feeling of getting stronger along with the number.

- **Difficulty is geographic.** Aether density is the difficulty curve, and it is legible from the environment at a distance. There must be a clear, unmissable "you should not be here yet" read — sky, sound, creature silhouettes, material colour.
- **The return trip is mandatory design.** A player revisiting an early region after 40 hours must trivialise it. Target: **time-to-kill on a standard low-aether creature drops ~5× over the first 40 hours**, from equipment, graph size, and attunement combined. Measure this; it is the proxy for whether progression is felt.
- **No numeric power display anywhere.** The player should notice they got stronger by *noticing*, which is a much better feeling than watching a number.

### 4.8 Goals from gaps

The Codex (§12.2) is not only a record. It is the goal generator, and it works by making absence visible:

- materials measured but never sourced → *"you know this exists and not where"*
- nodes observed but not owned (§4.6)
- process chains partially discovered → *"you got steel once; you don't know why"*
- regions with anomalies detected at range but unvisited
- claims whose upkeep is failing

Presented as a list of **open threads**, spatially anchored where possible, with **no rewards attached and no completion state**. They are not quests; nothing tracks them; ignoring them costs nothing. The mechanism is purely that a visible gap generates wanting, which is how curiosity-driven play actually works and is nearly free to implement.

**On third-party wikis and maps.** Within weeks of launch the community will build databases, interactive maps, and property tables, and a large fraction of players will run them on a second screen. Plan for this; do not fight it. Two things follow, and the first is a rejection of the obvious fix:

- **Do not scramble static geography to defeat wikis.** Making deposits and anomalies relocate would keep maps stale at the cost of P4 and of §0.1's irreversibility condition — if a deposit moves, claiming it means nothing, and territory stops being real. Geography, formation rules, and which materials *can* occur where are meant to be knowable, and a shared community map is a healthy outcome, not a leak.
- **The un-wikiable layer is world state, and there is a lot of it.** Current instability and aether density, current population composition and yields, who controls what, what a given deposit is rolling *now*, current trade post inventories. All of it changes continuously and none of it can be tabulated. Seasonal modulation (§4.9) and Surge dynamics (§4.4) additionally mean *"go to X for the best steel"* is a temporarily correct answer rather than a permanent one — which is the right amount of churn, since the place still exists and is still worth holding.

And the Codex was never primarily an information-denial mechanism. It competes with wikis on **personalisation**, not secrecy: a wiki knows everything about the world and nothing about you, and *"you measured this and never found its source"* remains a live thread for a player with every tab open.

### 4.9 Rhythm

Sandboxes without a clock flatten out. Two cycles:

- **Diurnal (~2 h real):** sensor modalities shift, some creatures are nocturnal, thermal conditions change materially (§6.2 phase points near ambient). Night is a different game, not a darker one.
- **Seasonal (~3 weeks real):** ambient temperature shifts move materials across phase boundaries, flora yields change, migrations occur, and aether density oscillates globally by ±0.15. This makes some crafting and some regions *seasonally* viable, which gives long-term players a reason to plan and return.

Both cycles are worldgen inputs, not new systems — they modulate existing fields, per the §0.1 spine rule.

---

## 5. Feel

v1.0 had a legibility spec (§12.6) and no *feel* spec. For an ARPG that is the wrong way round: players tolerate an opaque system with excellent feel far longer than the reverse. This section is a requirements list for the action layer and is owned by a designer, not the simulation team.

### 5.1 Commitment model

ARPG combat feel comes from commitment: attacks cost time, and the player trades safety for damage. Baseline numbers, to be tuned but not abandoned:

| Phase | Duration | Cancellable |
|---|---|---|
| Windup | 100–250 ms (scales with weapon mass, §8.1) | **No** — this is the commitment |
| Active | 60–120 ms | No |
| Recovery | 150–400 ms | After 40%, by dodge or movement |
| Dodge | 350 ms total, i-frames from 60–180 ms | No; 200 ms lockout after |

- **Input buffer: 200 ms.** Queued inputs during recovery fire on the first legal frame. This single feature is responsible for most of the difference between "responsive" and "sluggish" in this genre.
- **Weapon mass drives windup and recovery**, derived from §8.1. A player-crafted absurdly heavy maul feels absurdly heavy with no tuning. This is where the simulation *pays off* in feel rather than costing it.
- **Hit-stop scales with transferred kinetic energy** (§12.6). Fractures freeze 4–5 frames; glancing blows don't stop at all.

### 5.2 Crowds, and the sim cost problem

ARPGs are about crowds, not duels. Target engagement composition: **8–20 trivial, 3–6 notable, 0–1 elite**, peaking around 40 entities. Full material simulation on 40 bodies is not affordable inside §14.2's budgets.

Resolution — **simulation fidelity LOD, not a separate combat system:**

| Tier | Body model | Resolver |
|---|---|---|
| Elite | Full multi-part assembly, per-part thermal/charge propagation, reactions | Full §6.3 |
| Notable | 3-part assembly, aggregate thermal, reactions on | Full §6.3 |
| Trivial | Single part, single aggregate material, no propagation | **Same §6.3 resolver, simpler body** |

The impulse resolver is unchanged for every tier. Only the `Body` complexity varies. Freeze-then-shatter still works on trivial enemies because their single aggregate material still has `elasticity` and `phase_points` — it just resolves in one step. **No special cases, per P1.**

### 5.3 Responsiveness budgets

| Metric | Target | Floor |
|---|---|---|
| Local input → animation start | ≤ 50 ms | 80 ms |
| Perceived hit confirmation | ≤ 80 ms | 120 ms |
| Prediction reconciliation visible pops | < 1 per minute | 3 per minute |

Hit confirmation is client-predicted with server correction. A rejected predicted hit must degrade gracefully (the enemy shrugs it off) rather than rewinding the animation.

### 5.4 Camera and readability

Resolves open question 1 from v1.0. **Decision: third-person, high, angled camera** (~40–55° pitch, adjustable), with the following non-negotiable consequence: **any material state that can threaten the player must be readable from the camera's position**, including behind the character. Charge arcs, heat glow, and instability shimmer therefore need silhouette-legible, screen-space-visible presentations, not just surface shading. Verify this at M2, not M5.

---

## 6. The simulation substrate

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

### 6.1 Entity model

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

### 6.2 Materials: the spine of the game

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
  "latent_heat":      { "fusion": 34.0, "vaporization": 210.0 },  // per unit volume
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

  // Formation — links material existence to worldgen (§8)
  "formation": {
    "requires": { "temperature": [-40, -5], "aether_density": [0.6, 1.0], "depth": [20, 200] },
    "abundance": 0.03
  },

  // Presentation — DERIVED where possible, see §12.1
  "appearance": { "derive_from_properties": true, "hue_bias": 195 }
}
```

Notes for implementers:

- **Values are game units, not SI.** The requirement is *monotonicity and consistent ratios*, not accuracy. A material that is twice as hard should behave twice as hard in a way the player can feel.
- **Property correlations must be authored as tendencies, not laws.** Hard-and-brittle vs. soft-and-tough is the normal relationship; a material that breaks the correlation is automatically interesting and should be rare. Procedural material generation (§8.4) should sample from a correlated distribution, with a small chance of anti-correlated outliers.
- **Reaction tags (`*:solvent`) let materials interact without an N² table.** Materials carry role tags; reactions match on tags. This keeps the interaction matrix authorable as the material count grows into the hundreds.
- **Target count:** ~40 hand-authored base materials at vertical slice; procedural variants and alloys expand this into the thousands at runtime. Hand-author the *archetypes*, generate the *space between them*.

### 6.3 The impulse model: there are no damage types

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
2. If `stress > hardness` → plastic deformation, reduce `Integrity` **proportionally to `(stress - hardness)`**.
3. Fracture is **graded, not a cliff.** Accumulated `Integrity` loss reduces effective `toughness`; a part separates when accumulated damage exceeds its capacity. A hit just under the notional fracture point does visible, meaningful damage and audibly weakens the part — it never does *nothing*.
   **Design rule, applies to the entire simulation: no binary hidden threshold may determine a combat outcome.** Every threshold is either graded across a band or has a visible approach (§12.6). A player who "missed the fracture by 0.01" and got no feedback will correctly report a bug, and they will be right — the failure is ours, not theirs.
4. Distribute `thermal` into `Thermal` weighted by `heat_capacity`; propagate to adjacent parts by `thermal_conductivity`.
5. Check `phase_points`. A part at a phase point does **not** transform on threshold crossing. It accumulates into a `phase_progress` buffer sized by `latent_heat × volume`, and transforms only when that buffer fills. This applies to every entity equally — player parts, item parts, creature parts (P1).

   **Why this matters more than it looks.** Without it, thermal is a durability bypass: an opponent's high-tier blade can be vapourised by a cheap, focused thermal graph without ever engaging its `hardness` or `toughness`, and high-level PvP degenerates into phase-racing within a week. With a volume-proportional latent heat buffer, a thin needle still melts almost instantly and an iron breastplate absorbs an enormous amount of energy first — which is both correct and what players intuitively expect.

   Two consequences worth designing toward rather than around:
   - **Partial phase progress is a state, not just a counter.** A part above its melt point with a half-full buffer is *softening*: effective `hardness` falls with progress. A blade you have been heating gets worse before it dies. Legible, gradual, and it makes thermal pressure tactically useful without being an instant-win.
   - **Freezing costs energy too.** Latent heat of fusion applies in both directions, so freeze-then-shatter now requires real thermal investment proportional to target mass. That combination should be a plan you commit resources to, not a cheap two-button kill on anything.

   **General principle, applied to every destruction channel:** *no path to destroying a mass may be more than ~2× cheaper per unit volume than the mechanical path.* Thermal has latent heat; corrosion consumes reagent proportional to volume; discharge dissipates with conductive mass. Any channel that scales sublinearly with target size is an exploit waiting to be found, and the fuzzer (§9.2) must search for exactly this — **cost-per-volume-destroyed, per channel** — as a distinct defect class.
6. Distribute `charge` by `conductivity`; if a part exceeds `discharge_threshold`, emit a secondary Impulse to the nearest conductive neighbour (this is how chain lightning happens without a "chain lightning" feature).
7. Match `reagent` tags against each part's `reactions`; apply products and released energy as a further Impulse (bounded to 3 cascade generations to guarantee termination).

**What this buys you, for free, with no additional code:**

- Wet targets conduct charge better → rain, rivers, and thrown water become tactical.
- A blade with high hardness and low contact area penetrates armour; a maul with high kinetic and large contact area doesn't penetrate but transfers enough energy to fracture brittle armour.
- Freezing an elastic creature makes it brittle, so the follow-up hit shatters it. Nobody implemented "freeze then shatter." It falls out of `elasticity`, `phase_points`, and step 3.
- An ice weapon melts if you fight near lava. Then you're unarmed. That is a *good* outcome and must not be patched out.

**Implementation warnings:**

- Cascades must be bounded (3 generations) and total energy must be conservative-or-lossy, never generative. Energy-generating loops are the #1 exploit vector in this design. Add an assertion in debug builds: total system energy after resolution ≤ energy before + injected.
- **"Injected" must have a source.** Abilities (§9) are the only mechanism that introduces new energy into a region, and §9.3 constrains where it comes from. Without that constraint the conservation rule above is vacuous: players would build graphs whose payloads create the conditions for harvesting more energy than the graph cost, and the exploit would be unfindable by inspection because each individual step obeys conservation. This coupling is mandatory, not optional.
- Resolution must be **order-independent**: gather all impulses for a tick, then apply. Otherwise multiplayer desyncs and hit-order exploits appear.
- Everything above runs in fixed-point (Q32.32). See §14.4.

### 6.4 The interaction matrix is the deliverable

Concretely, the design team's core artifact is not a document — it is a spreadsheet of ~40 materials × ~8 property axes, plus a tag-reaction table, tuned until the derived behaviours are interesting. Everything else in this document is scaffolding around that spreadsheet.

**Ship gate:** before any content work begins, the team must be able to demonstrate 20 distinct, useful, unanticipated tactical outcomes produced solely by the material table and the impulse resolver in a bare test arena.

---

## 7. World generation

### 7.1 Causal layering

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
8. Fauna          → ecology solve from flora + terrain (§10.2)   (local, continuous)
9. History        → settlement, conflict, ruin, and abandonment
                    simulated over N generations                (regional, one-shot)
10. Player deltas → everything anyone has ever changed          (sparse)
```

Each layer is a deterministic pure function of `(world_seed, coordinates)` — **except layer 10**. This is the entire persistence strategy and it is discussed in §7.3.

**Layer 5 (the aether field) is the design lever for making the world non-uniform in a way that matters.** It is a smooth 3D noise field with hard anchors (high at fault lines, deep water, and history-layer sites of catastrophe). It determines: which exotic materials can form, how much charge the environment holds, how expensive abilities are to cast locally, and which creatures can exist. Aether-high regions are the "deep water" of the map — better materials, worse odds. This is the primary source of P4.

**Layer 9 (history) is where narrative comes from.** Run a coarse agent simulation over the generated map for ~500 abstract years: settlements found near water and resources, grow, compete for scarce deposits, war, migrate, collapse. Then *bake the output as ruins, roads, borders, graves, and abandoned works.* The player never sees the simulation; they see its residue and can reconstruct it. This replaces the entire quest system. Budget: this runs once per region at first-touch, on the server, off the hot path, ~200ms per 16km² region.

### 7.2 Infinite world, finite meaning

Infinity is trivial to generate and hard to make matter. Three mandatory mechanisms:

1. **Gradients, not tiles.** Property fields (aether density, material rarity, ecological pressure) vary continuously with distance-from-origin *and* with local geography. Going 50km in any direction should feel like arriving somewhere, not like re-rolling.
2. **Non-renewable strata.** Certain deep material deposits do not regenerate. Once a region is mined out, it is mined out — the map has a memory and players compete over it. This is what makes territory real.
3. **Seeded uniqueness.** Roughly 1 in 200 regions contains an *anomaly*: a formation-condition outlier that produces a material with anti-correlated properties, or an aether well, or a history-layer catastrophe site. These are generated, not authored, but they are the map's landmarks and players will name and fight over them.

**Explicit design note:** do not add fast travel until §7.2 mechanisms are proven. Travel time is the mechanism that converts distance into value. If players teleport, the infinite world becomes a menu.

### 7.3 Persistence: deltas over generators

The hard problem in a persistent infinite world is storage. The solution:

> **World state = `generate(seed, coords)` + a sparse, expiring delta log.**

- The generated world is *free* — it is a function, stored nowhere.
- Only *differences* are stored: this tree was felled, this ore vein depleted by 40%, this structure was built, this corpse is here, this claim exists.
- Deltas are stored per-chunk as an append-only op list, compacted periodically.
- **Deltas expire.** Every delta has a decay policy: felled trees regrow (~14 real days), corpses decompose (~1 hour), terrain scars smooth (~7 days), ore veins refill partially (~30 days, capped below original), player-built structures decay unless maintained by an active claim (§11.2). When a chunk's delta list empties, the chunk is deleted from storage entirely and reverts to being a pure function.
- **Result:** storage scales with *player activity*, not with world size. An infinite world with 5,000 players costs roughly what 5,000 players' recent activity costs. This is the only reason the project is viable.

**Two-tier storage, because a flat capped log breaks in exactly the places players care most about.** A hub, trade route, or contested area fills a small append-only log within minutes, and evicting its oldest entries makes half-built walls and terrain revert *in front of the people who built them* — the worst possible place for the persistence model to show through.

| Tier | Contents | Budget | Eviction |
|---|---|---|---|
| **Chunk Snapshot** | Structures, terrain modification, ownership and claim state, permanent strata depletion | ~64 KB per chunk, consolidated in place | **Never evicted.** Removed only when the structure is destroyed or the claim lapses and decays out. |
| **Delta Log** | Ephemera: item drops, corpses, scars, harvest state, felled flora | 4 KB per chunk, append-only | Oldest-first, by priority class, with expiry per §7.3 |

Promotion rules: anything a player *built* or *claimed* writes to the Snapshot, never the log. A chunk acquires a Snapshot only when something durable happens in it, so the storage-scales-with-activity property holds — snapshots exist for the small fraction of the world players actually develop, and the log absorbs the high-churn ephemera that should be forgotten anyway.

Structures are stored as parameterized assemblies, not voxels.

### 7.4 Procedural materials

Hand-authored base materials (~40) define anchor points in property space. Runtime material generation fills the space:

- **Regional variants:** a base material sampled under specific `formation` conditions yields a variant with perturbed properties (±15%), a derived name, and derived appearance. "Quartz" from a high-aether region genuinely has higher `aether_capacity`, and the player can learn to seek it.
- **Alloys and compounds:** produced by the process system (§8.2). Properties interpolate non-linearly — the alloy curve should have local optima so that specific ratios are discoveries, not sliders.
- **Anomalies:** rare anti-correlated outliers (hard *and* tough, conductive *and* aether-permeable). These are the "legendary materials" of the game and they were never authored.

---

## 8. Items: form, material, process

### 8.1 There is no item database

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
  "process_quality": 0.72,               // from the crafting act, §8.2
  "integrity": [ /* per part */ ],
  "provenance": [ /* §8.4 */ ]
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

### 8.2 Crafting as process, not recipe

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

**Blueprints — discovery, not recipes.** The absence of a recipe list must not mean the absence of memory. When a player completes a process chain, the Codex (§12.2) records *the path they actually performed*: inputs, process order, and the conditions they hit. This is a personal record of a personal discovery, not a global unlock — it is generated from what happened, and it is tradeable as information (§12.2). Two players who arrive at steel by different routes have different blueprints for it.

**Assisted crafting.** A recorded blueprint can be re-executed automatically, consuming the same inputs and producing the item without manual process play. This is a convenience feature and it must be priced as one:

> Assisted crafting quality is **not a flat cap — it scales with the fabrication infrastructure the player has built.** Bare-hands assisted execution yields ~0.6. A fully developed foundry within a claim — regulated heat source, controlled quench, precision forming, materials handling, each an assembly the player built and maintains — reaches **0.9**. Manual execution reaches 1.0.

This is a correction to an earlier version of this design, which used a flat 0.6 cap. That version was wrong: it required a player to hand-execute a multi-step thermal/kinetic/quench process for every item across a hundred-hour play cycle, which is friction, not depth.

The revised shape gives the right incentives at every stage:

- **Early:** no infrastructure, so manual play is how you get good output. Process play is taught when the player has time for it.
- **Mid:** building a foundry is a real project spending **territory, matter, and time** — three of the four spine resources (§0.1), so it earns its place as a system.
- **Late:** the endgame crafting loop is *building and upgrading the facility*, not repeating a minigame. Mass production runs at 0.9 unattended.
- **Peak:** the 0.9–1.0 band is reachable only by hand, and only matters for top-tier items. Skilled hands stay relevant without being mandatory.

Mass production is therefore possible, capital-intensive, and very slightly worse than artisanal work — which is both the correct economic outcome (§11.4) and, not incidentally, true.

### 8.3 Upgrading, wear, and repair

- Items accumulate `Integrity` damage from the same resolver as everything else. There is no separate durability system.
- **Repair** is re-application of processes: heat, deform, re-quench. Each repair cycle slightly degrades the material (work hardening → toughness loss) so items have a finite but long life. Nothing lasts forever; nothing is destroyed arbitrarily.
- **Upgrading** is replacing a part with a better material, or adding charge, or re-grinding geometry. There is no upgrade level. A "+5 sword" is a sword whose blade was replaced with better material and whose edge geometry was refined.
- **Sockets and cores:** aether cores harvested from creatures and anomalies can be bound into forms with socket topology, granting ability-graph nodes (§9). This is the main vector for "magic items" and it is entirely compositional.

### 8.4 Provenance: where notable items come from

Every item carries an append-only provenance chain: who made it, from material sourced where, what it has killed, how many times repaired, who has owned it. This is cheap (a few hundred bytes), fully emergent, and is the mechanism by which the community generates legendary items without the team authoring any.

Provenance is **queryable in-world** — an appraisal tool reads an item's history. Expect players to build reputation economies around this. Support it; do not systematize it further.

---

## 9. Abilities: composable effect graphs

### 9.1 No spell list

An ability is a small directed graph of nodes, assembled by the player. Node categories:

| Category | Examples | Notes |
|---|---|---|
| **Source** | self, wielded item, ambient field, target | Determines where the effect originates and what it costs |
| **Shape** | point, cone, ray, sphere, plane, arc, path | Geometry of application |
| **Delivery** | instant, projectile, beam, lobbed, attached, delayed, persistent-field | How the shape reaches the target |
| **Payload** | impulse composition (kinetic/thermal/charge/corrosive/aether), material emission, entity spawn, state transfer | *This is where it plugs into §6.3 — payloads are Impulses. Nothing else.* |
| **Trigger** | on cast, on impact, on threshold, on interval, on death, on material contact, on charge exceeded | Enables chaining and traps |
| **Modifier** | amplify, split, chain, delay, mirror, invert, home, pierce | Applied to downstream nodes |

An ability graph is capped (start: 4 nodes; max: ~9 via progression) and slotted into `Effectors`. Nodes are acquired as physical objects in the world — harvested from creatures, extracted from anomalies, purchased from other players. **Node acquisition is loot.**

New players do not start with an empty editor. They start with several working, deliberately sub-optimal preset graphs and learn the system by taking them apart — see §12.7, which is a hard dependency of this section, not a UX nicety.

Examples of things nobody implemented:
- `Source(self) → Shape(sphere) → Payload(thermal: -400)` = an area freeze. Combined with §6.3 step 3, enemies become brittle. Follow with a maul.
- `Source(item) → Delivery(lobbed) → Payload(emit: solvent) → Trigger(on material contact) → Payload(charge: 30)` = you threw water and then electrified it.
- `Trigger(on death) → Delivery(persistent-field) → Payload(corrosive)` = a corpse that dissolves whatever approaches it. Including you.

### 9.2 The cost model — how this stays balanced without a balance team

This is the section most systemic-sandbox projects skip and it is why they collapse into a single dominant strategy. **It is mandatory.**

Every node has a base cost. Cost of a graph:

```
cost = Σ(node_base × scale^α) × interaction_multiplier × context_modifier
```

Requirements on this formula, all of which are testable:

1. **Superlinear in magnitude.** `α > 1` (start at 1.4). Doubling a payload's magnitude must cost more than double. This is the single mechanism that prevents scaling exploits.
2. **Superlinear in node count.** A 9-node graph costs more than 9 × the average node. Complexity is powerful and must be priced.
2b. **Execution complexity is a *discount*, not an afterthought.** A graph that requires positioning, setup steps, timing windows, or reagent prerequisites is harder to land than one that is a single keypress, and the cost model must pay for that difficulty: `execution_difficulty` (derived from required setup steps, positional constraints, timing window width, and prerequisite state) **reduces** cost, permitting hard-to-execute graphs to be numerically stronger.
    Without this term the fuzzer is measuring the wrong quantity entirely. It evaluates graphs in a vacuum where execution is free; humans optimise for cognitive load and actions-per-minute. A 0.7× one-button preset beats a 1.0× graph that needs a reagent thrown first and a two-second window hit — every time, for every player, forever. Pricing execution difficulty in makes the fuzzer's effect-per-cost track something players actually experience, and it makes §12.7's preset rule work automatically: presets are trivially executable, so they are priced *higher*, so they fall below the efficiency line without anyone hand-nerfing them.
3. **Interaction-aware.** If two nodes are known to combo (charge payload + solvent emission), the multiplier catches it. Maintained as a sparse table, populated by the fuzzer (below), not by hand.
4. **Context-modified.** Casting costs scale inversely with local aether density (§7.1 layer 5). Powerful abilities are cheap in dangerous places. This is a geography-into-combat coupling and it is deliberate.

**The combinatorial balance fuzzer.** Build this in Milestone 3, not later. It is a CI job that:
- enumerates/samples the ability graph space (millions of combinations),
- runs each in a headless deterministic arena against a standard target set,
- computes effect-per-cost,
- flags any combination more than 2σ above the mean as a **balance defect**,
- fails the build if the top 0.1% exceeds the median by more than 4×.

The fuzzer replaces manual balance passes and is the only way a combinatorial system stays sane. Assign an engineer to it permanently. The same harness runs against the crafting space (§8) and the material table (§6.2).

### 9.3 Where ability energy comes from

Abilities are the only source of new energy in the simulation, so their sourcing is a conservation boundary, not a cost display. Two-tier draw:

| Tier | Source | Behaviour when depleted |
|---|---|---|
| **Reserve** | The caster's own `Charge` capacity, set by body material properties and attunement (§9.4). Recharges over time anywhere, including dead-aether regions. | Casting stops until it recovers |
| **Field** | The local chunk's aether stock (§7.1 layer 5), drawn on for payloads exceeding reserve capacity | Payload **weakens smoothly**, then fizzles — never a hard cutoff |

Consequences, all of them wanted:

- **Total energy injectable into a region per unit time is bounded** by reserve recharge plus field stock plus diffusion rate. The exploit class in §6.3 becomes structurally impossible rather than something the fuzzer has to catch after the fact.
- **Sustained heavy combat locally depletes the field**, so extended fights become attritional and positioning-relevant. Fall back to a fresh area and your big payloads work again. Nobody designed "mana zones"; it fell out of the field.
- **Casting depletion is temporary; extraction depletion is permanent.** Field stock re-diffuses from neighbours over minutes. Extraction (§4.4) removes stock from the system entirely, bound into matter you carry away. This is the mechanical distinction that keeps the Surge coherent — fighting does not destabilise a region, *mining it does*.
- **New players are not stranded.** The starter region is low-aether (§12.8), so this rule would break onboarding if all casting needed field draw. It does not: reserve-tier casting works everywhere, at all times, with no geography dependency. Field draw is what makes *large* effects possible, and it is an escalation mechanism rather than a floor. **Verify this explicitly at M3** — it is the most likely place for this rule to break the new-player experience.

### 9.4 Progression without a skill tree

Four vectors, none of them a tree:

1. **Equipment** — the primary power curve. Better materials, better processes, better sockets.
2. **Ability nodes** — acquired as world objects; graph slot count grows slowly (4 → 9 over the full arc).
3. **Attunement** — a small number of permanent-ish, mutually exclusive body adaptations acquired by sustained exposure. Live in a cold high-aether region long enough and your body's material properties shift (higher thermal resistance, higher aether capacity, lower toughness). Attunements are **material property changes to the player's `Body`** — they run through the same resolver as everything else, so they have real, non-obvious downsides. Reversible, slowly.
4. **Knowledge** — the real curve (P6). Tracked implicitly; see §12.2.

Deliberately absent: XP, levels, stat points. A character's power is legible from what they carry and what they've become, not from a number.

---

## 10. Creatures and ecology

### 10.1 Creatures are entities, not enemies

A creature is a `Body` (assembly of parts with materials, same as an item), `Metabolism`, `Sensors`, `Locomotion`, `Effectors`, and `Agency`. **Creatures use the same ability system as players** (§9) and the same impulse resolution (§6.3).

Direct consequences, all desirable:
- Creature parts are made of materials, so they butcher into usable materials with real properties. Hide from a cold-region beast genuinely has thermal resistance.
- A creature with a chitin plate of high hardness/low toughness is defeated by blunt force, and the player can *see* this before engaging (P3).
- Creatures can pick up, use, and be killed by items. A wolf can be set on fire by a burning tree. Nobody wrote that.
- A creature's abilities are graphs, so they can be harvested as nodes.

**Bodies are procedurally assembled** from a body-plan grammar: segments, limb attachment points, sensor placements, effector mounts, material assignment by region. ~12 hand-authored body plans × material/scale/effector variation = the entire bestiary. Appearance derives from materials (§12.1), so a creature *looks like what it is made of*.

### 10.2 Ecology and the two-LOD population model

Creatures are not spawners. There is a population simulation.

- Each region carries a **population vector** per species with birth, death, predation, and migration rates driven by flora density, terrain, aether level, and competition. Standard Lotka-Volterra-ish coupled equations, stepped coarsely (once per game hour).
- **Near a player: individuals are instantiated**, drawn from the aggregate, with individual `Agency`. Kills decrement the aggregate.
- **Hysteresis, pinning, and stable sampling.** A single 512 m threshold produces two exploits and one bug, and all three need closing:

  | Mechanism | Rule |
  |---|---|
  | Hysteresis band | Instantiate at **< 500 m**, collapse at **> 600 m**. No entity changes representation inside the band. |
  | Combat pinning | An entity with active combat state **never collapses**, at any distance, until its combat state times out (30 s). Prevents aggro-drop by outrunning the boundary. |
  | Collapse cache | Collapsed entities retain full individual state for **60 s** before folding into the aggregate. Re-entry restores them rather than re-sampling. |
  | Stable sampling | **Instantiation is a deterministic function of `(chunk, aggregate_state, time_bucket)`, not fresh RNG.** Time buckets advance every 10 minutes. |

  The last row is the one that actually closes the re-roll exploit, and their absence is why a cache alone is insufficient: a player farming for a favourable body-plan variant or material yield will simply wait out a 60-second cache and step back across the line. With seeded, bucketed sampling, crossing the boundary a hundred times in ten minutes produces the same population a hundred times. Waiting is the only way to re-roll, which makes it uninteresting.
- **Far from any player: only the aggregate exists**, stepped statistically. Cost per region: negligible.
- **Handoff must be consistent.** When a player enters, instantiation samples from the aggregate; when they leave, individuals are folded back in. This is the mechanism that makes an infinite living world affordable and it must be built correctly in Milestone 4 — retrofitting it is expensive.

**Player pressure is real.** Overhunt a region and the population crashes, its predators starve or migrate, the flora they suppressed overgrows, and the region's material yield changes. This resolves in days-to-weeks of real time and it is the strongest available source of P4 and P5. Do not add artificial floors that prevent extinction — add long migration-driven recovery instead.

### 10.3 Agency: utility AI, not behaviour trees

Behaviour trees encode designer intent and therefore prevent emergence. Use **utility AI**:

- Each agent has a **needs vector**: energy, safety, temperature, territory, reproduction, and (for social species) group cohesion.
- Each tick, the agent scores available actions against current needs and situation, and picks stochastically from the top candidates (softmax, not argmax — determinism preserved via seeded PRNG per agent).
- Actions are generic: approach, flee, attack, feed, rest, patrol, hoard, follow, call. Their *parameters* come from the creature's components.
- **Sensor modality matters.** A creature that senses by heat can be evaded by cooling yourself. A creature that senses by aether can be evaded by discharging. This is the primary stealth system and it required no stealth system.

Agents keep a small memory (last N notable events, decaying) so they can learn locally: a wolf pack that lost members to a player retreats from that player's scent profile. Cap memory at 32 entries per agent; it is not machine learning, it is a decaying event list, and that is sufficient.

---

## 11. Society, ownership, and conflict

### 11.1 No guild system

Groups are not a feature. Grouping falls out of two primitives: **shared claims** and **transferable keys**. A "guild" is a set of players on a claim's permission list. A "raid" is people who agreed to walk in the same direction. Do not build social systems; build the primitives and let players build the social systems. Provide good communication tools (proximity voice/text, a written-note item that is a physical object, map annotation) and nothing else.

### 11.2 Claims: how players own space

A claim is a physical, destructible marker that:
- consumes material upkeep continuously (this is the primary economic sink),
- suspends delta decay (§7.3) within its radius — **this is the actual mechanical purpose**: a claim is what stops your base from rotting back into wilderness,
- carries a permission set for build/harvest/access,
- is visible and appraisable from outside.

Claim radius scales with upkeep cost superlinearly, so empires are expensive and small holdings are cheap. There is no claim limit; there is an economics of claims.

### 11.3 Conflict is geographic, not a toggle

PvP rules are not a menu setting. They are a property of the aether field (§7.1 layer 5):

| Aether density | Materials | Conflict rules |
|---|---|---|
| Low (< 0.3) | Common | No unconsented damage between players. Claims fully enforced. |
| Mid (0.3–0.7) | Good | Unconsented damage allowed; on death, drop carried materials only, keep equipped items. |
| High (> 0.7) | Anomalous, best in game | Full drop. Claims decay rapidly regardless of upkeep. |

This resolves the sandbox PvP problem correctly: risk and reward are the same axis, the choice is made by walking, and players who want no conflict have an entire (poorer) world available. It also gives §7.2's gradients teeth.

### 11.4 Economy

- **No fiat currency.** Materials are money. Expect a high-density, universally useful material to emerge as a de facto currency; do not prevent this, and do not designate it.
- **Sinks** (mandatory, or the economy inflates to uselessness): claim upkeep, item wear and repair degradation, ability aether cost, food/metabolism, process input losses (smelting is lossy).
- **Faucets:** regenerating deposits, ecology yield, anomaly discovery.
- Trade is physical: goods change hands in the world, or through player-built trade posts (a claim with a storage assembly and a permission set). No global auction house — it collapses geography, which is the game's main asset.

Ship a **read-only economy telemetry API** so players build their own market trackers. They will do this whether or not it is supported; supporting it costs almost nothing and generates community infrastructure.

**Shape it to expose trends, not arbitrage.** Real-time precise data would let bots poll continuously and buy out underpriced regional stock before a human could act. The mitigation is structural rather than a flat delay: because there is no global auction house and trade is physical (above), any bot must still *travel*, which already blunts most of the edge. What remains is closed by exposing aggregates only:

| Exposed | Withheld |
|---|---|
| Regional price indices and volumes, delayed 1–2 h | Individual trade post inventories |
| Historical series, material demand curves | Precise deposit coordinates and current yields |
| Aggregate flows between regions | Real-time, per-item, per-location listings |

This keeps the interesting community tooling — price history, trend analysis, market trackers — and removes the actionable specifics that only automation can exploit. Severity here is genuinely lower than in a game with a global market; the physicality of trade is doing most of the work.

---

## 12. Legibility, onboarding, and discovery

Restating P3, because this is where systemic games actually die: **a system the player cannot read is a random number generator with extra steps.**

### 12.1 Appearance is derived from properties

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

### 12.2 Instruments and the Codex

- **The Lens** — a craftable instrument that reads numeric properties off a target. Tiered: a crude lens reads 2 properties with ±30% error; a refined high-aether lens reads all of them exactly. This makes *information* a crafted good and a trade good.
- **The Codex** — an automatic, personal record of what *this player has personally observed*: materials encountered with the properties they measured, reactions they witnessed, creature behaviours they saw, locations of deposits. It is not a wiki; it does not contain unobserved facts. This is P6 made visible: a veteran's Codex is their actual character sheet.
- **The Readout** — the full numeric account of an impulse resolution: energy transferred, what deformed, what fractured, what reacted, what changed phase. This is the hypothesis-testing loop and the tool that produces the community's shared knowledge.
  **Default: off.** It is surfaced two ways instead of as a permanent panel: (a) a *"what just happened?"* button that expands the last resolution on demand, always one keypress away; (b) automatically after a death (§12.8). Veterans pin it open; nobody else ever has to see a number.

### 12.3 What not to do

- Do not display derived DPS, "item level," or a power score. Display *properties* — as badges early, as numbers later (§12.5). The reasoning is the gameplay.
- Do not add tutorial pop-ups explaining interactions. Every interaction explained is an interaction not discovered. Teach the *instruments*, not the *facts*.
- Do not permanently hide the numbers behind flavour text. Badges are the entry layer, not the ceiling; the numbers must always be reachable.

---

### 12.4 The accessibility thesis: ramp, not reduction

The instinct when a systemic game tests badly with new players is to remove depth. That is the wrong lever and it destroys the game — the simulation *is* the product, and the players who will generate this game's community knowledge, wikis, and word of mouth are exactly the ones who want the spreadsheet.

The actual problem is never depth. It is **time-to-first-competence**: how long before a new player does something that works, and understands why it worked. A game can have an unbounded ceiling and a 90-second floor. That is the target.

Three mechanisms, in priority order:

1. **Progressive disclosure.** Every system has a surface layer that is readable at a glance and a deep layer that is opt-in. The deep layer is never removed, never simplified, and never gated behind a difficulty setting.
2. **Deconstruction over construction.** New players receive working things and take them apart. They never face a blank graph or an empty anvil.
3. **Physical intuition over documentation.** Players already know that water conducts and ice shatters. Build the onboarding out of things they already believe.

**Governing rule for the whole section:** *nothing in this section may be a separate code path.* Presets, badges, blueprints, and assisted crafting are all **views over and data in the same systems described in §6–§11.** If any accessibility feature requires the simulation to behave differently, it has been implemented wrong.

### 12.5 Property badges and progressive disclosure

Raw scalars (`toughness: 0.18`) are correct data and terrible UI for a first-time player. Replace the *default* presentation with derived badges:

| Badge | Derived from | Reads as |
|---|---|---|
| Brittle | high `hardness`, low `toughness` | cracked-glass icon |
| Springy | high `elasticity` | |
| Heavy / Light | `density` | anvil / feather |
| Conductor / Insulator | `conductivity` | |
| Heat Sink / Heat Trap | `thermal_conductivity` × `heat_capacity` | |
| Volatile | low `phase_points.ignite` | |
| Reactive | non-empty `reactions` with common tags | |
| Aether-Porous / Aether-Dense | `aether_permeability`, `aether_capacity` | |

Requirements on badges, all of which matter:

- **Badges are computed from the property vector at runtime, never authored per material.** A procedurally generated material or a player-made alloy gets correct badges automatically. If badges are an authored enum, the content model has been re-hardcoded through the back door and §7.4 breaks.
- **Badges are thresholded views, so they are lossy** — two materials can share a badge set and behave differently. That is acceptable for *identification* and unacceptable for *combat prediction*. An ARPG player who swings a "Brittle"-tagged weapon expecting a fracture and gets nothing has been lied to by the UI.
  Therefore: **badges communicate identity; the world communicates margin.** Whether a specific part is *near* its stress, thermal, or discharge limit right now is never expressed as a badge — it is expressed continuously in the world (§12.6), where it belongs. Combined with graded thresholds (§6.3), a player never experiences a cliff they could not see coming. The lossiness then creates the intended effect — wanting the real numbers — without ever creating a false expectation.
- **The Lens tier is the disclosure gate.** A crude lens shows badges only. A refined lens shows numbers. This makes §12.2's instrument progression the accessibility ramp itself, rather than an unrelated chore — the depth is *earned in-fiction*, not toggled in a menu.

### 12.6 Feel: making the simulation legible through the body

§12.1 makes *steady state* readable from surfaces. This subsection makes *events* readable without text. All values are driven directly from the impulse resolver (§6.3) — none of it is hand-authored per weapon.

| Sim quantity | Feedback channel |
|---|---|
| `stress / hardness` ratio approaching 1 | material-appropriate strain audio with **continuous pitch/timbre shift as the margin closes**, surface crack splines accumulating with `Integrity` loss |
| Fracture event | hit-stop (2–5 frames scaled by transferred kinetic), camera shake, debris entities |
| Phase change | audible state change (hiss, crack, roar), emissive ramp, particle emission |
| `Charge` near `discharge_threshold` | visible arcs leaping to nearby conductive surfaces — this is a *warning*, and it must fire before the discharge, not with it |
| Reaction firing | reagent-coloured reaction VFX, tag-derived |
| Penetration vs. deflection | distinct impact audio and a different animation branch |

**Margins, not states.** Every one of these channels expresses *how close* a threshold is, not merely whether it has been crossed. This is the requirement that makes graded thresholds (§6.3) legible and is the difference between a simulation and a slot machine.

**Audio is procedural, and it is roughly half the legibility engine.** With thousands of runtime materials there can be no sample-per-material library. Impact, strain, fracture, and phase-change audio must be **synthesised from material properties** — modal synthesis parameterised by density, hardness, elasticity, and part geometry, so a player-invented alloy sounds like what it is with no authoring. This is a significant technical workstream and it is why §18 lists a technical audio designer as non-optional.

Two further rules:

- **Hit-stop is scaled by computed transferred energy, not by weapon type.** This is what makes a purely numerical outcome feel heavy, and it means a player-crafted maul of an absurd material feels correct with no tuning.
- **Warnings precede consequences.** Every state that is about to hurt the player must be visible for at least ~0.5 s before it does. A charged puddle that kills you with no tell is indistinguishable from a bug.

### 12.7 Presets and deconstruction

A blank ability graph (§9.1) is choice paralysis. A blank anvil (§8.2) is worse.

**Starter loadouts.** New characters receive several pre-assembled ability graphs and item designs presented as recognisable ARPG archetypes — a fire projectile, a whirling melee attack, a frost-and-shatter pairing. These are **data files in the exact format a player can author**, shipped as content, not special cases. They are immediately usable with zero systems knowledge.

**Deconstruction is the tutorial.** The graph editor is available from hour one, and it opens *on an ability that already works*. The player sees that their Fireball is `Source(self) → Shape(sphere) → Delivery(projectile) → Payload(thermal)`. Swapping one node — thermal for charge — is a one-click experiment with an obvious result. This teaches the system by mutation rather than by construction, which is how people actually learn systems.

**Critical constraint — presets must be worse.** If the shipped archetypes are well-tuned, nobody ever opens the editor and the entire ability system becomes a class list with extra steps. Therefore:

> Every shipped preset must land at **0.6–0.75× the median effect-per-cost** of the graph space — measured with the execution-difficulty term of §9.2 included, so the comparison reflects what players actually feel. Verified by the fuzzer as a build gate. Presets are reliable and inefficient.

**Hard rule for the designer who will eventually be tempted:** if telemetry shows players are not modifying their graphs, **never fix it by nerfing presets below the 0.6 floor.** That makes onboarding feel weak and clunky while leaving the actual cause untouched. The cause is almost always execution friction in the custom path — a clumsy editor, unclear node semantics, or setup requirements that are tedious rather than interesting. Fix the friction.

The same applies to starter item designs: functional, made of common materials, never optimal.

### 12.8 Failure legibility and the first thirty minutes

The single largest accessibility failure in systemic games is not crafting UI. It is **dying without knowing why**. A player who can't attribute their death concludes the game is arbitrary and leaves, and no amount of badge polish recovers that.

**The postmortem.** On death, show one plain-language sentence naming the dominant cause, generated from the resolution record — for example: *"Your blade shattered: hoarfrost quartz is brittle, and it was still frozen when it struck the plated crawler."* One sentence, no numbers, with a "show me" link to the full Readout. This is generated from sim state, not authored per case.

**The starter region.** The first ~500 m of a new character's world is generated with constrained parameters rather than authored by hand (§7.1 accepts biased inputs): high material contrast, exaggerated property extremes, and terrain arranged so that the classic physical intuitions are the path of least resistance. Concretely, the generator is asked for configurations like a water source above a hostile group, brittle-plated creatures next to loose heavy rock, an oil seep beside a heat source. The player discovers wet-plus-charge and ice-plus-impact by doing the obvious thing, and learns two of the game's most important interactions without a line of text.

**Early reversibility.** Nothing in the first hours is unrecoverable: starter materials are abundant, starter designs are re-craftable at no meaningful cost, and the surrounding region is low-aether (§11.3), so death costs time and not property. Consequence is a thing the player travels toward, not a thing that ambushes them.

**Target:** a new player performs a deliberate, correct, multi-system interaction — sets something up and it works — within **10 minutes**, without opening a menu or reading a tooltip. This is a measured metric, not a hope (§15).

---

## 13. Multiplayer architecture

### 13.1 Topology

- **Server-authoritative.** The client is a renderer and an input device. It runs a *copy* of the simulation for prediction only.
- **Region shards.** Each shard authoritatively owns a 2km × 2km world area and everything in it. Target 32–64 concurrent players per shard; shards spin up on demand and hibernate when empty (persisting deltas).
- **Seamless handoff.** 200m overlap band at shard boundaries; entities crossing are migrated with a two-phase handoff. Players in the band receive updates from both shards.
- **Interest management.** Per-player subscription to a 512m radius plus a coarse 4km horizon feed (aggregate, low-frequency: other players' rough positions, weather, large structures).

### 13.2 Netcode

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

### 13.3 Backend recommendation: SpacetimeDB

Recommended, with justification, because the fit is unusually tight:

- Server logic is **Rust compiled to WASM** — the same simulation crate the client runs for prediction. One sim, two hosts. This largely solves the determinism problem (§14.4).
- State *is* the database; there is no ORM layer, no cache invalidation, no separate persistence path. The delta log (§7.3) is just tables.
- Row-level subscriptions map directly onto interest management.
- Transactional per-tick semantics give clean atomicity for impulse resolution.

**Risks to accept knowingly:** smaller ecosystem, less operational precedent at scale, and shard-level scaling behaviour must be load-tested early (Milestone 5, not later). **Fallback:** custom Rust server over WebTransport with Postgres for deltas and Redis for hot state — costs roughly 6–10 engineer-weeks more and loses the shared-sim elegance.

---

## 14. Technical architecture

### 14.1 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Simulation core | **Rust → WASM** | One codebase, client + server. Deterministic by WASM spec (§14.4), hardware-fast. |
| Rendering | **Babylon.js 8.x, WebGPU with WebGL2 fallback** | Mature WebGPU path, node materials fit property-derived shading (§12.1), thin instances, inspector saves weeks of tooling. Three.js is a defensible alternative if the team has deep graphics experience — but the renderer must never leak into the sim layer, so the choice stays reversible. |
| Terrain meshing | Rust → WASM in a worker pool (4 workers) | Surface Nets over a density field; keep off the main thread. |
| Networking | WebSocket (binary) now; WebTransport when Safari support justifies it | |
| Backend | SpacetimeDB (§13.3) | |
| Asset delivery | KTX2/Basis textures, Draco/meshopt geometry, CDN, aggressive caching | |
| Build | Vite, wasm-pack, Cargo workspace | |

**Hard requirement:** the simulation crate must have zero dependencies on rendering, networking, or platform APIs. It takes state + inputs, returns state + events. Everything else is a host.

### 14.2 Performance budgets

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

### 14.3 Streaming and LOD

| Ring | Radius | Content |
|---|---|---|
| Active | 0–128 m | Full simulation, full mesh detail, individual creatures |
| Near | 128–512 m | Simulation at reduced tick, reduced mesh, individual creatures |
| Far | 512 m–4 km | No entity simulation (aggregate only), heavily decimated terrain, impostors |
| Horizon | 4–20 km | Heightfield-only silhouette, single draw call |

Chunk size 64 m × 64 m × full height column. Generation is a pure function, so chunks are never stored, only cached — evict aggressively under memory pressure and regenerate. Prefetch along the movement vector.

### 14.4 Determinism (read this carefully)

Client prediction, server authority, and replay debugging all require bit-identical simulation. The failure mode is subtle desync that appears only under load and takes weeks to diagnose. Mandatory rules:

> **Correction to an earlier version of this document.** v1.0 mandated Q32.32 fixed-point for *all* simulation math on the grounds that floats are non-deterministic. That is wrong for WebAssembly specifically, and the error is expensive: software fixed-point plus software transcendentals is far slower than hardware IEEE ops, and the §14.2 budgets do not have the headroom to pay for it. The corrected rules follow.

1. **IEEE 754 `f32`/`f64` for simulation math is correct and deterministic here.** The WebAssembly specification mandates IEEE 754-2019 semantics for add, subtract, multiply, divide, sqrt, min, and max — no FMA contraction, no x87 extended precision, no reassociation. The same WASM binary produces bit-identical results across conforming runtimes. This is a property of WASM, not of floats generally, and it is one of the strongest arguments for the shared-sim architecture in §13.3.
2. **The genuine non-determinism is narrower than "floats," and all of it must be closed:**
   - **`libm` transcendentals.** `sin`, `cos`, `exp`, `pow`, `log`, `atan2` are *not* specified bit-exactly and vary by libm version. Implement them in-crate using only IEEE-specified operations. (`sqrt` is IEEE-specified and may be used directly.) This remains the single most common desync source. On cost, see the budget rule below — it matters more than the implementation choice.
   - **NaN payload bits**, which are non-deterministic per spec. Canonicalise on production, and assert no-NaN in debug builds — a NaN in the resolver is a bug regardless.
   - **Relaxed SIMD**, which is explicitly non-deterministic. **Banned.** Fixed-width SIMD is deterministic and should be used aggressively for the impulse resolver and thermal propagation.
3. **Fixed-point (Q32.32) is retained where drift matters, not everywhere:** world-space position accumulation, and any long-horizon integrator (thermal state, ecology aggregates, instability) where float error compounds over hours. Mixed precision is fine; the boundaries must be explicit and documented in the sim crate.
4. **Transcendental cost: budget the call count, not the implementation.** The concern that in-crate transcendentals will breach the 12 ms shard tick is legitimate, but the usual proposed fix — replacing polynomials with interpolated look-up tables — is the wrong lever and is likely to be *slower*, not faster. A degree-7 minimax polynomial evaluates in registers; a LUT costs a dependent memory load, and in a simulation loop already streaming entity data across L1, a hot table is a cache-pressure problem, not a savings. This is why production math libraries have moved *toward* polynomial evaluation and away from large tables over the past two decades. Both approaches are equally deterministic, so determinism is not a tiebreaker.

   The real answer is that a well-built sim loop should barely call them:

   | Naive use | Replacement |
   |---|---|
   | `sqrt` for distance checks | Compare squared distances |
   | `acos`/`atan2` for FOV and facing (§10.3 sensors) | Dot products against precomputed cosine thresholds |
   | `sin`/`cos` for orientation | Quaternions and rotation matrices; incremental rotor updates |
   | `exp` for thermal and charge decay | One precomputed per-tick multiplier — the tick rate is fixed (§13.2) |
   | Sigmoid curves in utility AI scoring | Piecewise-linear or polynomial curves, chosen at authoring time |

   **Set a hard budget of transcendental calls per shard tick at M0, instrument it, and fail the build when it is exceeded.** Default to polynomials; permit LUTs only where profiling on target hardware shows a win for a specific call site.

5. **Profile all of this at M0, not on faith.** Benchmark 40 multi-part bodies with cascades against the 12 ms server budget and record the numbers in the repository. If IEEE ops do not clear the budget, the scope in §5.2 shrinks — the determinism rules do not bend.
6. **No iteration over hash maps** in simulation code. Use sorted, stable-ordered containers everywhere.
7. **Seeded PRNG per entity**, advanced deterministically. Never a global RNG.
8. **Impulse resolution is gather-then-apply**, order-independent within a tick (§6.3).
9. **CI desync test:** run 10,000 ticks of a seeded scenario on server and client builds, assert identical state hashes. This test runs on every commit. If it goes red, nothing else ships.

### 14.5 Data pipeline and modding

Every non-code definition is a schema-validated data file: materials, forms, processes, ability nodes, body plans, worldgen layer parameters, reaction tags, cost model coefficients.

- Schemas in JSON Schema; validation in CI; hot reload in development.
- **Design the data format as if it were a public modding API from day one**, because it should become one. A systems game with a modding community gets content contribution for free, and this design's content model is unusually mod-friendly — a mod is a materials file.
- Server-side mod support is a post-launch concern, but **do not make decisions that foreclose it.** Concretely: no compiled-in content, no content identifiers that are enum discriminants, no assumptions about a fixed material count.

---

## 15. Balance methodology and telemetry

Because there is no content list, there is nothing to balance by hand. Balance is a *process*, owned permanently by one engineer plus one designer.

**Automated (runs in CI):**
- Ability graph fuzzer (§9.2) — flags effect-per-cost outliers.
- Crafting space fuzzer — enumerates form × material × process combinations, flags derived-stat outliers.
- Material property fuzzer — searches for degenerate reaction loops and energy-generating cascades.
- Determinism test (§14.4).

**Observed (from live telemetry):**
- Usage concentration: if >15% of players converge on the same ability graph shape, the cost model has a defect. Fix the *formula*, never the specific combination.
- **Effect per cost per APM.** The fuzzer's static effect-per-cost is a model; this is the ground truth. Track realised effect against actions-per-minute across the live population. Persistent divergence between the two means the §9.2 execution-difficulty term is miscalibrated — that is the thing to retune, not the individual graphs.
- Material demand curves: reveals which properties are actually valuable, which reveals where the property space is badly shaped.
- Time-to-first-competence: minutes until a new player performs a deliberate multi-system interaction (§12.8). The primary accessibility metric; regressions here block release.
- Preset modification rate: share of players past 10 hours who have edited an ability graph. Below 40% means the presets are too good (R12).
- Death attribution rate: share of players who correctly identify what killed them, sampled by survey. Measures whether §12.8 works.
- Region abandonment rate: measures whether P4 is real.
- Time-to-first-unanticipated-solution for new players: measures whether P2 is real.
- Codex growth rate vs. character power: measures whether P6 is real.

**Balance philosophy:** when something is overpowered, the correct fix is almost always to adjust a *coefficient in a derivation* or a *property in the material table* — never to add a special case. Adding a special case is how this design dies. Enforce this in code review.

---

## 16. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Emergence reads as noise.** Systems interact, but the result is incoherent rather than interesting. | Critical | §6.4 ship gate. Do not proceed past M1 until 20 unanticipated tactical outcomes are demonstrable. If the material table can't produce them, the property axes are wrong — fix them before building anything else. |
| R2 | **Degenerate dominant strategy.** One ability graph or crafting recipe invalidates the space. | Critical | Cost model with superlinear exponents (§9.2) + fuzzer as a build gate from M3. |
| R3 | **Infinite world is uniformly boring.** | High | §7.2 gradients, non-renewables, anomalies. Test P4 directly at M4. |
| R4 | **Browser performance ceiling.** Ambition exceeds what a tab can do. | High | Budgets in §14.2 as build-gate assertions from M0. Cut scope against budgets, not schedule. |
| R5 | **Determinism drift.** Subtle client/server divergence. | High | §14.4, all six rules, enforced from M0. Retrofitting fixed-point is a rewrite. |
| R6 | **Scope explosion.** Systems games are unbounded; "just one more system" is always tempting. | Critical | Non-goals in §3 are contractual. New systems require removing an existing one, or explicit sign-off that the interaction matrix grows meaningfully. |
| R7 | **No onboarding path.** Players bounce in the first 10 minutes because nothing tells them what to do. | Critical | The whole of §12.4–§12.8: presets, deconstruction, badges, feel, the generated starter region, and the death postmortem. Treated as a first-class system with its own milestone gate, not as polish. |
| R12 | **Presets become the meta.** Shipped archetypes are good enough that nobody opens the editor, and the ability system silently collapses into a class list. | High | Hard fuzzer gate: every preset must sit at 0.6–0.75× median effect-per-cost (§12.7). Telemetry alarm if <40% of players past 10 hours have modified a graph. |
| R13 | **Accessibility features fork the simulation.** "Casual mode" behaviours creep into the sim layer as special cases. | High | §12.4 governing rule, enforced in code review: accessibility features are views and data only. The sim crate must contain no reference to player experience level, difficulty, or presentation tier. |
| R8 | **Griefing collapses the population.** | Medium | §11.3 geographic conflict rules. Low-aether world is genuinely safe and genuinely playable. |
| R9 | **SpacetimeDB scaling surprises.** | Medium | Load-test at 500 concurrent by M5. Keep the sim crate host-agnostic so the fallback (§13.3) stays cheap. |
| R10 | **Ecology sim produces extinction cascades or population explosions.** | Medium | Bounded rate equations, migration-driven recovery, telemetry alarms on population derivatives. Do not add hard floors; add slow recovery. |
| R21 | **Thermal (or any other channel) bypasses durability.** A cheap focused graph destroys high-tier equipment without engaging hardness or toughness; high-level play degenerates into phase-racing. | High | §6.3 step 5: volume-proportional latent heat buffers, plus the general per-volume cost parity principle across all destruction channels. Fuzzer searches cost-per-volume-destroyed per channel as its own defect class. |
| R22 | **Streaming boundary exploits.** Aggro dropped by outrunning the instantiation radius; population and yields re-rolled by stepping across it. | High | §10.2 hysteresis band, combat pinning, 60 s collapse cache, and deterministic time-bucketed sampling. The last is the one that actually closes re-rolling. |
| R23 | **The fuzzer optimises for the wrong quantity.** Static effect-per-cost ignores execution difficulty, so players rationally use weaker-but-easier graphs and the balance data misleads the team into nerfing onboarding. | High | §9.2 execution-difficulty term in the cost model itself; effect-per-cost-per-APM as live validation (§15); the hard floor on preset nerfs in §12.7. |
| R24 | **Transcendental cost breaches the tick budget.** | Medium | §14.4 rule 4: budget and instrument call counts, design them out of the hot loop, default to polynomials, LUTs only where profiling justifies them per call site. |
| R17 | **Ability payloads inject unbounded energy.** Conservation holds per-step while the graph as a whole is net-generative, making the exploit invisible to inspection. | Critical | §9.3 two-tier sourcing makes region energy injection structurally bounded. Fuzzer (§9.2) additionally searches for net-positive resource loops as a distinct defect class from effect-per-cost outliers. |
| R18 | **The Surge is a zero-effort griefing tool.** Drain a region, trigger incursion, leave; settled players pay. | Critical | §4.4's four mechanisms — concurrent risk to the extractor, defence cheaper than suppression, provenance-based attribution, claim absorption. Adversarial closed alpha by M4.5; assume the first tuning is wrong. |
| R19 | **Fixed-point cost blows the frame budget.** | High | Corrected in §14.4 — IEEE ops are deterministic in WASM and hardware-fast. Profile both paths at M0 and record the numbers. If the budget still fails, cut §5.2 crowd scope, never the determinism rules. |
| R20 | **Persistence visibly fails in high-traffic areas.** Structures revert in front of their builders. | High | §7.3 two-tier storage: built and claimed things go to a never-evicted Snapshot; only ephemera live in the capped log. |
| R14 | **Nobody has a reason to play.** The simulation works and players idle, then leave. | Critical | All of §4, and P7's 3-minute test. Measure "five things worth doing" (§4.2) in every playtest from M2 onward. This is the #1 risk in the project and it is not a systems problem. |
| R15 | **The Surge reads as a chore treadmill.** Players experience pressure as maintenance tax rather than as frontier. | Critical | Instability must raise *reward* as well as danger (§4.4 step 2). Guardrails: no forced engagement, quiet regions stay quiet, incursion scales to claim density. If playtests show players avoiding extraction to avoid the Surge, the reward slope is wrong — fix the slope, never remove the mechanic. |
| R16 | **Combat feels bad.** The simulation is interesting and the moment-to-moment is floaty. | Critical | §5 as a gated deliverable at M1, owned by a designer with genre experience. Feel is prototyped before systems breadth, not after. |
| R11 | **Art coherence.** Procedurally composed creatures and items look like assembled garbage. | Medium | §12.1 property-derived shading gives coherence for free. Body-plan grammar must be authored by an artist, not an engineer. Budget a dedicated technical artist from M2. |

---

## 17. Roadmap

Milestones are gated on **acceptance criteria**, not dates. Durations assume the team in §18.

### M0 — Foundations (6–8 weeks)
Deterministic fixed-point sim core in Rust/WASM, running in a browser worker. Flat test arena. Three materials. Impulse resolver. No rendering beyond debug primitives.
> **Accept when:** 10,000-tick determinism test passes across client and server builds; transcendental functions are in-crate; COOP/COEP header strategy is settled; a hot object and a cold object exchange heat correctly and the numbers are identical on both hosts.

### M1 — The substrate proves itself (14–18 weeks, iterative)

> **Schedule warning.** v1.0 estimated 8–10 weeks. That was optimistic to the point of being misleading. Early emergent behaviour does not present as "20 useful outcomes" — it presents as physics glitches, degenerate exploits, and results that are technically emergent and practically worthless. Getting from that to a table that produces *useful* outcomes takes iteration on the material table itself. **Budget three full revision cycles of the interaction matrix and plan the schedule around them.** Treat a first-pass failure as expected, not as a signal to weaken the gate.
>
> **Rubric — an outcome counts toward the 20 only if it is:** (a) reproducible, (b) something a player could *plan* in advance rather than stumble into, (c) not an energy or value exploit, and (d) costed sensibly under §9.2. Write these down as they are found; the list becomes the onboarding curriculum in §12.8.

40 hand-authored materials. Full impulse resolution including fracture, phase change, charge discharge, and tag reactions. Basic forms and melee. Single-player, one small hand-made arena. Readout panel (§12.2).
> **Also accept when:** §5.1's commitment model is implemented and a non-team ARPG player, given a weapon and 20 enemies in a bare arena, describes the combat as feeling good. **Feel is gated here, before systems breadth.** If M1 combat is floaty, no later milestone fixes it.
>
> **Accept when:** §6.4 ship gate passes — 20 distinct, useful, unanticipated tactical outcomes, demonstrated to stakeholders, none of which were designed. **If this fails, stop and fix the material table. Do not proceed.**

### M2 — World (10–12 weeks)
Worldgen layers 1–7. Chunk streaming, LOD rings, meshing worker pool. Property-derived shading (§12.1). Delta persistence (§7.3), single-player local.
> **Also accept when:** §4.2's five-things test passes in observed play; §5.4 camera readability verified against charge, heat, and instability states.
>
> **Accept when:** a player can walk 20 km continuously at ≥ 30 fps within §14.2 budgets; felled trees regrow; a mined region stays mined; storage per player-hour is measured and within projection.

### M3 — Fabrication and abilities (10–12 weeks)
Process-based crafting. Ability graph system. Cost model. **Balance fuzzer in CI.** Sockets and cores.
> **Accept when:** fuzzer runs on every commit; top 0.1% of the ability space is within 4× of median effect-per-cost; shipped presets verified at 0.6–0.75× median; a designer has built a working weapon and a working ability without an engineer; blueprint recording and assisted crafting at fixed 0.6 quality are in.

### M4 — Life (10–12 weeks)
Body-plan grammar, utility AI, two-LOD ecology, sensor modalities. Layer 8.
> **Accept when:** overhunting a region measurably crashes its population and its predators respond; a creature is killed by an environmental hazard the player set up; population aggregate ↔ individual handoff is consistent across 100 entry/exit cycles.

### M4.5 — The Surge (6–8 weeks)
Instability scalar, propagation, incursion generation, suppression economy. Layer 9 history generation moved forward from M5 so the premise is discoverable before the mechanic fires.
> **Accept when:** extraction in one region demonstrably produces incursion in a neighbouring settled region; suppression costs 1.3× extracted value; a quiet region left alone stays quiet for 30 simulated days; players in observed play form *ad hoc* groups to suppress without being prompted.

### M5 — Multiplayer (12–14 weeks)
Shards, handoff, interest management, netcode, claims, conflict zones, provenance. Layer 9 history generation.
> **Accept when:** 64 players on one shard within bandwidth and tick budgets; 500 concurrent across shards in load test; a player can identify from world state alone that another player was present and infer what they did (P5).

### M6 — Playable loop and closed alpha (10–12 weeks)
Codex, Lens tiers, economy sinks, onboarding region, trade posts, telemetry pipeline, economy API.
> **Accept when:** median new-player session ≥ 40 minutes; day-7 retention measured; all six pillar tests in §2 pass under observation; **and the onboarding gate below passes.**
>
> **Onboarding gate (measured on ≥ 20 first-time players, no assistance, no documentation):**
> - ≥ 80% perform a deliberate multi-system interaction within 10 minutes.
> - ≥ 80% can correctly state the cause of their first death.
> - ≥ 50% have modified a preset ability graph within 2 hours.
> - Median time to first crafted item ≤ 25 minutes.
>
> If this gate fails, the fix is in §12, never in §6–§11.

**Total to closed alpha: roughly 20–26 months**, revised upward from v1.0's 16–20 after M1 was rescoped to allow for interaction-matrix iteration and M4.5 was added. Treat any estimate below 18 months as a scoping error. M1 is still where the game either exists or doesn't, and it is still the milestone most likely to overrun even after the revision.

---

## 18. Team

Minimum viable composition:

| Role | Count | Notes |
|---|---|---|
| Simulation engineer (Rust) | 2 | Owns the sim crate, determinism, impulse resolution |
| Graphics engineer | 1 | Rendering, meshing, LOD, property-derived shading |
| Backend/network engineer | 1 | Shards, netcode, persistence, SpacetimeDB |
| Tools/pipeline engineer | 1 | Data schemas, hot reload, fuzzers, telemetry — **this role is not optional in a data-driven design** |
| Systems designer | 2 | Material table, cost model, worldgen tuning. The material table is a full-time job. |
| Technical artist | 1 | Body-plan grammar, form geometry, shader authoring |
| Technical audio designer | 1 | **Not optional.** §12.6 makes procedural audio roughly half the legibility engine; with thousands of runtime materials there is no sample library, so impact/strain/fracture/phase audio must be synthesised from material properties. A game with no tooltips and no authored content cannot also have no sound design. |
| Generalist / QA | 1 | Determinism testing, playtest coordination |

**10 people.** Fewer is possible, but the tools engineer, one systems designer, and the audio designer are load-bearing; cutting them converts this design into a normal game with extra steps and no feedback.

---

## 19. Open questions the team must resolve

Stated honestly rather than papered over. Each needs a decision before the milestone noted.

1. ~~Camera and control scheme.~~ **Resolved in §5.4** (third-person, high angled, with a hard readability requirement). Prototype at M1 to confirm; the readability constraint is the part that must not be traded away.
2. **Time scale.** How fast do days pass, how fast do ecologies recover, how fast do deltas decay? These must be consistent with each other and with a 30–90 minute session. **Resolve in M2.**
3. **Death penalty outside high-aether zones.** §11.3 covers item loss, but not time loss or attunement loss. **Resolve in M5.**
4. **How much of layer 9 (history) is legible?** Now higher stakes: layer 9 carries the premise (§4.3) and pre-teaches the Surge, so uninterpretable ruins are not just set dressing, they are a failed narrative delivery system. Likely needs a generated readable-artifact layer (inscriptions, extraction records, drained strata that visibly *were* rich). **Resolve in M4.5**, moved forward from M5.
5. **Body-plan grammar expressiveness vs. animation cost.** Fully procedural bodies need procedural animation, which is expensive and often looks bad. Likely answer: constrain the grammar to a fixed set of skeletal topologies with variable proportions and materials. **Resolve in M4**, and expect this to be the biggest compromise in the project.
6. **Whether the aether field can carry this much weight.** It now determines material rarity, ability cost, PvP rules, creature distribution, difficulty curve (§4.7), *and* the motivation engine (§4.4). That is either elegant unification or a single point of failure, and the difference is whether players read it as one coherent thing. **Watch from M2 onward; this is the design's central bet.**

8. **Surge thresholds and timescales.** T1, T2, decay rate, propagation speed, and the 1.3× suppression ratio are stated as starting values with no empirical basis. They determine whether the game feels like a frontier or a chore and they can only be found by playing. **Budget a full tuning pass at M4.5 and expect to retune after every population change.**
7. **Renderer.** Babylon is recommended (§14.1) but the call is close. Make it in M0 and keep the sim crate clean so it stays reversible.

---

## Appendix A — Minimum system interaction matrix

Every cell must be non-empty at M4. If a cell is empty, the two systems are not really interacting and one of them is decoration.

Note: a seventh implicit column, **Motivation (§4)**, must draw on every row — if a system does not feed a reason to act, it is not finished.

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
