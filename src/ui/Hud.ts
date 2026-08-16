import type { Simulation } from '../state/Simulation.ts';
import { SKILLS } from '../data/skills.ts';
import { ITEM_BASES } from '../data/items.ts';
import { xpForLevel } from '../entities/Player.ts';

const SKILL_KEY_LABELS = ['LMB', 'MMB', 'RMB', 'Q', 'E', 'R', 'T'];

export class Hud {
  private root: HTMLElement;
  private lifeFill!: HTMLElement;
  private esFill!: HTMLElement;
  private manaFill!: HTMLElement;
  private skillSlotsEl!: HTMLElement;
  private flaskSlotsEl!: HTMLElement;
  private xpFill!: HTMLElement;
  private xpLabel!: HTMLElement;
  private topbar!: HTMLElement;
  private toastsEl!: HTMLElement;
  private minimapCanvas!: HTMLCanvasElement;
  private minimapBg: HTMLCanvasElement = document.createElement('canvas');
  private minimapZoneId = '';
  private deathBanner!: HTMLElement;
  private levelupBanner!: HTMLElement;
  private levelupTimer = 0;
  private interactHint!: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.build();
  }

  private build(): void {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <div id="toplbar"></div>
      <div class="orb orb-life"><div class="orb-fill"></div><div class="orb-es-fill"></div><div class="orb-value"></div><div class="orb-label">Life</div></div>
      <div class="orb orb-mana"><div class="orb-fill"></div><div class="orb-value"></div><div class="orb-label">Mana</div></div>
      <div id="actionbar">
        <div id="flaskbar"></div>
        <div id="skillbar"></div>
      </div>
      <div id="xpbar"><div id="xpbar-fill"></div><div id="xpbar-label"></div></div>
      <div id="interact-hint" class="hidden"></div>
      <canvas id="minimap" width="168" height="168"></canvas>
      <div id="toasts"></div>
      <div id="death-banner" class="hidden">YOU HAVE DIED<br/><span style="font-size:14px">Returning to Ashport Landing...</span></div>
      <div id="levelup-banner" class="hidden">LEVEL UP!</div>
    `;
    this.root.appendChild(hud);
    this.lifeFill = hud.querySelector('.orb-life .orb-fill')!;
    this.esFill = hud.querySelector('.orb-life .orb-es-fill')!;
    this.manaFill = hud.querySelector('.orb-mana .orb-fill')!;
    this.skillSlotsEl = hud.querySelector('#skillbar')!;
    this.flaskSlotsEl = hud.querySelector('#flaskbar')!;
    this.xpFill = hud.querySelector('#xpbar-fill')!;
    this.xpLabel = hud.querySelector('#xpbar-label')!;
    this.topbar = hud.querySelector('#toplbar')!;
    this.toastsEl = hud.querySelector('#toasts')!;
    this.minimapCanvas = hud.querySelector('#minimap')!;
    this.deathBanner = hud.querySelector('#death-banner')!;
    this.levelupBanner = hud.querySelector('#levelup-banner')!;
    this.interactHint = hud.querySelector('#interact-hint')!;

    for (let i = 0; i < 2; i++) {
      const slot = document.createElement('div');
      slot.className = 'flask-slot';
      slot.innerHTML = `<span class="key-hint">${i + 1}</span><span class="label"></span><div class="cd-overlay hidden"></div>`;
      this.flaskSlotsEl.appendChild(slot);
    }
    for (let i = 0; i < 7; i++) {
      const slot = document.createElement('div');
      slot.className = 'skill-slot';
      slot.dataset.slot = String(i);
      slot.innerHTML = `<span class="key-hint">${SKILL_KEY_LABELS[i]}</span><span class="label"></span><div class="cd-overlay hidden"></div>`;
      this.skillSlotsEl.appendChild(slot);
    }
  }

  showDeath(): void {
    this.deathBanner.classList.remove('hidden');
    setTimeout(() => this.deathBanner.classList.add('hidden'), 2200);
  }

  showLevelUp(): void {
    this.levelupTimer = 1.8;
  }

  update(sim: Simulation, dt: number): void {
    const p = sim.player;
    const d = p.derived;
    this.lifeFill.style.height = `${Math.max(0, (p.life / d.maxLife) * 100)}%`;
    this.esFill.style.height = d.maxEnergyShield > 0 ? `${Math.max(0, (p.energyShield / d.maxEnergyShield) * 100)}%` : '0%';
    this.manaFill.style.height = `${Math.max(0, (p.mana / d.maxMana) * 100)}%`;
    (this.root.querySelector('.orb-life .orb-value') as HTMLElement).textContent = `${Math.round(p.life)}`;
    (this.root.querySelector('.orb-mana .orb-value') as HTMLElement).textContent = `${Math.round(p.mana)}`;

    const xpBase = xpForLevel(p.level);
    const xpNext = xpForLevel(p.level + 1);
    const pct = p.level >= 100 ? 100 : ((p.xp - xpBase) / Math.max(1, xpNext - xpBase)) * 100;
    this.xpFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    this.xpLabel.textContent = `Level ${p.level}`;

    this.topbar.textContent = `${sim.zone.def.name} · ${p.name}, Level ${p.level} ${p.classDef.name}`;

    const slots = this.skillSlotsEl.children;
    for (let i = 0; i < slots.length; i++) {
      const el = slots[i] as HTMLElement;
      const label = el.querySelector('.label') as HTMLElement;
      const overlay = el.querySelector('.cd-overlay') as HTMLElement;
      const skillId = p.skillSlots[i]?.skillId;
      const skill = skillId ? SKILLS[skillId] : null;
      label.textContent = skill ? shortLabel(skill.name) : '';
      el.title = skill ? skill.name : 'Empty';
      if (skill) {
        const cd = p.cooldowns.get(skill.id) ?? 0;
        if (cd > 0.05) {
          overlay.classList.remove('hidden');
          overlay.textContent = cd.toFixed(1);
        } else {
          overlay.classList.add('hidden');
        }
      } else {
        overlay.classList.add('hidden');
      }
    }

    const flaskEls = this.flaskSlotsEl.children;
    for (let i = 0; i < flaskEls.length; i++) {
      const el = flaskEls[i] as HTMLElement;
      const label = el.querySelector('.label') as HTMLElement;
      const overlay = el.querySelector('.cd-overlay') as HTMLElement;
      const key = (`flask${i + 1}`) as 'flask1' | 'flask2';
      const item = p.equipment[key];
      const base = item ? ITEM_BASES[item.baseId] : null;
      label.textContent = base ? (base.flaskKind === 'life' ? 'Life' : 'Mana') : '';
      el.title = item ? item.name : (key === 'flask1' ? 'Life Flask' : 'Mana Flask');
      const cd = p.flaskCooldowns.get(key) ?? 0;
      if (cd > 0.05) {
        overlay.classList.remove('hidden');
        overlay.textContent = cd.toFixed(1);
      } else {
        overlay.classList.add('hidden');
      }
    }

    this.toastsEl.innerHTML = '';
    for (const t of sim.toasts.slice(-4)) {
      const div = document.createElement('div');
      div.className = 'toast';
      div.style.opacity = String(Math.min(1, t.life));
      div.textContent = t.text;
      this.toastsEl.appendChild(div);
    }

    if (this.levelupTimer > 0) {
      this.levelupTimer -= dt;
      this.levelupBanner.classList.remove('hidden');
      this.levelupBanner.style.opacity = String(Math.min(1, this.levelupTimer));
    } else {
      this.levelupBanner.classList.add('hidden');
    }

    this.updateInteractHint(sim);
    this.updateMinimap(sim);
  }

  private updateInteractHint(sim: Simulation): void {
    const hover = sim.hoverTarget;
    if (!hover) {
      this.interactHint.classList.add('hidden');
      return;
    }
    let text = '';
    if (hover.kind === 'drop') text = `Pick up ${hover.drop.item ? hover.drop.item.name : `${hover.drop.gold} Gold`}`;
    else if (hover.kind === 'exit') text = `Travel to ${hover.exit.label}`;
    else if (hover.kind === 'stash') text = 'Open Stash';
    else if (hover.kind === 'waypoint') text = 'Open Waypoint';
    this.interactHint.textContent = text;
    this.interactHint.classList.remove('hidden');
    this.interactHint.style.left = `${sim.input.mouseX}px`;
    this.interactHint.style.top = `${sim.input.mouseY}px`;
  }

  private updateMinimap(sim: Simulation): void {
    const zone = sim.zone;
    const size = this.minimapCanvas.width;
    if (this.minimapZoneId !== zone.def.id) {
      this.minimapZoneId = zone.def.id;
      this.minimapBg.width = zone.def.width;
      this.minimapBg.height = zone.def.height;
      const bctx = this.minimapBg.getContext('2d')!;
      const img = bctx.createImageData(zone.def.width, zone.def.height);
      for (let y = 0; y < zone.def.height; y++) {
        for (let x = 0; x < zone.def.width; x++) {
          const idx = (y * zone.def.width + x) * 4;
          const walkable = zone.walkable[y * zone.def.width + x] === 1;
          img.data[idx] = walkable ? 120 : 20;
          img.data[idx + 1] = walkable ? 110 : 18;
          img.data[idx + 2] = walkable ? 90 : 16;
          img.data[idx + 3] = 255;
        }
      }
      bctx.putImageData(img, 0, 0);
    }
    const ctx = this.minimapCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.minimapBg, 0, 0, zone.def.width, zone.def.height, 0, 0, size, size);
    const sx = size / zone.def.width;
    const sy = size / zone.def.height;

    ctx.fillStyle = '#5ac0d0';
    for (const exit of zone.exits) {
      ctx.beginPath();
      ctx.arc(exit.pos.x * sx, exit.pos.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#e0463c';
    for (const m of sim.monsters) {
      ctx.beginPath();
      ctx.arc(m.pos.x * sx, m.pos.y * sy, m.def.isBoss ? 3.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4ccc4c';
    ctx.beginPath();
    ctx.arc(sim.player.pos.x * sx, sim.player.pos.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function shortLabel(name: string): string {
  const words = name.split(' ');
  if (words.length === 1) return name.length > 8 ? `${name.slice(0, 7)}…` : name;
  return words.map((w) => w[0]).join('');
}
