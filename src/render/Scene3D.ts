import * as THREE from 'three';
import type { Camera } from '../engine/Camera.ts';
import type { Zone } from '../world/Zone.ts';
import type { Simulation } from '../state/Simulation.ts';
import type { Monster } from '../entities/Monster.ts';
import type { Minion } from '../entities/Minion.ts';
import type { Projectile } from '../entities/Projectile.ts';
import type { ItemDrop } from '../entities/ItemDrop.ts';
import type { GroundEffect } from '../entities/GroundEffect.ts';
import { RARITY_COLOR } from '../core/item.ts';
import type { CreatureRig } from './rigs.ts';
import { createCreatureRig, disposeRig, updateRigTransform } from './rigs.ts';

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

interface WorldLabel {
  el: HTMLDivElement;
  pos: { x: number; y: number; z: number };
  visible: boolean;
}

export class Scene3D {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  camera: Camera;
  labelLayer: HTMLElement;

  private floorMesh: THREE.InstancedMesh | null = null;
  private wallMesh: THREE.InstancedMesh | null = null;
  private decorGroup = new THREE.Group();
  private exitGroup = new THREE.Group();

  private playerRig: CreatureRig;
  private monsterRigs = new Map<number, CreatureRig>();
  private minionRigs = new Map<number, CreatureRig>();
  private projectileMeshes = new Map<number, THREE.Mesh>();
  private dropMeshes = new Map<number, THREE.Group>();
  private groundEffectMeshes = new Map<number, THREE.Mesh>();

  private dropLabels = new Map<number, WorldLabel>();
  private exitLabels: WorldLabel[] = [];
  private nameplateLabels = new Map<number, WorldLabel>();

  constructor(canvas: HTMLCanvasElement, camera: Camera, labelLayer: HTMLElement) {
    this.camera = camera;
    this.labelLayer = labelLayer;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0x08070a);
    this.scene.fog = new THREE.Fog(0x08070a, 16, 62);

    const ambient = new THREE.AmbientLight(0xccd4ff, 0.55);
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.15);
    sun.position.set(-10, 18, 8);
    const fill = new THREE.HemisphereLight(0x8090c0, 0x201810, 0.4);
    this.scene.add(ambient, sun, fill);

    this.scene.add(this.decorGroup, this.exitGroup);

    this.playerRig = createCreatureRig('#eee6c8', 1, '#f4ecd4');
    this.scene.add(this.playerRig.group);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.resize(w, h);
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
    floorMesh.receiveShadow = false;
    this.scene.add(floorMesh, wallMesh);
    this.floorMesh = floorMesh;
    this.wallMesh = wallMesh;

    this.scene.fog = new THREE.Fog(hex(zone.def.wallColor), 14, zone.def.kind === 'town' ? 60 : 34);

    for (const deco of zone.decorations) {
      const mesh = this.buildDecoration(deco.kind, zone.def.accentColor);
      mesh.position.set(deco.pos.x, 0, deco.pos.y);
      this.decorGroup.add(mesh);
    }

    for (const exit of zone.exits) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.85, 24),
        new THREE.MeshBasicMaterial({ color: 0x7af0a0, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(exit.pos.x, 0.05, exit.pos.y);
      this.exitGroup.add(ring);

      const label = this.createLabel(exit.label, '#bdf0c8');
      this.exitLabels.push({ el: label, pos: { x: exit.pos.x, y: 1.4, z: exit.pos.y }, visible: true });
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
  }

  private createLabel(text: string, color: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'world-label';
    el.textContent = text;
    el.style.color = color;
    this.labelLayer.appendChild(el);
    return el;
  }

  private syncCreaturePool<T extends { id: number; pos: { x: number; y: number }; facing: number }>(
    pool: Map<number, CreatureRig>,
    list: T[],
    makeRig: (item: T) => CreatureRig,
  ): void {
    const seen = new Set<number>();
    for (const item of list) {
      seen.add(item.id);
      let rig = pool.get(item.id);
      if (!rig) {
        rig = makeRig(item);
        pool.set(item.id, rig);
        this.scene.add(rig.group);
      }
      updateRigTransform(rig, item.pos, item.facing, performance.now() / 1000);
    }
    for (const [id, rig] of pool) {
      if (!seen.has(id)) {
        this.scene.remove(rig.group);
        disposeRig(rig);
        pool.delete(id);
        const label = this.nameplateLabels.get(id);
        if (label) {
          label.el.remove();
          this.nameplateLabels.delete(id);
        }
      }
    }
  }

  syncFrame(sim: Simulation): void {
    const now = sim.time;
    updateRigTransform(this.playerRig, sim.player.pos, sim.player.facing, now);
    this.playerRig.group.visible = !sim.player.dead;

    this.syncCreaturePool(this.monsterRigs, sim.monsters, (m) => {
      const mm = m as unknown as Monster;
      return createCreatureRig(mm.def.color, mm.def.isBoss ? 1.7 : 0.9 + mm.radius * 0.3);
    });
    this.syncCreaturePool(this.minionRigs, sim.minions, (m) => {
      const mm = m as unknown as Minion;
      return createCreatureRig(mm.def.color, 0.8);
    });

    this.syncProjectiles(sim.projectiles);
    this.syncDrops(sim.drops, now);
    this.syncGroundEffects(sim.groundEffects, now);

    if (this.decorGroup.children.length) {
      for (const child of this.decorGroup.children) {
        const spin = (child as THREE.Object3D).userData.spin as THREE.Object3D | undefined;
        if (spin) spin.rotation.y = now * 1.4;
      }
    }
    for (const ring of this.exitGroup.children) {
      ring.rotation.z = now * 0.5;
    }

    this.updateLabels(sim);
  }

  private syncProjectiles(list: Projectile[]): void {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let mesh = this.projectileMeshes.get(p.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 8, 8),
          new THREE.MeshStandardMaterial({ color: hex(p.color), emissive: hex(p.color), emissiveIntensity: 1.4 }),
        );
        this.projectileMeshes.set(p.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(p.pos.x, 0.55, p.pos.y);
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
          new THREE.OctahedronGeometry(0.22, 0),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }),
        );
        group.add(gem);
        this.dropMeshes.set(d.id, group);
        this.scene.add(group);

        const label = this.createLabel(d.item ? d.item.name : `${d.gold} Gold`, d.item ? `#${RARITY_COLOR[d.item.rarity].slice(1)}` : '#e0c040');
        this.dropLabels.set(d.id, { el: label, pos: { x: d.pos.x, y: 0.9, z: d.pos.y }, visible: true });
      }
      const bob = Math.sin(now * 3 + d.bobPhase) * 0.08;
      group.position.set(d.pos.x, 0.4 + bob, d.pos.y);
      group.rotation.y = now * 1.2;
      const lbl = this.dropLabels.get(d.id);
      if (lbl) lbl.pos = { x: d.pos.x, y: 0.9 + bob, z: d.pos.y };
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
    for (const [, lbl] of this.dropLabels) this.placeLabel(lbl);
    for (const lbl of this.exitLabels) this.placeLabel(lbl);

    const seenBoss = new Set<number>();
    for (const m of sim.monsters) {
      if (!m.def.isBoss) continue;
      seenBoss.add(m.id);
      let lbl = this.nameplateLabels.get(m.id);
      if (!lbl) {
        const el = this.createLabel(m.def.name, '#ffb4a8');
        el.classList.add('world-label-boss');
        lbl = { el, pos: { x: m.pos.x, y: 0, z: m.pos.y }, visible: true };
        this.nameplateLabels.set(m.id, lbl);
      }
      lbl.pos = { x: m.pos.x, y: 1.9, z: m.pos.y };
      this.placeLabel(lbl);
    }
    for (const [id, lbl] of this.nameplateLabels) {
      if (!seenBoss.has(id)) {
        lbl.el.remove();
        this.nameplateLabels.delete(id);
      }
    }
  }

  private placeLabel(lbl: WorldLabel): void {
    const s = this.camera.worldToScreen(lbl.pos.x, lbl.pos.z, lbl.pos.y);
    if (!s) {
      lbl.el.style.display = 'none';
      return;
    }
    lbl.el.style.display = 'block';
    lbl.el.style.transform = `translate(-50%, -100%) translate(${s.x}px, ${s.y}px)`;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera.three);
  }
}
