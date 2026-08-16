# Cinderfall

A browser-playable action RPG built from scratch in TypeScript, mechanically inspired by
Path of Exile 2: a real 3D perspective scene (Three.js — not a flat isometric sprite grid),
six classes with dual ascendancies, a large procedurally generated passive skill tree,
gem-slots-on-the-skill itemization with uncut skill/support gems found as loot, full
affix-driven equipment with a PoE-style crafting currency system, resistances/armor/evasion/
energy shield, status ailments, a hub town with waypoint travel across three procedurally
generated acts, and a boss at the end of each. All art is original procedural geometry (no
copyrighted assets, no external model/texture files) — there is no game-engine dependency
beyond the Three.js rendering library.

## Run it

```bash
npm install
npm run dev      # dev server
npm run build    # production build to dist/
npm run preview  # serve the production build
```

## Controls

- `WASD` — move, hold `Shift` while moving to sprint (skills are disabled while sprinting)
- Mouse — aim; left-click an item, portal, waypoint or the stash crate to interact with it
  (your character walks over automatically)
- `LMB` / `MMB` / `RMB` / `Q` / `E` / `R` / `T` — the 7 skill slots
- `1` / `2` — Life Flask / Mana Flask (the only two flask slots, matching PoE2)
- `Space` — dodge roll (brief invulnerability)
- `I` — inventory / stash / crafting / gems / character sheet
- `P` — passive skill tree
- `C` — character sheet
- `Escape` — close a panel, or open the pause menu (which lists all of this) if none is open

## What's actually implemented

- **Rendering**: a real perspective 3D scene (Three.js) — instanced ground/wall geometry per
  zone, procedurally rigged capsule-and-sphere creatures with facing/movement animation, fog,
  lighting, and world-space item/boss labels — driven by a 2D top-down simulation underneath
  (movement, collision and AI stay simple and fast; only the presentation layer is 3D).
- **Interaction**: nothing auto-triggers by walking over it. Ground items, zone portals, the
  waypoint and the stash all require a left-click, after which your character walks over and
  interacts automatically — cancel any time by moving with WASD.
- **Main menu & characters**: a title screen, a character-select screen listing every saved
  character (name, class, level) with delete, and a name-entry step during creation. Up to 8
  characters can be saved at once, independently, each with their own full save.
  `Esc` opens a real pause menu that halts the simulation.
- **Classes**: Warrior, Monk, Ranger, Sorceress, Witch, Mercenary — each with two ascendancies
  (6-node linear specialization trees unlocked at level 10).
- **Passive tree**: procedurally generated radial web (~440 nodes) with small passives,
  notables, and 14 keystones with real mechanical effects (Iron Reflexes, Resolute Technique,
  Chaos Inoculation, Avatar of Fire, Blood Magic, Acrobatics, etc.), full allocate/respec with
  cascade-deallocation.
- **Gems**: skill and support gems are found as Uncut Skill/Support Gems (loot drops), then
  socketed into one of your 7 skill slots (or a skill's 2 support sockets) and cut into a
  specific skill/support at that point — gems live on your skill-slot panel, not on your gear,
  matching PoE2's redesign. 20 active skills across 5 damage types and 14 support gems.
- **Items**: ~45 equipment bases across weapons/armor/jewellery, a full affix pool with
  prefixes/suffixes, rarity tiers (normal/magic/rare/unique), 6 unique items, and 7 currency
  orbs (Transmutation/Alteration/Augmentation/Regal/Chaos/Alchemy/Exalted) that transform
  items exactly like their PoE counterparts. Drag-and-drop grid inventory (12×5), equipment
  paperdoll, and a stash that's only reachable by walking up to and clicking its crate in town.
- **Combat**: layered flat/increased/more damage scaling, armor mitigation curve, evasion vs.
  accuracy hit rolls, crit, life/mana/energy-shield (with the ES-before-life and
  chaos-bypasses-ES rules), 6 status ailments (ignite, chill, freeze, shock, poison, bleed).
- **World**: a hand-authored hub town plus 3 acts (9 zones total incl. 3 bosses), each field/
  dungeon zone procedurally carved fresh on every visit; monster AI (melee/ranged/caster),
  minions, loot tables, XP/leveling to 100.

## What's intentionally out of scope

This is an original engine and ruleset *inspired by* PoE2's systems, not a byte-for-byte
clone — it doesn't and can't include Grinding Gear Games' sculpted character models, textures,
audio, trademarked names, or exact numeric balance (creatures here are procedural
capsule-and-sphere rigs, not artist-made models), and it skips multiplayer/trading and some
later-game systems (full atlas endgame, etc.) to stay buildable as a single cohesive project.
