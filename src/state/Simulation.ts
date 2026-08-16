import { Camera } from '../engine/Camera.ts';
import { Input } from '../engine/Input.ts';
import { Rng, hashSeed } from '../engine/Random.ts';
import type { Vec2 } from '../engine/Vec2.ts';
import { angleTo, distance } from '../engine/Vec2.ts';
import { Player, xpForLevel } from '../entities/Player.ts';
import { Monster } from '../entities/Monster.ts';
import { Minion, MINIONS } from '../entities/Minion.ts';
import { Projectile } from '../entities/Projectile.ts';
import type { HitInstance } from '../entities/Projectile.ts';
import { ItemDrop } from '../entities/ItemDrop.ts';
import { GroundEffect } from '../entities/GroundEffect.ts';
import type { Entity, Team } from '../entities/Entity.ts';
import { ZONES } from '../data/zones.ts';
import { generateZone } from '../world/ZoneGenerator.ts';
import type { Zone } from '../world/Zone.ts';
import { MONSTERS } from '../data/monsters.ts';
import { SKILLS } from '../data/skills.ts';
import type { PassiveTree } from '../data/passiveTree.ts';
import { ASCENDANCY_NODES } from '../data/ascendancyTree.ts';
import { mergeStats, stat } from '../core/types.ts';
import type { StatMap } from '../core/types.ts';
import { computeDerived } from '../core/stats.ts';
import type { DefenseProfile } from '../systems/Combat.ts';
import { resolveHit } from '../systems/Combat.ts';
import { maybeApplyAilments, tickStatusEffects } from '../systems/StatusEffects.ts';
import { castSkill, getSkillManaCost } from '../systems/SkillExecution.ts';
import type { SkillContext } from '../systems/SkillExecution.ts';
import { rollMonsterLoot } from '../systems/Loot.ts';
import { ITEM_BASES } from '../data/items.ts';
import type { ZoneExit } from '../world/Zone.ts';

export interface FloatingText {
  pos: Vec2;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  vy: number;
  crit: boolean;
  fromPlayer: boolean;
  drift: number;
}

const DAMAGE_TEXT_COLORS: Record<string, string> = {
  physical: '#f2ece0',
  fire: '#ff8a4a',
  cold: '#8ad8ff',
  lightning: '#ffe87a',
  chaos: '#d08aff',
};

export interface Toast {
  text: string;
  life: number;
}

/** One-shot visual effect requests drained by the renderer each frame. */
export interface VfxEvent {
  kind: 'impact' | 'melee_arc' | 'nova';
  pos: Vec2;
  radius: number;
  color: string;
  facing: number;
}

export type HoverTarget =
  | { kind: 'drop'; drop: ItemDrop }
  | { kind: 'exit'; exit: ZoneExit }
  | { kind: 'stash'; pos: Vec2 }
  | { kind: 'waypoint'; pos: Vec2 };

interface PendingInteraction {
  targetPos: Vec2;
  radius: number;
  action: () => void;
}

export class Simulation {
  player: Player;
  tree: PassiveTree;
  zone: Zone;
  camera: Camera;
  input: Input;
  rng: Rng;
  time = 0;

  monsters: Monster[] = [];
  minions: Minion[] = [];
  projectiles: Projectile[] = [];
  drops: ItemDrop[] = [];
  groundEffects: GroundEffect[] = [];
  floatingTexts: FloatingText[] = [];
  toasts: Toast[] = [];
  /** Renderer drains this every frame. */
  vfx: VfxEvent[] = [];

  lastStatMap: StatMap = {};
  inputLocked = false; // true while a full-screen modal (character create etc) owns input
  paused = false; // true while the pause menu is open — simulation fully halts

  hoverTarget: HoverTarget | null = null;
  private pendingInteraction: PendingInteraction | null = null;

  onLevelUp?: (levels: number) => void;
  onZoneChange?: (zoneId: string) => void;
  onDeath?: () => void;
  onStashOpen?: () => void;
  onWaypointOpen?: () => void;

  private skillCtx: SkillContext;

  constructor(player: Player, tree: PassiveTree, camera: Camera, input: Input) {
    this.player = player;
    this.tree = tree;
    this.camera = camera;
    this.input = input;
    this.rng = new Rng(hashSeed(`${player.saveId}_${Date.now()}`));
    this.zone = generateZone(ZONES[player.currentZoneId] ?? ZONES.hub_town, this.rng.int(0, 1e9));
    this.player.pos = { ...this.zone.spawnPoint };
    this.camera.snapTo(this.player.pos.x, this.player.pos.y);

    this.skillCtx = {
      now: 0,
      rng: this.rng,
      spawnProjectile: (pos, vel, hit, team, opts) => {
        this.projectiles.push(new Projectile(pos, vel, hit, team, opts));
      },
      spawnGroundEffect: (pos, radius, hit, delay, duration, tick, color) => {
        this.groundEffects.push(new GroundEffect(pos, radius, hit, delay, duration, tick, color));
      },
      spawnMinion: (summonId, pos, ownerId, statMult) => {
        this.spawnMinion(summonId, pos, ownerId, statMult);
      },
      damageInRadius: (center, radius, hitTeam, hit) => {
        this.damageInRadius(center, radius, hitTeam, hit);
      },
      isWalkable: (pos, radius) => this.zone.isWalkableWorld(pos.x, pos.y, radius),
    };

    this.spawnZoneMonsters();
  }

  changeZone(zoneId: string, arriveNear?: string): void {
    const def = ZONES[zoneId];
    if (!def) return;
    this.zone = generateZone(def, this.rng.int(0, 1e9));
    this.player.currentZoneId = zoneId;
    this.player.wayointsUnlocked.add(zoneId);
    if (arriveNear) {
      const exit = this.zone.exits.find((e) => e.toZoneId === arriveNear);
      this.player.pos = exit ? { ...exit.pos } : { ...this.zone.spawnPoint };
    } else {
      this.player.pos = { ...this.zone.spawnPoint };
    }
    this.monsters = [];
    this.minions = [];
    this.projectiles = [];
    this.drops = [];
    this.groundEffects = [];
    this.pendingInteraction = null;
    this.hoverTarget = null;
    this.spawnZoneMonsters();
    this.camera.snapTo(this.player.pos.x, this.player.pos.y);
    this.onZoneChange?.(zoneId);
  }

  private spawnZoneMonsters(): void {
    const def = this.zone.def;
    if (def.kind === 'boss' && def.bossId) {
      const mdef = MONSTERS[def.bossId];
      if (mdef) {
        const pos: Vec2 = { x: this.zone.spawnPoint.x + 4, y: this.zone.spawnPoint.y + 4 };
        this.monsters.push(new Monster(mdef, pos, def.zoneLevel));
      }
      return;
    }
    if (def.monsterPool.length === 0) return;

    // Monsters spawn in packs rather than scattered singles, so fights are group
    // engagements the way they are in PoE2 rather than a slow trickle of duels.
    let spawned = 0;
    let guard = 0;
    while (spawned < def.maxMonsters && guard < 400) {
      guard++;
      const center: Vec2 = {
        x: this.rng.range(3, def.width - 3),
        y: this.rng.range(3, def.height - 3),
      };
      if (!this.zone.isWalkableWorld(center.x, center.y, 0.6)) continue;
      if (distance(center, this.player.pos) < 9) continue;

      const packSize = Math.min(def.maxMonsters - spawned, 3 + this.rng.int(0, 4));
      // A pack shares a leading monster type, with occasional mixed-in support types.
      const primaryId = this.rng.pick(def.monsterPool);
      for (let i = 0; i < packSize; i++) {
        const mid = this.rng.chance(0.75) ? primaryId : this.rng.pick(def.monsterPool);
        const mdef = MONSTERS[mid];
        if (!mdef) continue;
        let pos: Vec2 | null = null;
        for (let tries = 0; tries < 14; tries++) {
          const angle = this.rng.range(0, Math.PI * 2);
          const radius = this.rng.range(0.6, 2.6);
          const cand: Vec2 = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
          if (this.zone.isWalkableWorld(cand.x, cand.y, 0.5) && distance(cand, this.player.pos) > 8) {
            pos = cand;
            break;
          }
        }
        if (pos) {
          this.monsters.push(new Monster(mdef, pos, def.zoneLevel));
          spawned++;
        }
      }
    }
  }

  private spawnMinion(summonId: string, pos: Vec2, ownerId: number, statMult: { life: number; damage: number }): void {
    const def = MINIONS[summonId];
    if (!def) return;
    const cap = 3 + Math.round(stat(this.lastStatMap, 'minionLimit'));
    const owned = this.minions.filter((m) => m.ownerId === ownerId && m.def.id === summonId);
    if (owned.length >= cap) {
      const oldest = owned[0];
      oldest.dead = true;
    }
    this.minions.push(new Minion(def, pos, ownerId, statMult));
  }

  // ---- combat helpers exposed to skills/AI ----
  damageInRadius(center: Vec2, radius: number, hitTeam: Team, hit: HitInstance): void {
    const targets: (Monster | Minion | Player)[] = [];
    if (hitTeam === 'enemy') targets.push(...this.monsters.filter((m) => !m.dead));
    else {
      targets.push(...this.minions.filter((m) => !m.dead));
      if (!this.player.dead) targets.push(this.player);
    }
    for (const t of targets) {
      if (distance(t.pos, center) <= radius + t.radius) {
        this.applyHitToEntity(t, hit);
      }
    }
  }

  private defenseProfileFor(target: Monster | Minion | Player): DefenseProfile {
    if (target instanceof Player) {
      const d = target.derived;
      return {
        armor: d.armor,
        evasion: d.evasion,
        fireRes: d.fireRes,
        coldRes: d.coldRes,
        lightningRes: d.lightningRes,
        chaosRes: d.chaosRes,
        dodgeChance: stat(this.lastStatMap, 'dodgeChance'),
        chaosInoculation: d.chaosInoculation,
      };
    }
    if (target instanceof Monster) {
      return {
        armor: target.def.armor,
        evasion: target.def.evasion,
        fireRes: target.def.fireRes,
        coldRes: target.def.coldRes,
        lightningRes: target.def.lightningRes,
        chaosRes: target.def.chaosRes,
        dodgeChance: 0,
        chaosInoculation: false,
      };
    }
    return { armor: 0, evasion: 20, fireRes: 0, coldRes: 0, lightningRes: 0, chaosRes: 0, dodgeChance: 0, chaosInoculation: false };
  }

  private applyHitToEntity(target: Monster | Minion | Player, hit: HitInstance): void {
    if (target instanceof Player && target.isDodging) return;
    const currentEs = target instanceof Player ? target.energyShield : 0;
    const maxLife = target instanceof Player ? target.derived.maxLife : (target as Monster | Minion).maxLife;
    const result = resolveHit(hit, this.defenseProfileFor(target), currentEs, this.rng);
    if (!result.landed) {
      this.pushFloatText(target.pos, result.dodged ? 'Dodged' : 'Evaded', '#aaaaaa');
      return;
    }
    target.lastHitAt = this.time;
    if (target instanceof Player) {
      target.energyShield -= result.toEs;
      target.life -= result.toLife;
    } else {
      target.life -= result.toLife + result.toEs;
    }
    const color = result.crit
      ? '#ffd24a'
      : hit.sourceIsPlayer
        ? DAMAGE_TEXT_COLORS[hit.type] ?? '#f2ece0'
        : '#ff6a5a';
    this.pushFloatText(
      target.pos,
      `${Math.round(result.totalDamage)}`,
      color,
      result.crit,
      hit.sourceIsPlayer,
    );
    this.vfx.push({
      kind: 'impact',
      pos: { ...target.pos },
      radius: 0.34 + target.radius,
      color: DAMAGE_TEXT_COLORS[hit.type] ?? '#ffd0a0',
      facing: target.facing,
    });

    for (const [type, amount] of Object.entries(result.byType)) {
      maybeApplyAilments(target, type as HitInstance['type'], amount ?? 0, maxLife, this.time, this.rng, {
        noAilments: hit.tags.includes('noAilments'),
      });
    }

    if (hit.leechPercent && hit.sourceIsPlayer) {
      this.player.life = Math.min(this.player.derived.maxLife, this.player.life + result.leech);
    }

    if (target instanceof Monster) {
      target.aiState = 'aggro';
      target.target = this.player;
    }

    if (target.life <= 0 && !target.dead) {
      target.dead = true;
      if (target instanceof Monster) this.onMonsterDeath(target);
      if (target instanceof Player) this.onPlayerDeath();
    }
  }

  private pushFloatText(pos: Vec2, text: string, color: string, crit = false, fromPlayer = true): void {
    const life = crit ? 1.15 : 0.9;
    this.floatingTexts.push({
      pos: { x: pos.x + this.rng.range(-0.35, 0.35), y: pos.y + this.rng.range(-0.3, 0.3) },
      text,
      color,
      life,
      maxLife: life,
      vy: -0.9,
      crit,
      fromPlayer,
      drift: this.rng.range(-1.7, 1.7),
    });
  }

  private onMonsterDeath(m: Monster): void {
    this.player.killCount++;
    const levels = this.player.gainXp(m.def.xpValue);
    if (levels > 0) {
      this.player.life = this.player.derived.maxLife;
      this.player.mana = this.player.derived.maxMana;
      this.onLevelUp?.(levels);
      this.maybeGrantAscendancyPoint();
    }
    const loot = rollMonsterLoot(m.def, m.zoneLevel, this.rng);
    for (const [k, v] of Object.entries(loot.currency)) {
      (this.player.currencies as unknown as Record<string, number>)[k] += v ?? 0;
    }
    let scatter = 0;
    for (const item of loot.items) {
      const drop = new ItemDrop({ x: m.pos.x + Math.cos(scatter) * 0.5 * scatter, y: m.pos.y + Math.sin(scatter) * 0.5 * scatter }, item, this.time);
      this.drops.push(drop);
      scatter += 1;
    }
    if (loot.gold > 0) {
      const goldDrop = new ItemDrop({ x: m.pos.x, y: m.pos.y + 0.4 }, null, this.time);
      goldDrop.gold = loot.gold;
      this.drops.push(goldDrop);
    }
    this.toasts.push({ text: `${m.def.name} slain (+${m.def.xpValue} xp)`, life: 2 });
  }

  private maybeGrantAscendancyPoint(): void {
    const milestones = [10, 20, 30, 40, 50, 60];
    const idx = milestones.indexOf(this.player.level);
    if (idx >= 0 && this.player.ascendancyId) {
      this.player.ascendancyPoints = Math.min(6, idx + 1);
    }
  }

  private onPlayerDeath(): void {
    this.player.deaths++;
    const lost = Math.round((this.player.xp - xpForLevel(this.player.level)) * 0.05);
    this.player.xp = Math.max(xpForLevel(this.player.level), this.player.xp - lost);
    this.changeZone('hub_town');
    this.player.dead = false;
    this.player.life = this.player.derived.maxLife;
    this.player.mana = this.player.derived.maxMana;
    this.player.energyShield = this.player.derived.maxEnergyShield;
    this.onDeath?.();
  }

  // ---- main loop ----
  update(dt: number): void {
    if (this.paused) {
      this.input.endFrame();
      return;
    }
    this.time += dt;
    this.skillCtx.now = this.time;
    this.refreshDerivedStats();

    if (!this.inputLocked) {
      this.handlePlayerInput(dt);
    } else {
      this.hoverTarget = null;
    }
    this.tickPlayerVitals(dt);
    this.updateProjectiles(dt);
    this.updateGroundEffects(dt);
    this.updateMonsters(dt);
    this.updateMinions(dt);
    this.updateFloatingTexts(dt);
    this.updateToasts(dt);

    this.monsters = this.monsters.filter((m) => !m.dead);
    this.minions = this.minions.filter((m) => !m.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.groundEffects = this.groundEffects.filter((g) => !g.dead);
    this.drops = this.drops.filter((d) => !d.dead);

    this.camera.centerOn(this.player.pos.x, this.player.pos.y);
    this.input.endFrame();
  }

  private refreshDerivedStats(): void {
    const treeMaps: StatMap[] = [];
    for (const nodeId of this.player.allocatedNodes) {
      const node = this.tree.nodes.get(nodeId);
      if (node) treeMaps.push(node.stats);
    }
    if (this.player.ascendancyId) {
      const nodes = ASCENDANCY_NODES[this.player.ascendancyId] ?? [];
      for (const n of nodes) {
        if (this.player.allocatedAscNodes.has(n.id)) treeMaps.push(n.stats);
      }
    }
    const map = mergeStats(this.player.equipmentStats(), this.player.buffStats(), ...treeMaps);
    this.lastStatMap = map;
    const def = this.player.classDef;
    const derived = computeDerived(this.player.level, def.baseAttrs, def.baseResources, map);
    this.player.derived = derived;
    this.player.life = Math.min(this.player.life, derived.maxLife);
    this.player.mana = Math.min(this.player.mana, derived.maxMana);
    this.player.energyShield = Math.min(this.player.energyShield, derived.maxEnergyShield);
  }

  private handlePlayerInput(dt: number): void {
    const p = this.player;
    if (p.attackCooldown > 0) p.attackCooldown -= dt;
    for (const [id, cd] of p.cooldowns) {
      if (cd > 0) p.cooldowns.set(id, cd - dt);
    }
    if (p.dodgeCooldown > 0) p.dodgeCooldown -= dt;

    this.hoverTarget = this.computeHoverTarget(this.input.mouseX, this.input.mouseY);

    let mx = 0;
    let my = 0;
    if (!p.isDodging) {
      if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) my -= 1;
      if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) my += 1;
      if (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft')) mx -= 1;
      if (this.input.isDown('KeyD') || this.input.isDown('ArrowRight')) mx += 1;
    }
    const wasdHeld = mx !== 0 || my !== 0;
    if (wasdHeld) this.pendingInteraction = null; // manual movement always takes back control

    // A fresh left-click on something interactive queues an auto-walk-and-interact,
    // taking priority over that click being spent on the LMB skill slot.
    if (!p.isDodging && this.input.mousePressed && this.hoverTarget) {
      this.queueInteraction(this.hoverTarget);
    }

    if (p.isDodging) {
      p.dodgeTimer -= dt;
      this.attemptMove(p, p.dodgeDir.x * 10 * dt, p.dodgeDir.y * 10 * dt);
      if (p.dodgeTimer <= 0) p.isDodging = false;
    } else if (this.pendingInteraction) {
      this.advancePendingInteraction(dt);
    } else {
      if (wasdHeld) {
        const len = Math.hypot(mx, my);
        mx /= len;
        my /= len;
        p.lastMoveDir = { x: mx, y: my };
      }
      if (this.input.wasPressed('Space') && p.dodgeCooldown <= 0) {
        p.isDodging = true;
        p.dodgeTimer = 0.26;
        p.dodgeCooldown = 0.9;
        p.dodgeDir = wasdHeld ? { x: mx, y: my } : p.lastMoveDir;
      } else {
        const status = tickStatusEffects(p, this.time, dt);
        if (!status.frozen) {
          const sprinting = wasdHeld && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
          const speed = 3.9 * p.derived.movementSpeed * (sprinting ? 1.5 : 1) * (1 - Math.min(80, status.chillPercent) / 100);
          if (wasdHeld) this.attemptMove(p, mx * speed * dt, my * speed * dt);
        }
        this.applyDotDamage(p, status.dotDamage);
      }
    }

    const mouseWorld = this.camera.screenToWorld(this.input.mouseX, this.input.mouseY);
    if (!p.isDodging && !this.pendingInteraction) {
      p.facing = angleTo(p.pos, mouseWorld);
    }

    const sprintingNow = !p.isDodging && wasdHeld && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    if (!p.isDodging && !sprintingNow) {
      const held = [
        this.input.mouseDown && !this.hoverTarget,
        this.input.mouseMiddleDown,
        this.input.mouseRightDown,
        this.input.isDown('KeyQ'),
        this.input.isDown('KeyE'),
        this.input.isDown('KeyR'),
        this.input.isDown('KeyT'),
      ];
      for (let i = 0; i < held.length; i++) {
        if (held[i]) this.tryCastSlot(i, mouseWorld);
      }
    }

    if (this.input.wasPressed('Digit1')) this.useFlask(0);
    if (this.input.wasPressed('Digit2')) this.useFlask(1);
  }

  private computeHoverTarget(sx: number, sy: number): HoverTarget | null {
    let bestDrop: ItemDrop | null = null;
    let bestDist = 42;
    for (const d of this.drops) {
      const s = this.camera.worldToScreen(d.pos.x, d.pos.y, 0.5);
      if (!s) continue;
      const dist = Math.hypot(s.x - sx, s.y - sy);
      if (dist < bestDist) {
        bestDist = dist;
        bestDrop = d;
      }
    }
    if (bestDrop) return { kind: 'drop', drop: bestDrop };

    for (const deco of this.zone.decorations) {
      if (deco.kind !== 'stash' && deco.kind !== 'waypoint') continue;
      const s = this.camera.worldToScreen(deco.pos.x, deco.pos.y, 0.7);
      if (!s) continue;
      if (Math.hypot(s.x - sx, s.y - sy) < 50) {
        return deco.kind === 'stash' ? { kind: 'stash', pos: deco.pos } : { kind: 'waypoint', pos: deco.pos };
      }
    }

    for (const exit of this.zone.exits) {
      const s = this.camera.worldToScreen(exit.pos.x, exit.pos.y, 0.3);
      if (!s) continue;
      if (Math.hypot(s.x - sx, s.y - sy) < 55) return { kind: 'exit', exit };
    }

    return null;
  }

  /** Queue a walk-and-interact toward a world target — used by canvas clicks and DOM label clicks alike. */
  queueInteraction(target: HoverTarget): void {
    if (this.paused || this.inputLocked || this.player.dead) return;
    this.pendingInteraction = this.buildPendingInteraction(target);
  }

  private buildPendingInteraction(hover: HoverTarget): PendingInteraction {
    switch (hover.kind) {
      case 'drop':
        return { targetPos: hover.drop.pos, radius: 0.9, action: () => this.pickupDrop(hover.drop) };
      case 'exit': {
        const toId = hover.exit.toZoneId;
        const fromId = this.zone.def.id;
        return { targetPos: hover.exit.pos, radius: 1.3, action: () => this.changeZone(toId, fromId) };
      }
      case 'stash':
        return { targetPos: hover.pos, radius: 1.8, action: () => this.onStashOpen?.() };
      case 'waypoint':
        return { targetPos: hover.pos, radius: 1.8, action: () => this.onWaypointOpen?.() };
    }
  }

  private advancePendingInteraction(dt: number): void {
    const interaction = this.pendingInteraction;
    if (!interaction) return;
    const p = this.player;
    const d = distance(p.pos, interaction.targetPos);
    if (d <= interaction.radius) {
      this.pendingInteraction = null;
      interaction.action();
      return;
    }
    const dir = angleTo(p.pos, interaction.targetPos);
    p.facing = dir;
    const speed = 3.9 * p.derived.movementSpeed;
    this.attemptMove(p, Math.cos(dir) * speed * dt, Math.sin(dir) * speed * dt);
  }

  private pickupDrop(drop: ItemDrop): void {
    if (drop.dead) return;
    if (drop.item) {
      if (this.player.inventory.hasSpaceFor(drop.item)) {
        this.player.inventory.addItem(drop.item);
        this.toasts.push({ text: `Picked up ${drop.item.name}`, life: 1.6 });
        drop.dead = true;
      } else {
        this.toasts.push({ text: 'Inventory is full', life: 1.6 });
      }
    } else {
      this.player.gold += drop.gold;
      drop.dead = true;
    }
  }

  private attemptMove(entity: Entity, dx: number, dy: number): void {
    const nx = entity.pos.x + dx;
    if (this.zone.isWalkableWorld(nx, entity.pos.y, entity.radius)) entity.pos.x = nx;
    const ny = entity.pos.y + dy;
    if (this.zone.isWalkableWorld(entity.pos.x, ny, entity.radius)) entity.pos.y = ny;
  }

  private tryCastSlot(index: number, aimPoint: Vec2): void {
    const p = this.player;
    const slot = p.skillSlots[index];
    if (!slot.skillId) return;
    const skill = SKILLS[slot.skillId];
    if (!skill || p.level < skill.levelReq) return;
    if ((p.cooldowns.get(skill.id) ?? 0) > 0) return;
    if (p.attackCooldown > 0) return;

    const useBlood = stat(this.lastStatMap, 'keystoneBloodMagic') > 0;
    const cost = getSkillManaCost(skill, slot.supportIds);
    if (useBlood) {
      if (p.life <= cost) return;
    } else if (p.mana < cost) {
      return;
    }

    if (skill.behavior === 'dash') {
      const dist = skill.dashDistance ?? 4;
      const dir = angleTo(p.pos, aimPoint);
      let travelled = 0;
      const stepSize = 0.3;
      while (travelled < dist) {
        const step = Math.min(stepSize, dist - travelled);
        const nx = p.pos.x + Math.cos(dir) * step;
        const ny = p.pos.y + Math.sin(dir) * step;
        if (!this.zone.isWalkableWorld(nx, ny, p.radius)) break;
        p.pos.x = nx;
        p.pos.y = ny;
        travelled += step;
      }
    }

    if (skill.behavior === 'self_buff' && skill.buffStats) {
      p.buffs.push({ id: skill.id, stats: skill.buffStats, expiresAt: this.time + (skill.buffDuration ?? 4), label: skill.name });
    }

    const castResult = castSkill(this.skillCtx, p, aimPoint, skill, slot.supportIds, this.lastStatMap, p.derived, 'player');

    if (useBlood) p.life -= castResult.effectiveManaCost;
    else p.mana -= castResult.effectiveManaCost;

    const swingDir = angleTo(p.pos, aimPoint);
    if (skill.behavior === 'melee_hit') {
      const range = skill.range ?? 1.5;
      this.vfx.push({
        kind: 'melee_arc',
        pos: { x: p.pos.x + Math.cos(swingDir) * range * 0.55, y: p.pos.y + Math.sin(swingDir) * range * 0.55 },
        radius: Math.max(1.1, skill.radius ?? 1.5),
        color: DAMAGE_TEXT_COLORS[skill.damageType] ?? '#ffe0b0',
        facing: swingDir,
      });
    } else if (skill.behavior === 'nova') {
      this.vfx.push({
        kind: 'nova',
        pos: { ...p.pos },
        radius: skill.radius ?? 3,
        color: DAMAGE_TEXT_COLORS[skill.damageType] ?? '#8ad8ff',
        facing: swingDir,
      });
    }

    p.lastAttackAt = this.time;
    p.cooldowns.set(skill.id, Math.max(skill.cooldown, 0.05));
    p.attackCooldown = Math.max(0.08, castResult.castTime);
  }

  private useFlask(slotIndex: number): void {
    const key = (`flask${slotIndex + 1}`) as 'flask1' | 'flask2';
    const item = this.player.equipment[key];
    if (!item) return;
    const baseDef = ITEM_BASES[item.baseId];
    if (!baseDef) return;
    if ((this.player.flaskCooldowns.get(key) ?? 0) > 0) return;
    const duration = baseDef.flaskDuration ?? 3;
    if (baseDef.flaskKind === 'life' && baseDef.flaskLife) {
      this.player.flaskHeals.push({ type: 'life', remaining: duration, perSecond: baseDef.flaskLife / duration });
    } else if (baseDef.flaskKind === 'mana' && baseDef.flaskMana) {
      this.player.flaskHeals.push({ type: 'mana', remaining: duration, perSecond: baseDef.flaskMana / duration });
    }
    this.player.flaskCooldowns.set(key, duration);
    this.toasts.push({ text: `Used ${item.name}`, life: 1.5 });
  }

  private applyDotDamage(p: Player, dot: number): void {
    if (dot <= 0) return;
    p.life -= dot;
    if (p.life <= 0 && !p.dead) {
      p.dead = true;
      this.onPlayerDeath();
    }
  }

  private tickPlayerVitals(dt: number): void {
    const p = this.player;
    if (!p.isDodging) {
      p.life = Math.min(p.derived.maxLife, p.life + p.derived.lifeRegen * dt);
      p.mana = Math.min(p.derived.maxMana, p.mana + p.derived.manaRegen * dt);
    }
    for (const [k, cd] of p.flaskCooldowns) {
      if (cd > 0) p.flaskCooldowns.set(k, cd - dt);
    }
    for (let i = p.flaskHeals.length - 1; i >= 0; i--) {
      const heal = p.flaskHeals[i];
      const amount = heal.perSecond * dt;
      if (heal.type === 'life') p.life = Math.min(p.derived.maxLife, p.life + amount);
      else p.mana = Math.min(p.derived.maxMana, p.mana + amount);
      heal.remaining -= dt;
      if (heal.remaining <= 0) p.flaskHeals.splice(i, 1);
    }
    p.buffs = p.buffs.filter((b) => b.expiresAt > this.time);
  }

  private updateProjectiles(dt: number): void {
    for (const proj of this.projectiles) {
      if (proj.dead) continue;
      proj.pos.x += proj.velocity.x * dt;
      proj.pos.y += proj.velocity.y * dt;
      proj.life -= dt;
      if (proj.life <= 0) {
        proj.dead = true;
        continue;
      }
      if (!this.zone.isWalkableWorld(proj.pos.x, proj.pos.y, 0.05)) {
        proj.dead = true;
        continue;
      }
      const targets: (Monster | Minion | Player)[] =
        proj.team === 'player'
          ? this.monsters.filter((m) => !m.dead)
          : [...this.minions.filter((m) => !m.dead), ...(this.player.dead ? [] : [this.player])];
      for (const t of targets) {
        if (proj.hitEntities.has(t.id)) continue;
        if (distance(t.pos, proj.pos) <= proj.radius + t.radius) {
          proj.hitEntities.add(t.id);
          this.applyHitToEntity(t, proj.hit);
          if (proj.pierceRemaining > 0) {
            proj.pierceRemaining--;
          } else if (proj.chainRemaining > 0) {
            proj.chainRemaining--;
            const next = this.findNearestOtherTarget(targets, proj.pos, proj.hitEntities);
            if (next) {
              const dx = next.pos.x - proj.pos.x;
              const dy = next.pos.y - proj.pos.y;
              const len = Math.hypot(dx, dy) || 1;
              const speed = Math.max(len, 8);
              proj.velocity = { x: (dx / len) * speed, y: (dy / len) * speed };
            } else {
              proj.dead = true;
            }
          } else {
            proj.dead = true;
          }
          break;
        }
      }
    }
  }

  private findNearestOtherTarget(targets: (Monster | Minion | Player)[], from: Vec2, exclude: Set<number>): (Monster | Minion | Player) | null {
    let best: (Monster | Minion | Player) | null = null;
    let bestDist = Infinity;
    for (const t of targets) {
      if (exclude.has(t.id)) continue;
      const d = distance(t.pos, from);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  private updateGroundEffects(dt: number): void {
    for (const g of this.groundEffects) {
      g.elapsed += dt;
      if (g.elapsed < g.delay) continue;
      if (g.elapsed > g.delay + g.duration) {
        g.dead = true;
        continue;
      }
      g.tickTimer -= dt;
      if (g.tickTimer <= 0) {
        g.tickTimer = g.tickInterval;
        const hitTeam: Team = g.hit.sourceIsPlayer ? 'enemy' : 'player';
        this.damageInRadius(g.pos, g.radius, hitTeam, g.hit);
      }
    }
  }

  private updateMonsters(dt: number): void {
    for (const m of this.monsters) {
      if (m.dead) continue;
      const status = tickStatusEffects(m, this.time, dt);
      if (status.dotDamage > 0) {
        m.life -= status.dotDamage;
        this.pushFloatText(m.pos, `${Math.round(status.dotDamage)}`, '#ff8844');
        if (m.life <= 0 && !m.dead) {
          m.dead = true;
          this.onMonsterDeath(m);
          continue;
        }
      }
      if (status.frozen) continue;

      const speedMult = 1 - Math.min(80, status.chillPercent) / 100;
      this.updateMonsterAI(m, dt, speedMult);
    }
  }

  private updateMonsterAI(m: Monster, dt: number, speedMult: number): void {
    const distToPlayer = distance(m.pos, this.player.pos);
    if (m.aiState === 'idle') {
      if (distToPlayer <= m.def.aggroRadius && !this.player.dead) {
        m.aiState = 'aggro';
        m.target = this.player;
      }
      return;
    }
    if (this.player.dead) {
      m.aiState = 'idle';
      m.target = null;
      return;
    }
    m.facing = angleTo(m.pos, this.player.pos);
    if (distToPlayer > m.def.attackRange) {
      if (distToPlayer > m.def.aggroRadius * 2.2) {
        m.aiState = 'idle';
        return;
      }
      const dir = angleTo(m.pos, this.player.pos);
      const speed = m.def.moveSpeed * speedMult;
      this.attemptMove(m, Math.cos(dir) * speed * dt, Math.sin(dir) * speed * dt);
    } else {
      m.attackTimer -= dt;
      if (m.attackTimer <= 0) {
        m.attackTimer = m.def.attackCooldown;
        m.lastAttackAt = this.time;
        this.monsterAttack(m);
      }
    }
  }

  private monsterAttack(m: Monster): void {
    const hit: HitInstance = {
      min: m.damageMin,
      max: m.damageMax,
      type: m.def.damageType,
      critChance: 0.05,
      critMultiplier: 1.5,
      accuracy: 150 + m.zoneLevel * 4,
      sourceIsPlayer: false,
      ownerId: m.id,
      tags: ['attack'],
    };
    if (m.def.behavior === 'melee') {
      this.damageInRadius(m.pos, m.def.attackRange * 0.9, 'player', hit);
    } else {
      const speed = m.def.projectileSpeed ?? 10;
      const dir = angleTo(m.pos, this.player.pos);
      this.projectiles.push(
        new Projectile(
          { x: m.pos.x + Math.cos(dir) * 0.55, y: m.pos.y + Math.sin(dir) * 0.55 },
          { x: Math.cos(dir) * speed, y: Math.sin(dir) * speed },
          hit,
          'enemy',
          { color: '#ff6a6a' },
        ),
      );
    }
  }

  private updateMinions(dt: number): void {
    for (const minion of this.minions) {
      if (minion.dead) continue;
      const status = tickStatusEffects(minion, this.time, dt);
      if (status.dotDamage > 0) {
        minion.life -= status.dotDamage;
        if (minion.life <= 0) {
          minion.dead = true;
          continue;
        }
      }
      if (status.frozen) continue;

      let target = minion.target && !minion.target.dead ? minion.target : null;
      if (!target || distance(minion.pos, target.pos) > 12) {
        target = this.findNearestMonster(minion.pos, 9);
      }
      minion.target = target;

      if (target) {
        minion.facing = angleTo(minion.pos, target.pos);
        const d = distance(minion.pos, target.pos);
        if (d > minion.def.attackRange) {
          const dir = angleTo(minion.pos, target.pos);
          this.attemptMove(minion, Math.cos(dir) * minion.def.moveSpeed * dt, Math.sin(dir) * minion.def.moveSpeed * dt);
        } else {
          minion.attackTimer -= dt;
          if (minion.attackTimer <= 0) {
            minion.attackTimer = minion.def.attackCooldown;
            minion.lastAttackAt = this.time;
            const hit: HitInstance = {
              min: minion.damageMin,
              max: minion.damageMax,
              type: 'physical',
              critChance: 0.05,
              critMultiplier: 1.5,
              accuracy: 200,
              sourceIsPlayer: false,
              ownerId: minion.id,
              tags: ['attack', 'minion'],
            };
            this.damageInRadius(minion.pos, minion.def.attackRange, 'enemy', hit);
          }
        }
      } else {
        const d = distance(minion.pos, this.player.pos);
        if (d > 2.2) {
          const dir = angleTo(minion.pos, this.player.pos);
          this.attemptMove(minion, Math.cos(dir) * minion.def.moveSpeed * dt, Math.sin(dir) * minion.def.moveSpeed * dt);
        }
      }
    }
  }

  private findNearestMonster(from: Vec2, maxDist: number): Monster | null {
    let best: Monster | null = null;
    let bestDist = maxDist;
    for (const m of this.monsters) {
      if (m.dead) continue;
      const d = distance(from, m.pos);
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
    return best;
  }

  private updateFloatingTexts(dt: number): void {
    for (const t of this.floatingTexts) {
      t.pos.y += t.vy * dt;
      t.pos.x += t.drift * dt;
      t.vy += dt * 1.5; // gentle arc: rise then settle
      t.life -= dt;
    }
    this.floatingTexts = this.floatingTexts.filter((t) => t.life > 0);
  }

  private updateToasts(dt: number): void {
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);
  }
}
