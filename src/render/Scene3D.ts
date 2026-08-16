import * as THREE from 'three';
import type { Camera } from '../engine/Camera.ts';
import type { Zone, ZoneExit } from '../world/Zone.ts';
import type { Simulation } from '../state/Simulation.ts';
import type { Monster } from '../entities/Monster.ts';
import type { Projectile } from '../entities/Projectile.ts';
import type { ItemDrop } from '../entities/ItemDrop.ts';
import type { GroundEffect } from '../entities/GroundEffect.ts';
import { RARITY_COLOR } from '../core/item.ts';
import { ITEM_BASES } from '../data/items.ts';
import type { CreatureRig, WeaponKind } from './rigs.ts';
import { createRig, disposeRig, updateRig } from './rigs.ts';
import type { Vec2 } from '../engine/Vec2.ts';

function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

function hashTile(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) ^ (x * 3266489917);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function disposeGroupChildren(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}

/**
 * A DOM label anchored to a real point in world space — the top of the object it
 * belongs to — plus a small constant pixel gap. Projecting the actual 3D anchor
 * (rather than offsetting a ground point by fixed pixels) is what keeps labels
 * glued to their objects as perspective changes across the screen.
 */
interface WorldLabel {
  el: HTMLDivElement;
  ax: number;
  ay: number;
  /** World-space height of the object's top, in world units. */
  anchorHeight: number;
  /** Constant screen-space gap above that anchor, in pixels. */
  gap: number;
}

const WEAPON_CLASS_TO_KIND: Record<string, WeaponKind> = {
  mace: 'mace',
  quarterstaff: 'staff',
  staff: 'staff',
  bow: 'bow',
  sceptre: 'sceptre',
  wand: 'wand',
  crossbow: 'crossbow',
  sword: 'sword',
  dagger: 'sword',
  claw: 'sword',
};

export class Scene3D {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  camera: Camera;
  labelLayer: HTMLElement;

  onDropClick?: (drop: ItemDrop) => void;
  onExitClick?: (exit: ZoneExit) => void;
  onStashClick?: (pos: Vec2) => void;
  onWaypointClick?: (pos: Vec2) => void;

  private floorMesh: THREE.InstancedMesh | null = null;
  private wallMesh: THREE.InstancedMesh | null = null;
  private decorGroup = new THREE.Group();
  private exitGroup = new THREE.Group();

  private playerRig: CreatureRig;
  private playerWeapon: WeaponKind | '__initial' = '__initial';
  private playerColor = '#d8ccb0';
  private monsterRigs = new Map<number, CreatureRig>();
  private minionRigs = new Map<number, CreatureRig>();
  private dyingRigs: { rig: CreatureRig; start: number }[] = [];
  private projectileMeshes = new Map<number, THREE.Mesh>();
  private dropMeshes = new Map<number, THREE.Group>();
  private groundEffectMeshes = new Map<number, THREE.Mesh>();

  private dropLabels = new Map<number, WorldLabel>();
  private exitLabels: WorldLabel[] = [];
  private decoLabels: WorldLabel[] = [];
  private bossLabels = new Map<number, WorldLabel>();
  private vfxMeshes: { mesh: THREE.Mesh; start: number; duration: number; kind: string; radius: number }[] = [];

  constructor(canvas: HTMLCanvasElement, camera: Camera, labelLayer: HTMLElement) {
    this.camera = camera;
    this.labelLayer = labelLayer;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0x08070a);
    this.scene.fog = new THREE.Fog(0x08070a, 16, 62);

    const ambient = new THREE.AmbientLight(0xccd4ff, 0.5);
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.2);
    sun.position.set(-10, 18, 8);
    const fill = new THREE.HemisphereLight(0x8090c0, 0x201810, 0.45);
    this.scene.add(ambient, sun, fill);

    this.scene.add(this.decorGroup, this.exitGroup);

    this.playerRig = createRig({ kind: 'humanoid', color: this.playerColor, weapon: 'none', headColor: '#e8d0b0' });
    this.scene.add(this.playerRig.group);
  }

  resize(w: number, h: number, hudHeightPx = 0): void {
    this.renderer.setSize(w, h, false);
    this.camera.resize(w, h);
    this.camera.fitPlayfield(hudHeightPx);
  }

  buildZone(zone: Zone): void {
    this.disposeZoneMeshes();

    const { width, height } = zone.def;
    let floorCount = 0;
    let wallCount = 0;
    for (let i = 0; i < zone.walkable.length; i++) {
      if (zone.walkable[i] === 1) floorCount++;
      else wallCount++;
    }

    const floorGeom = new THREE.BoxGeometry(1, 0.2, 1);
    const wallGeom = new THREE.BoxGeometry(1, 2.6, 1);
    const floorMat = new THREE.MeshStandardMaterial({ color: hex(zone.def.groundColor), roughness: 0.95 });
    const wallMat = new THREE.MeshStandardMaterial({ color: hex(zone.def.wallColor), roughness: 0.92 });

    const floorMesh = new THREE.InstancedMesh(floorGeom, floorMat, Math.max(1, floorCount));
    const wallMesh = new THREE.InstancedMesh(wallGeom, wallMat, Math.max(1, wallCount));
    floorMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, floorCount) * 3), 3);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let fi = 0;
    let wi = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const walkable = zone.walkable[y * width + x] === 1;
        if (walkable) {
          dummy.position.set(x + 0.5, -0.1, y + 0.5);
          dummy.updateMatrix();
          floorMesh.setMatrixAt(fi, dummy.matrix);
          const n = hashTile(x, y);
          color.set(hex(zone.def.groundColor)).offsetHSL(0, 0, (n - 0.5) * 0.07);
          floorMesh.setColorAt(fi, color);
          fi++;
        } else {
          dummy.position.set(x + 0.5, 1.2, y + 0.5);
          dummy.updateMatrix();
          wallMesh.setMatrixAt(wi, dummy.matrix);
          wi++;
        }
      }
    }
    floorMesh.instanceMatrix.needsUpdate = true;
    if (floorMesh.instanceColor) floorMesh.instanceColor.needsUpdate = true;
    wallMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(floorMesh, wallMesh);
    this.floorMesh = floorMesh;
    this.wallMesh = wallMesh;

    this.scene.fog = new THREE.Fog(hex(zone.def.wallColor), 14, zone.def.kind === 'town' ? 60 : 36);

    for (const deco of zone.decorations) {
      const mesh = this.buildDecoration(deco.kind, zone.def.accentColor);
      mesh.position.set(deco.pos.x, 0, deco.pos.y);
      this.decorGroup.add(mesh);
      if (deco.kind === 'stash' || deco.kind === 'waypoint') {
        const el = this.createLabel(deco.kind === 'stash' ? 'Stash' : 'Waypoint', '#f0d8a0', 'deco-label');
        const pos = deco.pos;
        el.addEventListener('click', () => {
          if (deco.kind === 'stash') this.onStashClick?.(pos);
          else this.onWaypointClick?.(pos);
        });
        // anchor at the top of each prop: crate lid ~0.95, waypoint crystal ~1.55
        this.decoLabels.push({ el, ax: pos.x, ay: pos.y, anchorHeight: deco.kind === 'stash' ? 0.95 : 1.55, gap: 8 });
      }
    }

    for (const exit of zone.exits) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.85, 24),
        new THREE.MeshBasicMaterial({ color: 0x7af0a0, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(exit.pos.x, 0.05, exit.pos.y);
      this.exitGroup.add(ring);

      const el = this.createLabel(exit.label, '#bdf0c8', 'exit-label');
      el.addEventListener('click', () => this.onExitClick?.(exit));
      // portal ring lies flat on the ground
      this.exitLabels.push({ el, ax: exit.pos.x, ay: exit.pos.y, anchorHeight: 0.1, gap: 10 });
    }
  }

  private buildDecoration(kind: string, accent: string): THREE.Object3D {
    if (kind === 'waypoint') {
      const g = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.62, 0.18, 10),
        new THREE.MeshStandardMaterial({ color: 0x333030, roughness: 0.8 }),
      );
      base.position.y = 0.09;
      const glow = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42, 0),
        new THREE.MeshStandardMaterial({ color: hex(accent), emissive: hex(accent), emissiveIntensity: 0.9, roughness: 0.3 }),
      );
      glow.position.y = 1.1;
      g.add(base, glow);
      g.userData.spin = glow;
      return g;
    }
    if (kind === 'stash') {
      const g = new THREE.Group();
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.9, 0.85),
        new THREE.MeshStandardMaterial({ color: 0x6a4a28, roughness: 0.85 }),
      );
      crate.position.y = 0.45;
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(1.16, 0.14, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x3a2a14, roughness: 0.7 }),
      );
      band.position.y = 0.45;
      g.add(crate, band);
      return g;
    }
    if (kind === 'bush') {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.4, 0),
        new THREE.MeshStandardMaterial({ color: 0x33502f, roughness: 1 }),
      );
      m.position.y = 0.35;
      return m;
    }
    const m = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.32, 0),
      new THREE.MeshStandardMaterial({ color: 0x555049, roughness: 1 }),
    );
    m.position.y = 0.25;
    m.rotation.set(Math.random(), Math.random(), Math.random());
    return m;
  }

  private disposeZoneMeshes(): void {
    if (this.floorMesh) {
      this.scene.remove(this.floorMesh);
      this.floorMesh.geometry.dispose();
      (this.floorMesh.material as THREE.Material).dispose();
      this.floorMesh = null;
    }
    if (this.wallMesh) {
      this.scene.remove(this.wallMesh);
      this.wallMesh.geometry.dispose();
      (this.wallMesh.material as THREE.Material).dispose();
      this.wallMesh = null;
    }
    disposeGroupChildren(this.decorGroup);
    disposeGroupChildren(this.exitGroup);
    for (const l of this.exitLabels) l.el.remove();
    this.exitLabels = [];
    for (const l of this.decoLabels) l.el.remove();
    this.decoLabels = [];
    for (const rig of this.dyingRigs) {
      this.scene.remove(rig.rig.group);
      disposeRig(rig.rig);
    }
    this.dyingRigs = [];
    for (const v of this.vfxMeshes) {
      this.scene.remove(v.mesh);
      v.mesh.geometry.dispose();
      (v.mesh.material as THREE.Material).dispose();
    }
    this.vfxMeshes = [];
  }

  private createLabel(text: string, color: string, extraClass?: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'world-label' + (extraClass ? ` ${extraClass}` : '');
    el.textContent = text;
    el.style.color = color;
    this.labelLayer.appendChild(el);
    return el;
  }

  private desiredPlayerWeapon(sim: Simulation): WeaponKind {
    const weapon = sim.player.equipment.weapon;
    if (!weapon) return 'none';
    const base = ITEM_BASES[weapon.baseId];
    return WEAPON_CLASS_TO_KIND[base?.weaponClass ?? ''] ?? 'none';
  }

  private rigForMonster(m: Monster): CreatureRig {
    const icon = m.def.icon;
    if (icon === 'wolf') return createRig({ kind: 'quadruped', color: m.def.color, scale: 0.95 + m.radius * 0.3 });
    if (icon === 'blob') return createRig({ kind: 'blob', color: m.def.color, scale: 0.95 + m.radius * 0.4 });
    const weapon: WeaponKind = m.def.behavior === 'ranged' ? 'bow' : m.def.behavior === 'caster' ? 'staff' : 'sword';
    const scale = m.def.isBoss ? 1.9 : icon === 'brute' ? 1.3 : 1;
    return createRig({ kind: 'humanoid', color: m.def.color, scale, weapon });
  }

  private syncCreatures(sim: Simulation): void {
    const now = sim.time;
    const seen = new Set<number>();
    for (const m of sim.monsters) {
      seen.add(m.id);
      let rig = this.monsterRigs.get(m.id);
      if (!rig) {
        rig = this.rigForMonster(m);
        rig.prevX = m.pos.x;
        rig.prevY = m.pos.y;
        this.monsterRigs.set(m.id, rig);
        this.scene.add(rig.group);
      }
      updateRig(rig, m.pos, m.facing, now, m.lastAttackAt, m.lastHitAt);
    }
    for (const [id, rig] of this.monsterRigs) {
      if (!seen.has(id)) {
        this.monsterRigs.delete(id);
        this.dyingRigs.push({ rig, start: now });
        const label = this.bossLabels.get(id);
        if (label) {
          label.el.remove();
          this.bossLabels.delete(id);
        }
      }
    }

    const seenMinions = new Set<number>();
    for (const m of sim.minions) {
      seenMinions.add(m.id);
      let rig = this.minionRigs.get(m.id);
      if (!rig) {
        rig = createRig({ kind: 'humanoid', color: m.def.color, scale: 0.82, weapon: 'sword' });
        rig.prevX = m.pos.x;
        rig.prevY = m.pos.y;
        this.minionRigs.set(m.id, rig);
        this.scene.add(rig.group);
      }
      updateRig(rig, m.pos, m.facing, now, m.lastAttackAt, m.lastHitAt);
    }
    for (const [id, rig] of this.minionRigs) {
      if (!seenMinions.has(id)) {
        this.minionRigs.delete(id);
        this.dyingRigs.push({ rig, start: now });
      }
    }

    // death animation: sink + shrink, then dispose
    for (let i = this.dyingRigs.length - 1; i >= 0; i--) {
      const d = this.dyingRigs[i];
      const t = (now - d.start) / 0.32;
      if (t >= 1) {
        this.scene.remove(d.rig.group);
        disposeRig(d.rig);
        this.dyingRigs.splice(i, 1);
      } else {
        d.rig.group.scale.setScalar(d.rig.baseScale * (1 - t * 0.7));
        d.rig.group.position.y = -t * 0.5;
      }
    }
  }

  syncFrame(sim: Simulation): void {
    const now = sim.time;

    const desiredWeapon = this.desiredPlayerWeapon(sim);
    const desiredColor = sim.player.classDef.color;
    if (desiredWeapon !== this.playerWeapon || desiredColor !== this.playerColor) {
      const prevX = this.playerRig.prevX;
      const prevY = this.playerRig.prevY;
      this.scene.remove(this.playerRig.group);
      disposeRig(this.playerRig);
      this.playerRig = createRig({ kind: 'humanoid', color: desiredColor, weapon: desiredWeapon, headColor: '#e8d0b0' });
      this.playerRig.prevX = prevX;
      this.playerRig.prevY = prevY;
      this.scene.add(this.playerRig.group);
      this.playerWeapon = desiredWeapon;
      this.playerColor = desiredColor;
    }
    updateRig(this.playerRig, sim.player.pos, sim.player.facing, now, sim.player.lastAttackAt, sim.player.lastHitAt);
    this.playerRig.group.visible = !sim.player.dead;

    this.syncCreatures(sim);
    this.syncProjectiles(sim.projectiles);
    this.syncDrops(sim.drops, now);
    this.syncGroundEffects(sim.groundEffects, now);
    this.spawnVfx(sim, now);
    this.updateVfx(now);

    for (const child of this.decorGroup.children) {
      const spin = (child as THREE.Object3D).userData.spin as THREE.Object3D | undefined;
      if (spin) spin.rotation.y = now * 1.4;
    }
    for (const ring of this.exitGroup.children) {
      ring.rotation.z = now * 0.5;
    }

    this.updateLabels(sim);
  }

  /** Turn queued one-shot combat effects from the sim into short-lived meshes. */
  private spawnVfx(sim: Simulation, now: number): void {
    for (const e of sim.vfx) {
      const color = hex(e.color);
      let mesh: THREE.Mesh;
      let duration = 0.28;
      if (e.kind === 'melee_arc') {
        // a swept wedge in front of the attacker, oriented along the swing
        const geom = new THREE.RingGeometry(e.radius * 0.35, e.radius, 20, 1, -0.9, 1.8);
        mesh = new THREE.Mesh(
          geom,
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = -e.facing;
        mesh.position.set(e.pos.x, 0.5, e.pos.y);
        duration = 0.22;
      } else if (e.kind === 'nova') {
        mesh = new THREE.Mesh(
          new THREE.RingGeometry(0.75, 1, 32),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(e.pos.x, 0.16, e.pos.y);
        duration = 0.42;
      } else {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(e.radius * 0.55, 10, 8),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        mesh.position.set(e.pos.x, 0.85, e.pos.y);
        duration = 0.18;
      }
      this.scene.add(mesh);
      this.vfxMeshes.push({ mesh, start: now, duration, kind: e.kind, radius: e.radius });
    }
    sim.vfx.length = 0;
  }

  private updateVfx(now: number): void {
    for (let i = this.vfxMeshes.length - 1; i >= 0; i--) {
      const v = this.vfxMeshes[i];
      const t = (now - v.start) / v.duration;
      if (t >= 1) {
        this.scene.remove(v.mesh);
        v.mesh.geometry.dispose();
        (v.mesh.material as THREE.Material).dispose();
        this.vfxMeshes.splice(i, 1);
        continue;
      }
      const mat = v.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - t) * (v.kind === 'impact' ? 0.7 : 0.6);
      if (v.kind === 'nova') v.mesh.scale.setScalar(0.3 + t * v.radius);
      else if (v.kind === 'impact') v.mesh.scale.setScalar(1 + t * 1.5);
      else v.mesh.scale.setScalar(0.85 + t * 0.35);
    }
  }

  private syncProjectiles(list: Projectile[]): void {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let mesh = this.projectileMeshes.get(p.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 8, 8),
          new THREE.MeshStandardMaterial({ color: hex(p.color), emissive: hex(p.color), emissiveIntensity: 1.4 }),
        );
        this.projectileMeshes.set(p.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(p.pos.x, 0.85, p.pos.y);
    }
    for (const [id, mesh] of this.projectileMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.projectileMeshes.delete(id);
      }
    }
  }

  private syncDrops(list: ItemDrop[], now: number): void {
    const seen = new Set<number>();
    for (const d of list) {
      seen.add(d.id);
      let group = this.dropMeshes.get(d.id);
      if (!group) {
        group = new THREE.Group();
        const color = d.item ? hex(RARITY_COLOR[d.item.rarity]) : 0xe0c040;
        const gem = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.2, 0),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }),
        );
        group.add(gem);

        // PoE's signature rarity beam: magic and better throw a shaft of light
        const rarity = d.item?.rarity;
        if (rarity && rarity !== 'normal') {
          const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.28, 5.5, 10, 1, true),
            new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity: rarity === 'unique' ? 0.4 : rarity === 'rare' ? 0.32 : 0.24,
              side: THREE.DoubleSide,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          beam.position.y = 2.5;
          group.add(beam);
        }

        this.dropMeshes.set(d.id, group);
        this.scene.add(group);

        const el = this.createLabel(
          d.item ? d.item.name : `${d.gold} Gold`,
          d.item ? RARITY_COLOR[d.item.rarity] : '#e0c040',
          'loot-label',
        );
        el.addEventListener('click', () => this.onDropClick?.(d));
        this.dropLabels.set(d.id, { el, ax: d.pos.x, ay: d.pos.y, anchorHeight: 0.62, gap: 6 });
      }
      const bob = Math.sin(now * 3 + d.bobPhase) * 0.07;
      group.position.set(d.pos.x, 0.35 + bob, d.pos.y);
      group.rotation.y = now * 1.2;
    }
    for (const [id, group] of this.dropMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(group);
        group.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
        this.dropMeshes.delete(id);
        const lbl = this.dropLabels.get(id);
        if (lbl) {
          lbl.el.remove();
          this.dropLabels.delete(id);
        }
      }
    }
  }

  private syncGroundEffects(list: GroundEffect[], now: number): void {
    const seen = new Set<number>();
    for (const g of list) {
      seen.add(g.id);
      let mesh = this.groundEffectMeshes.get(g.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.CircleGeometry(1, 24),
          new THREE.MeshBasicMaterial({ color: hex(g.color), transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
        );
        mesh.rotation.x = -Math.PI / 2;
        this.groundEffectMeshes.set(g.id, mesh);
        this.scene.add(mesh);
      }
      const active = g.elapsed >= g.delay;
      const t = Math.min(1, g.elapsed / Math.max(0.01, g.delay));
      const scale = active ? g.radius : g.radius * (0.25 + 0.75 * t);
      mesh.scale.setScalar(scale);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = active ? 0.32 : 0.15 + 0.15 * Math.sin(now * 10);
      mesh.position.set(g.pos.x, 0.06, g.pos.y);
    }
    for (const [id, mesh] of this.groundEffectMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.groundEffectMeshes.delete(id);
      }
    }
  }

  private updateLabels(sim: Simulation): void {
    this.placeLootLabels();
    for (const lbl of this.exitLabels) this.placeLabel(lbl);
    for (const lbl of this.decoLabels) this.placeLabel(lbl);

    const seenBoss = new Set<number>();
    for (const m of sim.monsters) {
      if (!m.def.isBoss) continue;
      seenBoss.add(m.id);
      let lbl = this.bossLabels.get(m.id);
      if (!lbl) {
        const el = this.createLabel(m.def.name, '#ffb4a8', 'world-label-boss');
        lbl = { el, ax: m.pos.x, ay: m.pos.y, anchorHeight: 1.55 * 1.9 + 0.5, gap: 10 };
        this.bossLabels.set(m.id, lbl);
      }
      lbl.ax = m.pos.x;
      lbl.ay = m.pos.y;
      this.placeLabel(lbl);
    }
    for (const [id, lbl] of this.bossLabels) {
      if (!seenBoss.has(id)) {
        lbl.el.remove();
        this.bossLabels.delete(id);
      }
    }
  }

  /**
   * Loot labels are placed like PoE's: each sits above its item, but when several
   * items land on the same spot the labels are pushed apart vertically so every
   * name stays readable and clickable instead of piling into an unreadable stack.
   */
  private placeLootLabels(): void {
    const ROW = 21;
    const placed: { x1: number; x2: number; y: number }[] = [];
    const entries: { lbl: WorldLabel; x: number; y: number; w: number }[] = [];

    for (const [, lbl] of this.dropLabels) {
      const s = this.camera.worldToScreen(lbl.ax, lbl.ay, lbl.anchorHeight);
      if (!s || s.x < -80 || s.x > this.camera.viewW + 80 || s.y < -60 || s.y > this.camera.viewH + 120) {
        lbl.el.style.display = 'none';
        continue;
      }
      lbl.el.style.display = 'block';
      entries.push({ lbl, x: s.x, y: s.y - lbl.gap, w: lbl.el.offsetWidth || 90 });
    }

    // nearest-to-camera first, so closer items keep their natural position
    entries.sort((a, b) => b.y - a.y);

    for (const e of entries) {
      const x1 = e.x - e.w / 2;
      const x2 = e.x + e.w / 2;
      let y = e.y;
      let moved = true;
      let guard = 0;
      while (moved && guard < 24) {
        moved = false;
        guard++;
        for (const p of placed) {
          if (x1 < p.x2 + 4 && x2 > p.x1 - 4 && Math.abs(y - p.y) < ROW) {
            y = p.y - ROW;
            moved = true;
          }
        }
      }
      placed.push({ x1, x2, y });
      e.lbl.el.style.transform = `translate(-50%, -100%) translate(${Math.round(e.x)}px, ${Math.round(y)}px)`;
    }
  }

  private placeLabel(lbl: WorldLabel): void {
    const s = this.camera.worldToScreen(lbl.ax, lbl.ay, lbl.anchorHeight);
    if (!s || s.x < -80 || s.x > this.camera.viewW + 80 || s.y < -60 || s.y > this.camera.viewH + 120) {
      lbl.el.style.display = 'none';
      return;
    }
    lbl.el.style.display = 'block';
    lbl.el.style.transform = `translate(-50%, -100%) translate(${Math.round(s.x)}px, ${Math.round(s.y - lbl.gap)}px)`;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera.three);
  }
}
