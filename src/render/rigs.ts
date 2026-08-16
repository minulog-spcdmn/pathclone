import * as THREE from 'three';

export interface CreatureRig {
  group: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  weapon: THREE.Mesh;
  shadow: THREE.Mesh;
  prevPos: { x: number; y: number };
  baseScale: number;
}

/** Maps a sim facing angle (atan2 convention over sim x/y) to a Three.js Y rotation. */
export function simFacingToThreeY(facing: number): number {
  return Math.PI / 2 - facing;
}

export function createCreatureRig(colorHex: string, scale = 1, headColorHex?: string): CreatureRig {
  const group = new THREE.Group();
  const color = new THREE.Color(colorHex);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.renderOrder = -1;
  group.add(shadow);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 0.5, 4, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.04 }),
  );
  torso.position.y = 0.6;
  torso.castShadow = false;
  group.add(torso);

  const headColor = headColorHex ? new THREE.Color(headColorHex) : color.clone().offsetHSL(0, 0, 0.14);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 14, 12),
    new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.55 }),
  );
  head.position.y = 1.1;
  group.add(head);

  const weapon = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.07, 0.62),
    new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.4, metalness: 0.3 }),
  );
  weapon.position.set(0.32, 0.68, 0.1);
  group.add(weapon);

  group.scale.setScalar(scale);

  return { group, torso, head, weapon, shadow, prevPos: { x: 0, y: 0 }, baseScale: scale };
}

export function updateRigTransform(rig: CreatureRig, pos: { x: number; y: number }, facing: number, time: number, extraBob = 0): void {
  const dx = pos.x - rig.prevPos.x;
  const dy = pos.y - rig.prevPos.y;
  const moving = dx * dx + dy * dy > 0.00002;
  rig.prevPos.x = pos.x;
  rig.prevPos.y = pos.y;

  rig.group.position.set(pos.x, 0, pos.y);
  rig.group.rotation.y = simFacingToThreeY(facing);
  const bob = moving ? Math.abs(Math.sin(time * 11)) * 0.07 : Math.sin(time * 2.2) * 0.015;
  rig.group.position.y = bob + extraBob;
  const lean = moving ? Math.sin(time * 11) * 0.05 : 0;
  rig.torso.rotation.z = lean;
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
