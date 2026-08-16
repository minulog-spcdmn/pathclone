import { Camera, TILE_H, TILE_W } from '../engine/Camera.ts';
import type { Zone } from '../world/Zone.ts';
import type { Player } from '../entities/Player.ts';
import type { Monster } from '../entities/Monster.ts';
import type { Minion } from '../entities/Minion.ts';
import type { Projectile } from '../entities/Projectile.ts';
import type { ItemDrop } from '../entities/ItemDrop.ts';
import type { GroundEffect } from '../entities/GroundEffect.ts';
import { RARITY_COLOR } from '../core/item.ts';

function hashTile(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) ^ (x * 3266489917);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
}

export class WorldRenderer {
  private ctx: CanvasRenderingContext2D;
  private camera: Camera;

  constructor(ctx: CanvasRenderingContext2D, camera: Camera) {
    this.ctx = ctx;
    this.camera = camera;
  }

  drawFloor(zone: Zone): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const corners = [
      cam.screenToWorld(0, 0),
      cam.screenToWorld(cam.viewW, 0),
      cam.screenToWorld(0, cam.viewH),
      cam.screenToWorld(cam.viewW, cam.viewH),
    ];
    let minX = Math.floor(Math.min(...corners.map((c) => c.x))) - 2;
    let maxX = Math.ceil(Math.max(...corners.map((c) => c.x))) + 2;
    let minY = Math.floor(Math.min(...corners.map((c) => c.y))) - 2;
    let maxY = Math.ceil(Math.max(...corners.map((c) => c.y))) + 2;
    minX = Math.max(0, minX);
    minY = Math.max(0, minY);
    maxX = Math.min(zone.def.width - 1, maxX);
    maxY = Math.min(zone.def.height - 1, maxY);

    const hw = (TILE_W / 2) * cam.zoom;
    const hh = (TILE_H / 2) * cam.zoom;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const walkable = zone.isWalkableTile(x, y);
        const s = cam.worldToScreen(x + 0.5, y + 0.5);
        const n = hashTile(x, y);
        if (walkable) {
          const c = shade(zone.def.groundColor, Math.round((n - 0.5) * 22));
          ctx.fillStyle = c;
          diamondPath(ctx, s.x, s.y, hw + 0.5, hh + 0.5);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.06)';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          // wall: raised block using two shaded faces for pseudo-3D
          const topColor = shade(zone.def.wallColor, 22);
          const sideColor = shade(zone.def.wallColor, -18);
          const wallH = TILE_H * 1.6 * cam.zoom;
          ctx.fillStyle = sideColor;
          ctx.beginPath();
          ctx.moveTo(s.x - hw, s.y);
          ctx.lineTo(s.x, s.y + hh);
          ctx.lineTo(s.x, s.y + hh - wallH);
          ctx.lineTo(s.x - hw, s.y - wallH);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = shade(zone.def.wallColor, -34);
          ctx.beginPath();
          ctx.moveTo(s.x + hw, s.y);
          ctx.lineTo(s.x, s.y + hh);
          ctx.lineTo(s.x, s.y + hh - wallH);
          ctx.lineTo(s.x + hw, s.y - wallH);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = topColor;
          diamondPath(ctx, s.x, s.y - wallH, hw, hh);
          ctx.fill();
        }
      }
    }
  }

  drawDecorations(zone: Zone): void {
    const ctx = this.ctx;
    for (const d of zone.decorations) {
      const s = this.camera.worldToScreen(d.pos.x, d.pos.y);
      ctx.save();
      ctx.translate(s.x, s.y);
      if (d.kind === 'waypoint') {
        ctx.fillStyle = '#5ac0d0';
        ctx.beginPath();
        ctx.arc(0, -14, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#eaffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (d.kind === 'stash') {
        ctx.fillStyle = '#8a6a3a';
        ctx.fillRect(-14, -22, 28, 22);
        ctx.strokeStyle = '#3a2a10';
        ctx.strokeRect(-14, -22, 28, 22);
      } else {
        ctx.fillStyle = d.kind === 'bush' ? '#3a5a3a' : '#5a5248';
        ctx.beginPath();
        ctx.ellipse(0, -3, 9, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawExits(zone: Zone): void {
    const ctx = this.ctx;
    for (const exit of zone.exits) {
      const s = this.camera.worldToScreen(exit.pos.x, exit.pos.y);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = 'rgba(120,220,140,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8afab0';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#dfffe8';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(exit.label, 0, -18);
      ctx.restore();
    }
  }

  drawGroundEffects(effects: GroundEffect[], now: number): void {
    const ctx = this.ctx;
    for (const e of effects) {
      const s = this.camera.worldToScreen(e.pos.x, e.pos.y);
      const active = e.elapsed >= e.delay;
      const r = e.radius * (TILE_W / 2) * this.camera.zoom;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(1, TILE_H / TILE_W);
      if (!active) {
        const t = Math.min(1, e.elapsed / Math.max(0.01, e.delay));
        ctx.strokeStyle = e.color;
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(now * 10);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.3 + 0.7 * t), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = e.color;
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawItemDrops(drops: ItemDrop[], now: number): void {
    const ctx = this.ctx;
    for (const d of drops) {
      const s = this.camera.worldToScreen(d.pos.x, d.pos.y);
      const bob = Math.sin(now * 3 + d.bobPhase) * 3;
      ctx.save();
      ctx.translate(s.x, s.y - 10 - bob);
      let color = '#e0c040';
      if (d.item) color = RARITY_COLOR[d.item.rarity];
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
      diamondPath(ctx, 0, 0, 9, 9);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawEntity(kind: 'player', e: Player, opts: { selected?: boolean; now: number }): void;
  drawEntity(kind: 'monster', e: Monster, opts: { selected?: boolean; now: number }): void;
  drawEntity(kind: 'minion', e: Minion, opts: { selected?: boolean; now: number }): void;
  drawEntity(kind: 'player' | 'monster' | 'minion', e: Player | Monster | Minion, opts: { selected?: boolean; now: number }): void {
    const ctx = this.ctx;
    const s = this.camera.worldToScreen(e.pos.x, e.pos.y);
    const zoom = this.camera.zoom;
    ctx.save();
    ctx.translate(s.x, s.y);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 4 * zoom, 12 * zoom, 5 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();

    let color = '#ffffff';
    let bodyH = 26 * zoom;
    let bodyR = 10 * zoom;
    if (kind === 'player') {
      color = '#eee6c8';
    } else if (kind === 'minion') {
      color = (e as Minion).def.color;
      bodyH = 20 * zoom;
      bodyR = 8 * zoom;
    } else {
      const m = e as Monster;
      color = m.def.color;
      bodyR = (8 + m.radius * 6) * zoom;
      bodyH = m.def.isBoss ? 40 * zoom : 22 * zoom;
      if (m.def.isBoss) bodyR *= 1.4;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -bodyH * 0.5, bodyR, bodyH * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5 * zoom;
    ctx.stroke();

    // facing indicator
    const fx = Math.cos(e.facing) * bodyR * 0.9;
    const fy = Math.sin(e.facing) * bodyR * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(fx, -bodyH * 0.5 + fy, 2.6 * zoom, 0, Math.PI * 2);
    ctx.fill();

    if (opts.selected) {
      ctx.strokeStyle = '#ff5050';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 3 * zoom, bodyR + 4, (bodyR + 4) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    // health bar
    if (kind !== 'player') {
      const life = (e as Monster | Minion).life;
      const maxLife = (e as Monster | Minion).maxLife;
      if (life < maxLife || (kind === 'monster' && (e as Monster).def.isBoss)) {
        this.drawHealthBar(s.x, s.y - bodyH - 6, life, maxLife, kind === 'monster' && (e as Monster).def.isBoss);
      }
    }
  }

  drawHealthBar(x: number, y: number, life: number, maxLife: number, isBoss = false): void {
    const ctx = this.ctx;
    const w = isBoss ? 70 : 30;
    const h = isBoss ? 6 : 4;
    const pct = Math.max(0, life / maxLife);
    ctx.save();
    ctx.translate(x - w / 2, y);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-1, -1, w + 2, h + 2);
    ctx.fillStyle = '#7a1414';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = isBoss ? '#e0463c' : '#4ccc4c';
    ctx.fillRect(0, 0, w * pct, h);
    ctx.restore();
  }

  drawProjectiles(projectiles: Projectile[]): void {
    const ctx = this.ctx;
    for (const p of projectiles) {
      const s = this.camera.worldToScreen(p.pos.x, p.pos.y, 0.4);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 5 * this.camera.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  worldDepth(x: number, y: number): number {
    return x + y;
  }

  drawFloatingTexts(texts: { pos: { x: number; y: number }; text: string; color: string; life: number }[]): void {
    const ctx = this.ctx;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    for (const t of texts) {
      const s = this.camera.worldToScreen(t.pos.x, t.pos.y);
      ctx.globalAlpha = Math.min(1, t.life / 0.3);
      ctx.fillStyle = t.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, s.x, s.y);
      ctx.fillText(t.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }
}
