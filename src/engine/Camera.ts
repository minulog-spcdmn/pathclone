import type { Vec2 } from './Vec2.ts';

/** 2:1 isometric projection camera. World tiles are TILE_W x TILE_H diamonds. */
export const TILE_W = 64;
export const TILE_H = 32;

export class Camera {
  x = 0; // world-space focus point
  y = 0;
  zoom = 1;
  viewW = 0;
  viewH = 0;

  worldToScreen(wx: number, wy: number, wz = 0): Vec2 {
    const isoX = (wx - wy) * (TILE_W / 2);
    const isoY = (wx + wy) * (TILE_H / 2) - wz;
    return {
      x: (isoX - this.x) * this.zoom + this.viewW / 2,
      y: (isoY - this.y) * this.zoom + this.viewH / 2,
    };
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    const isoX = (sx - this.viewW / 2) / this.zoom + this.x;
    const isoY = (sy - this.viewH / 2) / this.zoom + this.y;
    const wx = isoX / (TILE_W / 2) + isoY / (TILE_H / 2);
    const wy = isoY / (TILE_H / 2) - isoX / (TILE_W / 2);
    return { x: wx / 2, y: wy / 2 };
  }

  centerOn(wx: number, wy: number): void {
    this.x = (wx - wy) * (TILE_W / 2);
    this.y = (wx + wy) * (TILE_H / 2);
  }
}
