# pathclone

Two projects share this repository.

- **`sim/` + `data/` + `arena.html` — the substrate.** Milestones M0 and M1 of
  the systemic sandbox ARPG specified in [`docs/DESIGN.md`](docs/DESIGN.md): a
  deterministic fixed-point simulation core, a hand-authored material table, and
  the impulse resolver that turns the two into gameplay. This is the newer work
  and the rest of this file is about it.
- **`src/` (everything outside `src/substrate/`) — Cinderfall.** A complete
  browser ARPG in the Path of Exile 2 mould. It is unrelated to the substrate and
  is summarised at the bottom.

---

## The substrate

`docs/DESIGN.md` specifies a game with **no content database** — no item list,
no bestiary, no spell list. Every sword, creature and effect is meant to fall out
of a material simulation meeting an impulse resolver. The document is a 16–20
month plan for nine people, and it is unusually clear about what has to exist
first:

> **§4.4 ship gate:** before any content work begins, the team must be able to
> demonstrate 20 distinct, useful, unanticipated tactical outcomes produced
> solely by the material table and the impulse resolver in a bare test arena.
>
> **§15 M1:** If this fails, stop and fix the material table. **Do not proceed.**

So that is what is built here: M0 and M1, and the gate between M1 and everything
else. Worldgen, crafting, abilities, ecology and multiplayer are **not** built —
see [What is deliberately absent](#what-is-deliberately-absent).

### Run it

```bash
npm install
npm run sim:build      # cargo -> wasm32, copied to public/sim.wasm
npm run dev            # then open /arena.html
```

`npm run check` runs everything the design gates on, in order:

```
data:validate   schemas and referential integrity (§12.5)
sim:build       the simulation crate, for the browser
data:pack       JSON -> the packed blobs both hosts read
gate            the 20 ship-gate outcomes (§4.4)
fuzz            energy-generating cycles and property space (§13)
sim:test        native acceptance suite
determinism     wasm32 vs x86-64, 10,000 ticks (§12.4 rule 6)
```

### The one idea

There is no damage type. §4.3 says to delete the enum, and it is deleted: a
sword hit, a fall, a thrown flask, a lightning arc and standing near lava all
enter the simulation as the same seven numbers.

```rust
struct Impulse {
    kinetic:      Fx,  // energy transferred mechanically
    contact_area: Fx,  // small area + high kinetic = penetration; large = blunt trauma
    thermal:      Fx,  // may be negative
    charge:       Fx,  // electrical / aetheric
    corrosive:    Fx,  // chemical potential
    reagent:      TagSet,
    aether_flux:  Fx,
}
```

Everything downstream is that packet meeting a row in `data/materials.json`.
There is no material code — `sim/src/material.rs` contains no material names, no
`match` on a material id, and no constant that means anything about a specific
substance.

### The gate

```
$ npm run gate

  ✓ freeze then shatter
      chill a body past its solidify point and it becomes a different material —
      brittle enough that a hammer blow which merely bruised it now breaks it apart
      warm flesh: 0.290 integrity lost, fractured=false. chilled to -48.7 ->
      frozen_flesh, same blow: fractured=true into 5 pieces
  ...
  20 of 20 claims held

  GATE OPEN. 20 outcomes demonstrated, none of them implemented.
```

The twenty live in `sim/src/scenarios.rs`. Each sets up a bare arena, does
something, and checks a claim, reporting the numbers it saw. They run three ways
from that one source — in CI via `tools/shipgate.ts`, natively via
`cargo test`, and in the browser arena — so what a stakeholder watches is
literally the thing the build checks.

What matters is the word *unanticipated*. Nothing in the crate implements
freezing-then-shattering, chain lightning, fire spreading, armour softening in a
fire, salt water as a weapon, or grinding an edge until the blade melts. Each is
`materials.json` meeting `impulse.rs`:

| Outcome | Where it actually comes from |
|---|---|
| Freeze a body, then shatter it | `flesh` has a `solidify` point; `frozen_flesh` has 1/12th the toughness |
| A hammer beats chitin armour it cannot dent | chitin's toughness is 0.09, and a wide contact area engages the whole plate |
| A spear goes through steel plate | the same energy through a tenth of the area |
| The sharpest blade in the game explodes on a rock | obsidian's toughness is 0.04, and the blow comes back into it |
| Fire spreads between separate objects | ignition releases more heat than it took to start, and heat radiates |
| Salt and water freeze someone solid | one endothermic reaction, sitting against the skin |
| Acid lights a woodpile | quicklime formation is exothermic |
| Armour in a fire stops protecting | hardness falls toward the melting point |
| Sharpening a hoarfrost quartz blade destroys it | friction makes heat; the blade melts at 45° |
| A worn blade stops cutting and starts bruising | contact area grows as the edge dulls |

Two of the twenty are not tactical outcomes but invariants the design names
explicitly: fragments of a shattered object are ordinary entities carrying their
share of the heat, and a bomb, a fire, an arc chain and a hammer running together
for 400 ticks never produce a joule that was not injected or released.

### Determinism

§12.4 makes bit-identical simulation a hard requirement and calls platform
transcendentals "the single most common source of cross-platform desync". So the
crate implements its own `sqrt`, `exp`, `ln`, `pow`, `sin` and `cos` in Q32.32
fixed point, has zero dependencies, iterates only stable-ordered containers, and
seeds a PRNG per entity.

`npm run determinism` runs the same seeded 10,000-tick scenario on **wasm32
under a JavaScript engine** and on **x86-64 native** — different code
generators, different everything except the arithmetic — and compares state
hashes at ten checkpoints.

```
  ✓ tick   10000  wasm aa330a2b1b970758  native aa330a2b1b970758

  IDENTICAL — wasm32 and x86-64 agree on every checkpoint.
```

Both hosts read the *same packed bytes*, not their own copy of the JSON: a
determinism test where each host parses its own input is testing two parsers.

### The fuzzer

§4.3 names energy-generating loops as "the #1 exploit vector in this design" and
§13 asks for a fuzzer that hunts them. `npm run fuzz` does not sample for them —
it decides the question. Every phase transition and reaction is an edge in a
directed graph over materials carrying a known energy per unit volume; a cascade
can only run forever if that graph has a cycle, and can only *pay* if the cycle
sums positive. So it enumerates the cycles and adds them up.

It found four paying cycles on its first run. Per §13's own instruction — "adjust
a coefficient in a derivation or a property in the material table — never add a
special case" — the fix was four numbers in `data/materials.json`.

It also reports the hardness/toughness correlation §4.2 expects to be negative
(it is, at −0.19), names the deliberate anticorrelated outlier, and flags
materials no player would ever pick.

### The interaction matrix

`npm run matrix` prints the §4.4 spreadsheet as behaviour, so tuning is "read the
matrix, change a number, read it again" rather than "play for an hour and form an
impression".

```
                  flesh  frozen chitin cold_i meteor granit obsidi
  iron sword      0.26    brk1    0.03   0.01     -      -      -
  obsidian sword  brk2    brk2!   brk1!  0.07!  0.01!  0.11!  brk1!
  meteoric sword  0.26    brk1    0.03   0.01     -      -      -
  iron spear      brk5    brk5    brk5!  brk1!  0.20!  brk3!  brk5!
  iron maul       0.10    brk5    brk3     -      -     brk1   brk5
                                                    ! = the weapon broke too
```

Every weapon has a niche readable off two material columns, and nobody balanced
any of it. The iron sword is the dependable all-rounder; obsidian hits twice as
hard and destroys itself against nine of thirteen targets; meteoric steel does
identical damage to iron and simply never breaks; the spear defeats plate and
snaps its point doing it; the maul does almost nothing to flesh and shatters
everything brittle. A lead maul is strictly worse than an iron one, because
delivered energy peaks at an intermediate mass — so the best blade material for a
given wielder is a discovery rather than "pick the densest".

### The arena

`/arena.html` is §4.4's bare test arena and §15 M1's Readout panel.

- Run any of the twenty outcomes, or all of them, and watch what happened.
- Place materials, heat and chill and charge and douse them, swing weapons made
  of anything at anything, and step or run the clock.
- Every surface is coloured by §10.1's derivation: hue from class, roughness from
  hardness, metallic from conductivity, emission from temperature, an arc rim
  from charge, translucency from aether permeability, wear from integrity.
  Nothing reads a material *name*, which is what will make generated materials
  look coherent with no art pass.
- The Readout prints what the resolver did in physical quantities — energy
  absorbed, stress applied, thresholds crossed, volume converted. §10.3 is
  emphatic that hiding the numbers is how this kind of game dies, so there is no
  DPS number anywhere in the project.

Rendering is 2D canvas on purpose: §15 M0 says "no rendering beyond debug
primitives", §17 leaves the renderer undecided, and §12.1 requires that the
choice stay reversible — which it only does while nothing above the substrate
assumes one.

### Layout

```
docs/DESIGN.md          the specification this implements
sim/                    the simulation crate — zero dependencies, no I/O
  src/fixed.rs          Q32.32 and in-crate transcendentals (§12.4)
  src/material.rs       L1, matter — data only, no material code (§4.2)
  src/impulse.rs        L2, the seven-step resolver (§4.3)
  src/body.rs           L3, assemblies of parts (§4.1)
  src/form.rs           L3, forms and derived statistics (§6.1)
  src/ecs.rs            entities as component compositions (§4.1)
  src/sim.rs            the tick: conduction, radiation, charge, phase
  src/scenarios.rs      the twenty ship-gate outcomes (§4.4)
  src/abi.rs            hand-written C ABI over wasm — no wasm-bindgen
  tests/acceptance.rs   the M0/M1 acceptance criteria as tests
data/                   materials, forms, rules, and their JSON Schemas (§12.5)
src/substrate/          the host: packer, wasm wrapper, appearance, arena
tools/                  gate, fuzzer, determinism, matrix, validator, packer
```

### Deviations from the specification

Four, each because the document asks for a consequence its stated rule cannot
produce. They are marked in the code where they occur.

1. **A fourth phase transition, `solidify`.** §4.2 lists `melt`, `boil` and
   `ignite`, all crossings on the way *up*; nothing in that schema can express a
   substance getting colder. §4.3's own worked example — freezing a creature to
   make it brittle — requires it. Purely additive.
2. **A second fracture route.** §4.3 step 3 defines fracture in terms of stress
   alone, but promises two paragraphs later that a maul "doesn't penetrate but
   transfers enough energy to fracture brittle armour". A large contact area is
   exactly what keeps stress low, so a stress test cannot produce that. Blunt
   fracture is energy density past toughness, scaled by how much of the part the
   impact engaged.
3. **A latent-heat plateau.** Materials either side of a transition have
   different heat capacities, so instantaneous conversion makes a hysteresis loop
   into a heat engine — the exploit §4.3 warns about, built into the physics. A
   part now holds at its threshold while latent energy banks up, and melting
   costs exactly what freezing returns.
4. **Radiant transfer between entities.** Conduction along an assembly graph
   cannot carry a fire from a burning tree to the wolf beside it, which §4.3
   promises. Symmetric, so it moves energy and never makes it.

`hoarfrost_quartz` also keeps every value from §4.2's worked example except its
melt point: the document's −20 makes it a liquid at any habitable temperature,
which is not what the surrounding prose describes.

### What is deliberately absent

Everything above M1. There is no worldgen (§5), no crafting processes (§6.2), no
ability graphs (§7), no creatures or ecology (§8), no claims, economy or
multiplayer (§9, §11), and no persistence (§5.3). §15 M1 forbids starting any of
it until the gate passes, and the gate only passed a few commits ago.

Two things exist as stubs so that later work is a change of consumer rather than
a change of rule: `Rules::aether_density` carries §5.1's layer 5 without a field
behind it yet, and `formation` blocks are validated in `materials.json` but not
packed into the simulation.

The design also asks for balance fuzzing over the ability graph space (§7.2) and
the crafting space (§13). Neither exists to fuzz. The material fuzzer that does
exist is built so those become additional passes rather than a new tool.

---

## Cinderfall

A browser action RPG built from scratch in TypeScript, mechanically inspired by
Path of Exile 2: a real 3D perspective scene (Three.js), six classes with dual
ascendancies, a large procedurally generated passive tree, gem-slots-on-the-skill
itemization, full affix-driven equipment with a PoE-style currency system,
resistances/armor/evasion/energy shield, status ailments, and a hub town with
waypoint travel across three procedurally generated acts. All art is original
procedural geometry.

`npm run dev`, then open `/` rather than `/arena.html`.

- `WASD` move (`Shift` sprint) · mouse aim · `LMB`/`MMB`/`RMB`/`Q`/`E`/`R`/`T`
  skills · `1`/`2` flasks · `Space` dodge · `I` inventory · `P` passive tree ·
  `C` character · `Esc` pause

Note that Cinderfall is, by design, everything `docs/DESIGN.md` §3 lists as an
anti-requirement — a class system, a skill tree, a named item list, an affix
database. The two projects are not on a path to meet; they are in the same
repository, not in the same game.
