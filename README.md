# substrate

Milestones **M0** and **M1** of the systemic sandbox ARPG specified in
[`docs/DESIGN.md`](docs/DESIGN.md): a deterministic simulation core, a
hand-authored material table, the impulse resolver that turns the two into
gameplay, and a small hand-made arena you can walk around in and hit things
with.

```bash
npm install
npm run sim:build      # cargo -> wasm32, copied to public/sim.wasm
npm run dev            # WASD, mouse aim, click to swing, space to dodge
```

`npm run check` runs everything the design gates on:

```
data:validate   schemas and referential integrity (§14.5)
sim:build       the simulation crate, for the browser
data:pack       JSON -> the packed blobs both hosts read
gate            the 20 ship-gate outcomes (§6.4)
fuzz            energy-generating cycles and property space (§15)
sim:test        native acceptance suite
determinism     wasm32 vs x86-64, 10,000 ticks (§14.4 rule 9)
```

---

## What this is

`docs/DESIGN.md` specifies a game with **no content database** — no item list,
no bestiary, no spell list. Every sword, creature and effect is meant to fall
out of a material simulation meeting an impulse resolver. It is a 16–20 month
plan for nine people, and it is unusually clear about what has to exist first:

> **§6.4 ship gate:** before any content work begins, the team must be able to
> demonstrate 20 distinct, useful, unanticipated tactical outcomes produced
> solely by the material table and the impulse resolver in a bare test arena.
>
> **§17 M1:** If this fails, stop and fix the material table. **Do not proceed.**

So that is what is built: M0, M1, and the gate between M1 and everything else.
Worldgen, crafting, abilities, ecology and multiplayer are **not** built — see
[What is deliberately absent](#what-is-deliberately-absent).

## The one idea

There is no damage type. §6.3 says to delete the enum, and it is deleted: a
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

## The arena

`npm run dev` opens the §17 M1 slice: *"basic forms and melee, single-player,
one small hand-made arena, Readout panel."*

You are an entity with a `Body`, `Effectors`, `Locomotion` and `Agency`.
Nothing marks you as the player — §6.1 forbids it — except that a keyboard
writes your intent where a utility evaluator will write a wolf's at M4. There is
no health bar, because there is no health: parts deform, fracture, melt, freeze,
corrode and burn, and a Readout tells you which.

| | |
|---|---|
| `WASD` | move — top speed falls with everything you carry |
| mouse | aim; a swing only reaches what is in front of you |
| click | swing (hold to keep swinging) |
| `Space` | dodge — 350 ms, with i-frames in the middle of it |
| `1`–`9`, `Q`/`E` | change weapon |
| shift-click | inspect a part with the Lens |
| `R` | reset the arena |

A swing is a commitment (§5.1). The ring around you fills through a windup you
can no longer stop, flashes through the active frames where the blow resolves,
and drains through a recovery you are stuck in until it is 40% spent. All three
lengths come from the mass of the weapon you happen to be holding, so an absurd
maul feels absurd without anyone tuning it. A press made during recovery is
queued and fires on the first legal tick; a press made during the windup is
not, and expires.

A fracture stops time for two to five frames and shakes the camera, both scaled
by the kinetic energy the blow actually transferred (§12.6). A glancing blow
does neither. The scale comes from the resolver, so a maul lands heavier on
screen for the same reason it lands heavier in the simulation — the sword gets
two frames against the flesh dummy and the maul gets four. Nothing is authored
per weapon, and the stop holds the wall clock rather than the tick, so
determinism is untouched.

South of the rack stands §5.2's crowd: **14 trivial, 5 notable, 1 elite**, which
is the composition the design asks for and the subject of §17 M1's feel gate.
The tiers differ in one thing — how many parts the body has. A trivial target is
one lump of one aggregate material, a notable is a three-part assembly, an elite
is a full seven-part one, and the *same* impulse resolver runs over all three.
Freeze-then-shatter works identically on the one-part body and the seven-part
one, which is asserted as a test rather than claimed here. There is no tier
field anywhere in the simulation.

They are targets, not enemies: agency is §10.3 and arrives at M4.

Six training dummies differ in exactly one thing: what their target slot is
made of. Walk between them with the same weapon and the substrate teaches
itself.

- The **iron sword** cuts flesh apart in three or four blows and cannot mark
  chitin or plate.
- The **iron maul** barely bruises flesh, cannot dent a chitin plate, and
  shatters it anyway — energy density past toughness, which is the only way
  §6.3's promise can work, since a wide contact area is what keeps stress low.
- The **obsidian sword** hits twice as hard as iron and explodes against
  granite, because the blow comes back into it.
- The **meteoric sword** does identical damage to iron and simply never breaks.
  Two materials that both read as "very hard"; the difference is one visible
  number.
- The **iron spear** reaches 2.4 units and goes through steel plate, at the
  point's risk.
- The **lead maul** is heavier, slower and worse at everything, because
  delivered energy peaks at an intermediate mass.

The arena also holds a magma pool, an ice block, a water trough, a charged
stormcrystal with copper posts beside it, pitchwood logs, a saltpetre pile, a
chalkstone block and a heap of rime salt — every reagent the twenty ship-gate
outcomes use, reachable on foot. Carry the quartz sword near the magma and it
melts and then boils away, and you are unarmed. Nobody implemented that.

The whole arena is `data/arena.json`: a player, a weapon rack and a list of
props at coordinates. There is no level format, because in a game with no
content database that is all a place can be.

## The gate

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
from that one source — in CI via `tools/shipgate.ts`, natively via `cargo test`,
and from the panel at the bottom of the arena page — so what a stakeholder
watches is literally the thing the build checks.

What matters is the word *unanticipated*. Nothing in the crate implements
freezing-then-shattering, chain lightning, fire spreading, armour softening in a
fire, salt water as a weapon, or grinding an edge until the blade melts:

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
share of the heat, and a bomb, a fire, an arc chain and a hammer running
together for 400 ticks never produce a joule that was not injected or released.

## Determinism

§14.4 makes bit-identical simulation a hard requirement and calls platform
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

## The fuzzer

§6.3 names energy-generating loops as "the #1 exploit vector in this design" and
§15 asks for a fuzzer that hunts them. `npm run fuzz` does not sample for them —
it decides the question. Every phase transition and reaction is an edge in a
directed graph over materials carrying a known energy per unit volume; a cascade
can only run forever if that graph has a cycle, and can only *pay* if the cycle
sums positive. So it enumerates the cycles and adds them up.

It found four paying cycles on its first run. Per §15's own instruction — "adjust
a coefficient in a derivation or a property in the material table — never add a
special case" — the fix was four numbers in `data/materials.json`.

It also reports the hardness/toughness correlation §6.2 expects to be negative
(it is, at −0.19), names the deliberate anticorrelated outlier, and flags
materials no player would ever pick.

## The interaction matrix

`npm run matrix` prints the §6.4 spreadsheet as behaviour, so tuning is "read the
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
any of it.

## Layout

```
docs/DESIGN.md          the specification this implements
sim/                    the simulation crate — zero dependencies, no I/O
  src/fixed.rs          Q32.32 and in-crate transcendentals (§14.4)
  src/material.rs       L1, matter — data only, no material code (§6.2)
  src/impulse.rs        L2, the seven-step resolver, and melee (§6.3, §8.1)
  src/body.rs           L3, assemblies of parts (§6.1)
  src/form.rs           L3, forms and derived statistics (§8.1)
  src/ecs.rs            entities as component compositions (§6.1)
  src/sim.rs            the tick: agency, locomotion, conduction, phase, charge
  src/scenarios.rs      the twenty ship-gate outcomes (§6.4)
  src/abi.rs            hand-written C ABI over wasm — no wasm-bindgen
  tests/acceptance.rs   the M0/M1 acceptance criteria as tests
data/                   materials, forms, rules, the arena, and their schemas
src/substrate/          the host: packer, wasm wrapper, appearance, arena page
tools/                  gate, fuzzer, determinism, matrix, validator, packer
```

## Deviations from the specification

Five, each because the document asks for a consequence its stated rule cannot
produce. They are marked in the code where they occur.

1. **A fourth phase transition, `solidify`.** §6.2 lists `melt`, `boil` and
   `ignite`, all crossings on the way *up*; nothing in that schema can express a
   substance getting colder. §6.3's own worked example — freezing a creature to
   make it brittle — requires it. Purely additive.
2. **A second fracture route.** §6.3 step 3 defines fracture in terms of stress
   alone, but promises two paragraphs later that a maul "doesn't penetrate but
   transfers enough energy to fracture brittle armour". A large contact area is
   exactly what keeps stress low, so a stress test cannot produce that. Blunt
   fracture is energy density past toughness, scaled by how much of the part the
   impact engaged.
3. **A latent-heat plateau.** Materials either side of a transition have
   different heat capacities, so instantaneous conversion makes a hysteresis loop
   into a heat engine — the exploit §6.3 warns about, built into the physics. A
   part now holds at its threshold while latent energy banks up, and melting
   costs exactly what freezing returns.
4. **Radiant transfer between entities.** Conduction along an assembly graph
   cannot carry a fire from a burning tree to the wolf beside it, which §6.3
   promises. Symmetric, so it moves energy and never makes it.
5. **A separation pass.** §3 lists rigid-body physics as a non-goal, and there
   is none — but without something keeping two bodies out of each other, melee
   reach cannot mean anything. Overlap is resolved without momentum, friction or
   rotation, and only entities that can move are moved.

`hoarfrost_quartz` also keeps every value from §6.2's worked example except its
melt point: the document's −20 makes it a liquid at any habitable temperature,
which is not what the surrounding prose describes.

## What is deliberately absent

Everything above M1. There is no worldgen (§7), no crafting processes (§8.2), no
ability graphs (§9), no creatures, ecology or AI (§10), no claims, economy or
multiplayer (§11, §13), and no persistence (§7.3). §17 M1 forbids starting any of
it until the gate passes.

The crowd does not fight back, and calling it "20 enemies" would be a lie —
§10.3's utility AI is M4 work and faking it early would make the feel gate
measure the fake. What it does carry is §5.2's actual subject: fidelity LOD in
the body, never in the resolver.

The melee layer is deliberately thin: reach, a facing arc, §5.1's three phases
and a dodge. There is no combo system, no stamina, no attack animation state
machine and no hit-location table — the part a blow lands on is drawn from the
target's own volumes, and severing an arm matters because of what the arm was
made of. The weapon's pose on screen is a pure function of the phase and how far
through it is, so there is no animation state to keep in sync with the
simulation; there is nothing but the simulation.

Two things exist as stubs so later work is a change of consumer rather than a
change of rule: `Rules::aether_density` carries §7.1's layer 5 without a field
behind it yet, and `formation` blocks are validated in `materials.json` but not
packed into the simulation.

The design also asks for balance fuzzing over the ability graph space (§9.2) and
the crafting space (§15). Neither exists to fuzz. The material fuzzer that does
exist is built so those become additional passes rather than a new tool.
