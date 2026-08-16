import * as THREE from 'three';
import type { Vec2 } from './Vec2.ts';

/**
 * Perspective camera rig that follows a focus point on the ground plane (sim x/y maps
 * to Three's x/z, sim "up" is Three's y). Provides the same screen<->world projection
 * surface the rest of the game (input aiming, UI overlays) depends on, backed by a real
 * perspective camera instead of a flat isometric projection.
 */
export class Camera {
  readonly three: THREE.PerspectiveCamera;
  viewW = 0;
  viewH = 0;
  /** Offset from focus point to camera position, in world units. */
  offset = new THREE.Vector3(0, 15, 11);
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private focus = new THREE.Vector3(0, 0, 0);
  private smoothedFocus = new THREE.Vector3(0, 0, 0);
  private initialized = false;

  constructor() {
    this.three = new THREE.PerspectiveCamera(42, 1, 0.1, 260);
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.three.aspect = w / Math.max(1, h);
    this.three.updateProjectionMatrix();
  }

  /** Smoothly follow (x, y) — call once per frame with the real frame dt. */
  centerOn(x: number, y: number, dt = 1): void {
    this.focus.set(x, 0, y);
    if (!this.initialized) {
      this.smoothedFocus.copy(this.focus);
      this.initialized = true;
    } else {
      const t = 1 - Math.pow(0.001, dt);
      this.smoothedFocus.lerp(this.focus, t);
    }
    this.applyPosition();
  }

  /** Instantly snap the follow point, e.g. on zone change — no smoothing lag. */
  snapTo(x: number, y: number): void {
    this.focus.set(x, 0, y);
    this.smoothedFocus.copy(this.focus);
    this.initialized = true;
    this.applyPosition();
  }

  private applyPosition(): void {
    this.three.position.set(
      this.smoothedFocus.x + this.offset.x,
      this.offset.y,
      this.smoothedFocus.z + this.offset.z,
    );
    this.three.lookAt(this.smoothedFocus.x, 1.1, this.smoothedFocus.z);
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
    if (!ok) return { x: this.smoothedFocus.x, y: this.smoothedFocus.z };
    return { x: hit.x, y: hit.z };
  }
}
