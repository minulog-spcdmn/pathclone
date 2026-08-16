import * as THREE from 'three';
import type { Vec2 } from './Vec2.ts';

/**
 * Perspective camera rig hard-locked to a focus point on the ground plane (sim x/y maps
 * to Three's x/z, sim "up" is Three's y). The character is always dead-center on screen —
 * no follow smoothing, matching how an ARPG camera tracks the player.
 */
export class Camera {
  readonly three: THREE.PerspectiveCamera;
  viewW = 0;
  viewH = 0;
  /** Offset from focus point to camera position, in world units. */
  offset = new THREE.Vector3(0, 12.5, 8.75);
  /**
   * World height the camera aims at, relative to the focus point's ground position.
   * Negative values raise the character on screen, which compensates for the bottom
   * HUD so the character reads as centered in the visible playfield rather than in
   * the raw viewport rectangle. Recomputed by fitPlayfield() from the HUD's actual
   * pixel height, so it stays correct at any viewport size instead of assuming one.
   */
  aimHeight = 0;
  /** Reference world-space height (roughly the character's torso) used to fit the playfield. */
  private static readonly PLAYER_EYE_HEIGHT = 0.9;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private focus = new THREE.Vector3(0, 0, 0);

  constructor() {
    this.three = new THREE.PerspectiveCamera(42, 1, 0.1, 260);
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.three.aspect = w / Math.max(1, h);
    this.three.updateProjectionMatrix();
  }

  /**
   * Solves aimHeight so a point at PLAYER_EYE_HEIGHT lands `hudHeightPx / 2` pixels above
   * true vertical screen center — i.e. dead-center in the space still visible above the
   * bottom HUD bar. Uses the camera's own projection (binary search) rather than a formula
   * tuned for one aspect ratio, so it's exact at any viewport size or FOV/offset tuning.
   */
  fitPlayfield(hudHeightPx: number): void {
    const desiredShiftPx = hudHeightPx / 2;
    let lo = -this.offset.y;
    let hi = this.offset.y;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      this.aimHeight = mid;
      this.centerOn(0, 0);
      const s = this.worldToScreen(0, 0, Camera.PLAYER_EYE_HEIGHT);
      const shift = s ? this.viewH / 2 - s.y : 0;
      // shift is a decreasing function of aimHeight (more negative = character raised more);
      // too little shift means aimHeight needs to go down, not up.
      if (shift < desiredShiftPx) hi = mid;
      else lo = mid;
    }
    this.aimHeight = (lo + hi) / 2;
    // centerOn(0,0) above was only for measurement — the caller re-centers on the real
    // focus point every frame anyway, so no explicit restore is needed here.
  }

  centerOn(x: number, y: number): void {
    this.focus.set(x, 0, y);
    this.three.position.set(this.focus.x + this.offset.x, this.offset.y, this.focus.z + this.offset.z);
    this.three.lookAt(this.focus.x, this.aimHeight, this.focus.z);
    // Normally refreshed as a side effect of renderer.render(), but worldToScreen() is also
    // used for label placement and the fitPlayfield() solve below, which run independently
    // of a render call — without this, projections use a stale matrixWorldInverse.
    this.three.updateMatrixWorld(true);
  }

  /** Same as centerOn — kept for call-site clarity on zone changes. */
  snapTo(x: number, y: number): void {
    this.centerOn(x, y);
  }

  worldToScreen(x: number, y: number, z = 0): Vec2 | null {
    const v = new THREE.Vector3(x, z, y).project(this.three);
    if (v.z > 1 || v.z < -1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * this.viewW,
      y: (1 - (v.y * 0.5 + 0.5)) * this.viewH,
    };
  }

  /** Unproject a screen point onto the ground plane (world y=0), returning sim (x,y). */
  screenToWorld(sx: number, sy: number): Vec2 {
    const ndcX = (sx / Math.max(1, this.viewW)) * 2 - 1;
    const ndcY = -(sy / Math.max(1, this.viewH)) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.three);
    const hit = new THREE.Vector3();
    const ok = this.raycaster.ray.intersectPlane(this.groundPlane, hit);
    if (!ok) return { x: this.focus.x, y: this.focus.z };
    return { x: hit.x, y: hit.z };
  }
}
