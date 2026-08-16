import type { Simulation } from '../state/Simulation.ts';
import { ZONES, ACT_ORDER } from '../data/zones.ts';

export class WaypointPanel {
  private panel: HTMLElement;
  private sim: Simulation | null = null;
  onClose?: () => void;

  constructor(root: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel hidden';
    this.panel.style.width = 'min(520px, 90vw)';
    this.panel.innerHTML = `
      <button class="panel-close">&times;</button>
      <h2>Waypoint</h2>
      <div class="waypoint-list"></div>
    `;
    root.appendChild(this.panel);
    this.panel.querySelector('.panel-close')!.addEventListener('click', () => this.hide());
  }

  show(sim: Simulation): void {
    this.sim = sim;
    this.panel.classList.remove('hidden');
    this.render();
  }

  hide(): void {
    this.panel.classList.add('hidden');
    this.onClose?.();
  }

  isVisible(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  private render(): void {
    const sim = this.sim!;
    const list = this.panel.querySelector('.waypoint-list')!;
    list.innerHTML = '';

    const row = (zoneId: string) => {
      const def = ZONES[zoneId];
      const el = document.createElement('div');
      el.className = 'gem-row';
      const here = zoneId === sim.zone.def.id;
      el.innerHTML = `<span>${def.name}</span><span style="opacity:0.6">${here ? 'You are here' : `Act ${def.act || '—'}`}</span>`;
      if (!here) {
        el.addEventListener('click', () => {
          sim.changeZone(zoneId);
          this.hide();
        });
      } else {
        el.style.opacity = '0.5';
      }
      list.appendChild(el);
    };

    row('hub_town');
    for (const act of ACT_ORDER) {
      for (const zoneId of Object.keys(ZONES)) {
        const def = ZONES[zoneId];
        if (def.act !== act || def.kind === 'boss') continue;
        if (!sim.player.wayointsUnlocked.has(zoneId)) continue;
        row(zoneId);
      }
    }
  }
}
