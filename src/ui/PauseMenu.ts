export class PauseMenu {
  private panel: HTMLElement;
  onResume?: () => void;
  onSaveAndExit?: () => void;

  constructor(root: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel hidden';
    this.panel.style.width = 'min(420px, 90vw)';
    this.panel.style.textAlign = 'center';
    this.panel.innerHTML = `
      <h2 style="text-align:center;border-bottom:none;">PAUSED</h2>
      <div style="display:flex;flex-direction:column;gap:10px;align-items:center;">
        <button class="big-btn" id="pm-resume" style="width:220px;">Resume</button>
        <button class="big-btn" id="pm-exit" style="width:220px;">Save &amp; Exit to Menu</button>
      </div>
      <div class="stat-section-title" style="margin-top:18px;text-align:left;">Controls</div>
      <div style="text-align:left;font-size:12px;line-height:1.8;opacity:0.85;">
        <b>WASD</b> move &middot; <b>Shift</b> sprint &middot; <b>Space</b> dodge roll<br/>
        <b>LMB / MMB / RMB / Q / E / R / T</b> skills &middot; <b>1 / 2</b> life &amp; mana flask<br/>
        <b>Left-click</b> an item, portal, waypoint or the stash to interact<br/>
        <b>I</b> inventory &middot; <b>P</b> passive tree &middot; <b>C</b> character &middot; <b>Esc</b> pause
      </div>
    `;
    root.appendChild(this.panel);
    this.panel.querySelector('#pm-resume')!.addEventListener('click', () => this.onResume?.());
    this.panel.querySelector('#pm-exit')!.addEventListener('click', () => this.onSaveAndExit?.());
  }

  show(): void {
    this.panel.classList.remove('hidden');
  }

  hide(): void {
    this.panel.classList.add('hidden');
  }

  isVisible(): boolean {
    return !this.panel.classList.contains('hidden');
  }
}
