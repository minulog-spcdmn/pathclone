import * as THREE from 'three';

export type RigKind = 'humanoid' | 'quadruped' | 'blob';
export type WeaponKind = 'mace' | 'staff' | 'bow' | 'sceptre' | 'wand' | 'crossbow' | 'sword' | 'none';

export interface RigOptions {
  kind: RigKind;
  color: string;
  scale?: number;
  weapon?: WeaponKind;
  headColor?: string;
}

interface HumanoidParts {
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
}

export interface CreatureRig {
  kind: RigKind;
  group: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  humanoid?: HumanoidParts;
  quadLegs?: THREE.Group[];
  quadBody?: THREE.Group;
  blobMesh?: THREE.Mesh;
  walkPhase: number;
  swingAmp: number;
  prevX: number;
  prevY: number;
  baseScale: number;
}

/**
 * All rigs are built facing +Z. Sim facing angle θ (atan2 over sim x/y, where sim y maps
 * to three z) converts to rotation.y = π/2 − θ, which maps model-forward +Z onto (cos θ, sin θ).
 */
export function simFacingToRotationY(facing: number): number {
  return Math.PI / 2 - facing;
}

function mat(rig: { mats: THREE.MeshStandardMaterial[] }, color: THREE.Color | number, roughness = 0.7): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
  rig.mats.push(m);
  return m;
}

function addShadow(group: THREE.Group, radius: number): void {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.36, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.renderOrder = -1;
  group.add(shadow);
}

function buildWeapon(rig: CreatureRig, kind: WeaponKind): THREE.Object3D | null {
  const wood = mat(rig, 0x4a3826, 0.85);
  const metal = mat(rig, 0x8a8f98, 0.35);
  switch (kind) {
    case 'mace': {
      const g = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), wood);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), metal);
      head.position.y = 0.3;
      g.add(handle, head);
      return g;
    }
    case 'staff': {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.05, 6), wood);
      g.add(shaft);
      return g;
    }
    case 'bow': {
      const g = new THREE.Group();
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.022, 6, 14, Math.PI), wood);
      arc.rotation.y = Math.PI / 2;
      arc.rotation.z = Math.PI / 2;
      g.add(arc);
      return g;
    }
    case 'crossbow': {
      const g = new THREE.Group();
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), wood);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.05), metal);
      bar.position.z = 0.16;
      g.add(stock, bar);
      return g;
    }
    case 'sceptre':
    case 'wand': {
      const g = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, kind === 'sceptre' ? 0.4 : 0.3, 6), wood);
      // orb material intentionally NOT in rig.mats: it keeps its own emissive glow (hit-flash skips it)
      const orbMat = new THREE.MeshStandardMaterial({ color: 0x8a5ac0, emissive: 0x6a3aa0, emissiveIntensity: 0.7, roughness: 0.3 });
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), orbMat);
      orb.position.y = kind === 'sceptre' ? 0.24 : 0.19;
      g.add(rod, orb);
      return g;
    }
    case 'sword': {
      const g = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.44, 0.07), metal);
      blade.position.y = 0.22;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.05), wood);
      g.add(blade, guard);
      return g;
    }
    case 'none':
      return null;
  }
}

function buildHumanoid(rig: CreatureRig, opts: RigOptions): void {
  const color = new THREE.Color(opts.color);
  const bodyMat = mat(rig, color);
  const limbMat = mat(rig, color.clone().offsetHSL(0, 0, -0.06));
  const headMat = mat(rig, opts.headColor ? new THREE.Color(opts.headColor) : color.clone().offsetHSL(0, 0, 0.14), 0.55);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 8), bodyMat);
  torso.position.y = 1.0;
  rig.group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), headMat);
  head.position.y = 1.5;
  rig.group.add(head);

  const legGeom = new THREE.CapsuleGeometry(0.068, 0.44, 4, 6);
  const legL = new THREE.Group();
  legL.position.set(-0.11, 0.66, 0);
  const legLMesh = new THREE.Mesh(legGeom, limbMat);
  legLMesh.position.y = -0.3;
  legL.add(legLMesh);
  const legR = new THREE.Group();
  legR.position.set(0.11, 0.66, 0);
  const legRMesh = new THREE.Mesh(legGeom.clone(), limbMat);
  legRMesh.position.y = -0.3;
  legR.add(legRMesh);
  rig.group.add(legL, legR);

  const armGeom = new THREE.CapsuleGeometry(0.052, 0.36, 4, 6);
  const armL = new THREE.Group();
  armL.position.set(-0.27, 1.22, 0);
  const armLMesh = new THREE.Mesh(armGeom, limbMat);
  armLMesh.position.y = -0.22;
  armL.add(armLMesh);
  const armR = new THREE.Group();
  armR.position.set(0.27, 1.22, 0);
  const armRMesh = new THREE.Mesh(armGeom.clone(), limbMat);
  armRMesh.position.y = -0.22;
  armR.add(armRMesh);
  rig.group.add(armL, armR);

  const weapon = buildWeapon(rig, opts.weapon ?? 'none');
  if (weapon) {
    weapon.position.set(0.02, -0.42, 0.06);
    armR.add(weapon);
  }

  addShadow(rig.group, 0.38);
  rig.humanoid = { legL, legR, armL, armR, torso, head };
}

function buildQuadruped(rig: CreatureRig, opts: RigOptions): void {
  const color = new THREE.Color(opts.color);
  const bodyMat = mat(rig, color);
  const limbMat = mat(rig, color.clone().offsetHSL(0, 0, -0.07));

  const body = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 8), bodyMat);
  trunk.rotation.x = Math.PI / 2; // lay along Z
  trunk.position.y = 0.46;
  body.add(trunk);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), bodyMat);
  head.position.set(0, 0.56, 0.38);
  body.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.14), limbMat);
  snout.position.set(0, 0.52, 0.5);
  body.add(snout);

  rig.group.add(body);
  rig.quadBody = body;

  const legGeom = new THREE.CapsuleGeometry(0.045, 0.3, 4, 6);
  const legs: THREE.Group[] = [];
  const positions: [number, number][] = [
    [-0.13, 0.22],
    [0.13, 0.22],
    [-0.13, -0.22],
    [0.13, -0.22],
  ];
  for (const [x, z] of positions) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.42, z);
    const meshLeg = new THREE.Mesh(legGeom.clone(), limbMat);
    meshLeg.position.y = -0.2;
    leg.add(meshLeg);
    rig.group.add(leg);
    legs.push(leg);
  }
  rig.quadLegs = legs;

  addShadow(rig.group, 0.4);
}

function buildBlob(rig: CreatureRig, opts: RigOptions): void {
  const bodyMat = mat(rig, new THREE.Color(opts.color), 0.9);
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), bodyMat);
  blob.position.y = 0.32;
  blob.scale.y = 0.82;
  rig.group.add(blob);
  rig.blobMesh = blob;

  const eyeMat = mat(rig, 0x181410, 0.4);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
    eye.position.set(side * 0.11, 0.42, 0.27);
    rig.group.add(eye);
  }

  addShadow(rig.group, 0.36);
}

export function createRig(opts: RigOptions): CreatureRig {
  const rig: CreatureRig = {
    kind: opts.kind,
    group: new THREE.Group(),
    mats: [],
    walkPhase: 0,
    swingAmp: 0,
    prevX: 0,
    prevY: 0,
    baseScale: opts.scale ?? 1,
  };
  if (opts.kind === 'humanoid') buildHumanoid(rig, opts);
  else if (opts.kind === 'quadruped') buildQuadruped(rig, opts);
  else buildBlob(rig, opts);
  rig.group.scale.setScalar(rig.baseScale);
  return rig;
}

export function updateRig(
  rig: CreatureRig,
  pos: { x: number; y: number },
  facing: number,
  now: number,
  lastAttackAt: number,
  lastHitAt: number,
): void {
  const dx = pos.x - rig.prevX;
  const dy = pos.y - rig.prevY;
  const dist = Math.hypot(dx, dy);
  const moving = dist > 0.0015;
  rig.prevX = pos.x;
  rig.prevY = pos.y;
  rig.walkPhase += dist * 5.2;
  rig.swingAmp += ((moving ? 1 : 0) - rig.swingAmp) * 0.25;

  rig.group.position.set(pos.x, 0, pos.y);
  rig.group.rotation.y = simFacingToRotationY(facing);

  const attackElapsed = now - lastAttackAt;
  const attacking = attackElapsed >= 0 && attackElapsed < 0.3;
  const swing = Math.sin(rig.walkPhase) * rig.swingAmp;

  if (rig.humanoid) {
    const h = rig.humanoid;
    h.legL.rotation.x = swing * 0.62;
    h.legR.rotation.x = -swing * 0.62;
    h.armL.rotation.x = -swing * 0.45;
    if (attacking) {
      // fast overhead chop toward model-forward (+Z): raise then sweep down
      const t = attackElapsed / 0.3;
      const ease = 1 - (1 - t) * (1 - t);
      h.armR.rotation.x = -2.3 + ease * 2.1;
    } else {
      h.armR.rotation.x = swing * 0.45;
    }
    rig.group.position.y = Math.abs(Math.sin(rig.walkPhase)) * 0.045 * rig.swingAmp;
    h.torso.rotation.y = swing * 0.07;
  } else if (rig.quadLegs && rig.quadBody) {
    for (let i = 0; i < rig.quadLegs.length; i++) {
      const phase = i === 0 || i === 3 ? 0 : Math.PI;
      rig.quadLegs[i].rotation.x = Math.sin(rig.walkPhase + phase) * 0.55 * rig.swingAmp;
    }
    rig.quadBody.position.y = Math.abs(Math.sin(rig.walkPhase)) * 0.03 * rig.swingAmp;
    if (attacking) {
      const t = attackElapsed / 0.3;
      rig.quadBody.position.z = Math.sin(t * Math.PI) * 0.22;
    } else {
      rig.quadBody.position.z = 0;
    }
  } else if (rig.blobMesh) {
    const idle = Math.sin(now * 5 + rig.walkPhase) * 0.05;
    const hop = Math.abs(Math.sin(rig.walkPhase * 1.3)) * 0.16 * rig.swingAmp;
    rig.blobMesh.scale.set(1 + idle + hop * 0.4, 0.82 - idle - hop * 0.4, 1 + idle + hop * 0.4);
    rig.group.position.y = hop;
    if (attacking) {
      const t = (now - lastAttackAt) / 0.3;
      rig.blobMesh.scale.z += Math.sin(t * Math.PI) * 0.35;
    }
  }

  // brief white flash when hit
  const hitElapsed = now - lastHitAt;
  const flash = hitElapsed >= 0 && hitElapsed < 0.1 ? 0.3 * (1 - hitElapsed / 0.1) : 0;
  for (const m of rig.mats) {
    m.emissive.setScalar(flash);
  }
}

export function disposeRig(rig: CreatureRig): void {
  rig.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
}
