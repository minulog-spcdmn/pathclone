# Cinderfall

A browser-playable action RPG built from scratch in TypeScript, mechanically inspired by
Path of Exile 2: isometric real-time combat, six classes with dual ascendancies, a large
procedurally generated passive skill tree, tag-based skill/support gems, full affix-driven
itemization with a PoE-style crafting currency system, resistances/armor/evasion/energy
shield, status ailments, a hub town with waypoint travel across three procedurally
generated acts, and a boss at the end of each. All art is original vector/geometric
rendering (no copyrighted assets) drawn on an isometric Canvas2D engine — there is no
game-engine dependency.

## Run it

```bash
npm install
npm run dev      # dev server
npm run build    # production build to dist/
npm run preview  # serve the production build
```

## Controls

- `WASD` — move
- Mouse — aim
- Left click / `1`, Right click / `2`, `3`, `4` — cast skill slots
- `Space` — dodge roll (brief invulnerability)
- `5`–`8` — use flasks
- `I` — inventory / stash / crafting / gems / character sheet
- `T` — passive skill tree
- `C` — character sheet
- `Escape` — close panels

## What's actually implemented

- **Classes**: Warrior, Monk, Ranger, Sorceress, Witch, Mercenary — each with two ascendancies
  (6-node linear specialization trees unlocked at level 10).
- **Passive tree**: procedurally generated radial web (~440 nodes) with small passives,
  notables, and 14 keystones with real mechanical effects (Iron Reflexes, Resolute Technique,
  Chaos Inoculation, Avatar of Fire, Blood Magic, Acrobatics, etc.), full allocate/respec with
  cascade-deallocation.
  Deallocation properly cascades to orphaned nodes.
- **Skills**: 20 active skill gems (melee, projectile, nova, ground AoE, summon, dash, buff)
  across 5 damage types, tag-gated by attribute requirements; 14 support gems that modify
  damage/cost/behavior, mirroring PoE2's gem-slots-on-the-skill (not on-the-item) design.
- **Items**: ~45 item bases across weapons/armor/jewellery/flasks, a full affix pool with
  prefixes/suffixes, rarity tiers (normal/magic/rare/unique), 6 unique items, and 7 currency
  orbs (Transmutation/Alteration/Augmentation/Regal/Chaos/Alchemy/Exalted) that transform
  items exactly like their PoE counterparts. PoE-accurate grid inventory (12×5) with
  variable-size items.
- **Combat**: layered flat/increased/more damage scaling, armor mitigation curve, evasion vs.
  accuracy hit rolls, crit, life/mana/energy-shield (with the ES-before-life and
  chaos-bypasses-ES rules), 6 status ailments (ignite, chill, freeze, shock, poison, bleed).
- **World**: a hand-authored hub town plus 3 acts (9 zones total incl. 3 bosses), each field/
  dungeon zone procedurally carved fresh on every visit; monster AI (melee/ranged/caster),
  minions, loot tables, XP/leveling to 100.
- **Persistence**: full character save/load via `localStorage`.

## What's intentionally out of scope

This is an original engine and ruleset *inspired by* PoE2's systems, not a byte-for-byte
clone — it doesn't and can't include Grinding Gear Games' art, audio, trademarked names, or
exact numeric balance, and it skips multiplayer/trading and some later-game systems (uncut
gems, full atlas endgame, etc.) to stay buildable as a single cohesive project.
