import type { Camera } from '../engine/Camera.ts';
import type { Simulation } from '../state/Simulation.ts';

/**
 * Screen-space overlay drawn on a 2D canvas above the 3D scene: floating damage
 * numbers and monster health bars. These sit on their own canvas rather than in the
 * DOM so hundreds of them per second cost nothing and never trigger layout.
 */
export class Overlay {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private camera: Camera;

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(sim: Simulation): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.camera.viewW, this.camera.viewH);

    this.drawHealthBars(sim);
    this.drawDamageNumbers(sim);
  }

  private drawHealthBars(sim: Simulation): void {
    const ctx = this.ctx;
    for (const m of sim.monsters) {
      if (m.dead) continue;
      if (m.def.isBoss) continue; // bosses use the dedicated top-screen bar
      if (m.life >= m.maxLife && m.aiState === 'idle') continue; // only show once engaged/damaged

      const headHeight = 1.55 * (m.def.isBoss ? 1.9 : 1) + m.radius;
      const s = this.camera.worldToScreen(m.pos.x, m.pos.y, headHeight);
      if (!s) continue;

      const w = 38;
      const h = 4;
      const x = s.x - w / 2;
      const y = s.y - 10;
      const pct = Math.max(0, Math.min(1, m.life / m.maxLife));

      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = '#3a0d0d';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#c8342a';
      ctx.fillRect(x, y, w * pct, h);

      // ailment pips so status effects are readable at a glance
      const ail = m.statusEffects;
      if (ail.length > 0) {
        let px = x;
        for (const a of ail.slice(0, 5)) {
          ctx.fillStyle = AILMENT_COLORS[a.type] ?? '#ffffff';
          ctx.fillRect(px, y + h + 2, 5, 2.5);
          px += 7;
        }
      }
    }
  }

  private drawDamageNumbers(sim: Simulation): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of sim.floatingTexts) {
      const s = this.camera.worldToScreen(t.pos.x, t.pos.y, 1.5);
      if (!s) continue;
      const age = 1 - t.life / t.maxLife;
      const alpha = t.life < 0.28 ? Math.max(0, t.life / 0.28) : 1;
      // crits pop larger and settle; normal hits stay a consistent size
      const scale = t.crit ? 1.34 + Math.max(0, 0.4 - age) : 1;
      const size = Math.round((t.fromPlayer ? 19 : 16) * scale);

      ctx.globalAlpha = alpha;
      ctx.font = `bold ${size}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(t.text, s.x, s.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, s.x, s.y);

      if (t.crit) {
        ctx.font = `bold ${Math.round(size * 0.5)}px "Trebuchet MS", system-ui, sans-serif`;
        ctx.strokeText('CRITICAL', s.x, s.y - size * 0.78);
        ctx.fillText('CRITICAL', s.x, s.y - size * 0.78);
      }
    }
    ctx.globalAlpha = 1;
  }
}

const AILMENT_COLORS: Record<string, string> = {
  ignite: '#ff8a4a',
  chill: '#8ad8ff',
  freeze: '#c8f0ff',
  shock: '#ffe87a',
  poison: '#a0e060',
  bleed: '#e04040',
};
