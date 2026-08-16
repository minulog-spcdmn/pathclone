import type { Simulation } from '../state/Simulation.ts';
import type { Player } from '../entities/Player.ts';
import type { EquipmentSlotKey } from '../systems/Inventory.ts';
import { Inventory } from '../systems/Inventory.ts';
import { ITEM_BASES } from '../data/items.ts';
import type { ItemInstance } from '../core/item.ts';
import { RARITY_COLOR } from '../core/item.ts';
import { applyCraft, canApplyCraft, itemVendorValue } from '../systems/ItemGen.ts';
import type { CraftAction } from '../systems/ItemGen.ts';
import { SKILLS, SUPPORTS } from '../data/skills.ts';
import type { SkillDef } from '../data/skills.ts';

type Tab = 'inventory' | 'stash' | 'craft' | 'gems' | 'character';

const EQUIP_SLOT_LABELS: Record<EquipmentSlotKey, string> = {
  weapon: 'Weapon', offhand: 'Offhand', helmet: 'Helmet', body: 'Body', gloves: 'Gloves', boots: 'Boots',
  belt: 'Belt', amulet: 'Amulet', ring1: 'Ring', ring2: 'Ring', flask1: 'Life Flask', flask2: 'Mana Flask',
};

const CURRENCY_LABELS: Record<CraftAction, string> = {
  transmutation: 'Orb of Transmutation', augmentation: 'Orb of Augmentation', alteration: 'Orb of Alteration',
  regal: 'Regal Orb', chaos: 'Chaos Orb', alchemy: 'Orb of Alchemy', exalted: 'Exalted Orb',
};

interface DragSource {
  instanceId: string;
  kind: 'inventory' | 'stash' | 'equipment';
  slot?: EquipmentSlotKey;
}

const STASH_RANGE = 2.2;

export class InventoryPanel {
  private panel: HTMLElement;
  private tab: Tab = 'inventory';
  private sim: Simulation | null = null;
  private tooltip: HTMLElement;
  private selectedCurrency: CraftAction | null = null;
  private selectedSkillSlot = 0;
  private selectedGemInstanceId: string | null = null;
  private dragSource: DragSource | null = null;
  onClose?: () => void;
  onDirty?: () => void;

  constructor(root: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel hidden';
    this.panel.innerHTML = `
      <button class="panel-close">&times;</button>
      <h2>Inventory</h2>
      <div class="tabs"></div>
      <div class="panel-body"></div>
    `;
    root.appendChild(this.panel);
    this.panel.querySelector('.panel-close')!.addEventListener('click', () => this.hide());
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip hidden';
    root.appendChild(this.tooltip);

    const tabs: [Tab, string][] = [
      ['inventory', 'Inventory'], ['stash', 'Stash'], ['craft', 'Craft'], ['gems', 'Gems'], ['character', 'Character'],
    ];
    const tabsEl = this.panel.querySelector('.tabs')!;
    for (const [id, label] of tabs) {
      const btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      tabsEl.appendChild(btn);
    }
  }

  show(sim: Simulation, tab?: Tab): void {
    this.sim = sim;
    if (tab) this.tab = tab;
    this.panel.classList.remove('hidden');
    this.render();
  }

  hide(): void {
    this.panel.classList.add('hidden');
    this.tooltip.classList.add('hidden');
    this.onClose?.();
  }

  isVisible(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  private markDirty(): void {
    this.onDirty?.();
    this.render();
  }

  private render(): void {
    if (!this.sim) return;
    const tabsEl = this.panel.querySelectorAll('.tab-btn');
    const order: Tab[] = ['inventory', 'stash', 'craft', 'gems', 'character'];
    tabsEl.forEach((el, i) => el.classList.toggle('active', order[i] === this.tab));

    const body = this.panel.querySelector('.panel-body')! as HTMLElement;
    body.innerHTML = '';
    if (this.tab === 'inventory') this.renderInventoryTab(body);
    else if (this.tab === 'stash') this.renderStashTab(body);
    else if (this.tab === 'craft') this.renderCraftTab(body);
    else if (this.tab === 'gems') this.renderGemsTab(body);
    else if (this.tab === 'character') this.renderCharacterTab(body);
  }

  // ---------------------------------------------------------------- equipment
  private renderEquipRow(container: HTMLElement, player: Player): void {
    const row = document.createElement('div');
    row.className = 'equip-row';
    const order: EquipmentSlotKey[] = ['weapon', 'offhand', 'helmet', 'body', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'flask1', 'flask2'];
    for (const key of order) {
      const slot = document.createElement('div');
      slot.className = 'equip-slot';
      const item = player.equipment[key];
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        slot.classList.add('drag-over');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        this.handleEquipDrop(key);
      });
      if (item) {
        const chip = document.createElement('div');
        chip.className = 'equip-item';
        chip.style.background = RARITY_COLOR[item.rarity];
        chip.textContent = shortName(item.name);
        chip.draggable = true;
        chip.addEventListener('dragstart', () => { this.dragSource = { instanceId: item.instanceId, kind: 'equipment', slot: key }; });
        this.attachTooltip(chip, item);
        slot.appendChild(chip);
      } else {
        slot.textContent = EQUIP_SLOT_LABELS[key];
      }
      row.appendChild(slot);
    }
    container.appendChild(row);
  }

  private renderInventoryTab(body: HTMLElement): void {
    const player = this.sim!.player;
    this.renderEquipRow(body, player);
    const goldLine = document.createElement('div');
    goldLine.style.marginBottom = '10px';
    goldLine.style.fontSize = '13px';
    goldLine.textContent = `Gold: ${player.gold}`;
    body.appendChild(goldLine);
    const hint = document.createElement('div');
    hint.style.fontSize = '11px';
    hint.style.opacity = '0.7';
    hint.style.marginBottom = '8px';
    hint.textContent = 'Drag items to equip, move them, or send them to the stash. Right-click to sell.';
    body.appendChild(hint);
    body.appendChild(this.buildGrid(player.inventory, 'inventory', (item) => this.sellItem(item)));
  }

  private renderStashTab(body: HTMLElement): void {
    const player = this.sim!.player;
    const nearStash = this.isNearStash();
    if (!nearStash) {
      const msg = document.createElement('div');
      msg.textContent = 'You need to be at the stash crate in Ashport Landing to use it.';
      body.appendChild(msg);
      return;
    }
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '20px';
    wrap.style.flexWrap = 'wrap';

    const invCol = document.createElement('div');
    invCol.innerHTML = '<div class="stat-section-title">Inventory</div>';
    invCol.appendChild(this.buildGrid(player.inventory, 'inventory'));

    const stashCol = document.createElement('div');
    stashCol.innerHTML = '<div class="stat-section-title">Stash</div>';
    stashCol.appendChild(this.buildGrid(player.stash, 'stash'));

    wrap.appendChild(invCol);
    wrap.appendChild(stashCol);
    body.appendChild(wrap);
  }

  private isNearStash(): boolean {
    const sim = this.sim!;
    if (sim.zone.def.kind !== 'town') return false;
    const stash = sim.zone.decorations.find((d) => d.kind === 'stash');
    if (!stash) return false;
    const d = Math.hypot(sim.player.pos.x - stash.pos.x, sim.player.pos.y - stash.pos.y);
    return d <= STASH_RANGE;
  }

  private renderCraftTab(body: HTMLElement): void {
    const player = this.sim!.player;
    const row = document.createElement('div');
    row.className = 'currency-row';
    const actions: CraftAction[] = ['transmutation', 'augmentation', 'alteration', 'regal', 'chaos', 'alchemy', 'exalted'];
    for (const action of actions) {
      const count = player.currencies[action] ?? 0;
      const chip = document.createElement('div');
      chip.className = 'currency-chip' + (this.selectedCurrency === action ? ' selected' : '');
      chip.textContent = `${CURRENCY_LABELS[action]} (${count})`;
      if (count > 0) {
        chip.addEventListener('click', () => {
          this.selectedCurrency = this.selectedCurrency === action ? null : action;
          this.render();
        });
      } else {
        chip.style.opacity = '0.4';
      }
      row.appendChild(chip);
    }
    body.appendChild(row);

    const hint = document.createElement('div');
    hint.style.fontSize = '11px';
    hint.style.opacity = '0.75';
    hint.style.marginBottom = '10px';
    hint.textContent = this.selectedCurrency
      ? `Select an eligible item below to apply ${CURRENCY_LABELS[this.selectedCurrency]}.`
      : 'Select a currency above, then click an item to apply it.';
    body.appendChild(hint);

    body.appendChild(this.buildGrid(
      player.inventory,
      'inventory',
      undefined,
      (item) => (this.selectedCurrency ? canApplyCraft(item, this.selectedCurrency) : true),
      (item) => {
        if (!this.selectedCurrency) return;
        if (!canApplyCraft(item, this.selectedCurrency)) {
          this.sim!.toasts.push({ text: 'That currency cannot be used on this item.', life: 1.6 });
          return;
        }
        player.currencies[this.selectedCurrency] -= 1;
        applyCraft(item, this.selectedCurrency, this.sim!.rng);
        this.markDirty();
      },
    ));
  }

  private renderGemsTab(body: HTMLElement): void {
    const player = this.sim!.player;
    const slotRow = document.createElement('div');
    slotRow.style.display = 'flex';
    slotRow.style.flexWrap = 'wrap';
    slotRow.style.gap = '8px';
    slotRow.style.marginBottom = '12px';
    const keyLabels = ['LMB', 'MMB', 'RMB', 'Q', 'E', 'R', 'T'];
    for (let i = 0; i < player.skillSlots.length; i++) {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (this.selectedSkillSlot === i ? ' active' : '');
      const skill = player.skillSlots[i].skillId ? SKILLS[player.skillSlots[i].skillId!] : null;
      btn.textContent = `${keyLabels[i]}: ${skill ? skill.name : 'Empty'}`;
      btn.addEventListener('click', () => {
        this.selectedSkillSlot = i;
        this.selectedGemInstanceId = null;
        this.render();
      });
      slotRow.appendChild(btn);
    }
    body.appendChild(slotRow);

    const slot = player.skillSlots[this.selectedSkillSlot];
    const skill = slot.skillId ? SKILLS[slot.skillId] : null;

    if (skill) {
      const current = document.createElement('div');
      current.className = 'gem-row';
      current.style.marginBottom = '10px';
      current.innerHTML = `<span><b>${skill.name}</b> socketed</span><span style="opacity:0.7">click to unsocket</span>`;
      current.addEventListener('click', () => {
        slot.skillId = null;
        slot.supportIds = [null, null];
        this.markDirty();
      });
      body.appendChild(current);

      const supportTitle = document.createElement('div');
      supportTitle.className = 'stat-section-title';
      supportTitle.textContent = 'Support Gem Sockets';
      body.appendChild(supportTitle);

      const supportRow = document.createElement('div');
      supportRow.style.display = 'flex';
      supportRow.style.gap = '8px';
      supportRow.style.marginBottom = '10px';
      for (let i = 0; i < slot.supportIds.length; i++) {
        const chip = document.createElement('div');
        chip.className = 'currency-chip';
        const supportId = slot.supportIds[i];
        chip.textContent = supportId ? SUPPORTS[supportId].name : 'Empty Socket';
        chip.addEventListener('click', () => {
          if (supportId) {
            slot.supportIds[i] = null;
            this.markDirty();
          }
        });
        supportRow.appendChild(chip);
      }
      body.appendChild(supportRow);

      this.renderGemPicker(body, 'support', (chosenId) => {
        const emptyIdx = slot.supportIds.findIndex((s) => s === null);
        if (emptyIdx < 0) {
          this.sim!.toasts.push({ text: 'Both support sockets are full.', life: 1.6 });
          return;
        }
        slot.supportIds[emptyIdx] = chosenId;
      });
    } else {
      const hint = document.createElement('div');
      hint.style.fontSize = '12px';
      hint.style.opacity = '0.75';
      hint.style.marginBottom = '10px';
      hint.textContent = `Socket ${keyLabels[this.selectedSkillSlot]} with an Uncut Skill Gem to choose an active skill.`;
      body.appendChild(hint);

      this.renderGemPicker(body, 'skill', (chosenId) => {
        slot.skillId = chosenId;
      });
    }
  }

  /** Shared two-step picker: pick an uncut gem from inventory, then pick what to cut it into. */
  private renderGemPicker(body: HTMLElement, kind: 'skill' | 'support', onChosen: (id: string) => void): void {
    const player = this.sim!.player;
    const gemBaseId = kind === 'skill' ? 'uncut_skill_gem' : 'uncut_support_gem';
    const uncutGems = Array.from(player.inventory.items.values()).filter((it) => it.baseId === gemBaseId);

    const gemTitle = document.createElement('div');
    gemTitle.className = 'stat-section-title';
    gemTitle.textContent = kind === 'skill' ? 'Uncut Skill Gems' : 'Uncut Support Gems';
    body.appendChild(gemTitle);

    if (uncutGems.length === 0) {
      const none = document.createElement('div');
      none.style.fontSize = '12px';
      none.style.opacity = '0.6';
      none.textContent = `No uncut ${kind} gems — find them as loot.`;
      body.appendChild(none);
      return;
    }

    const gemList = document.createElement('div');
    gemList.className = 'gem-list';
    gemList.style.marginBottom = '10px';
    for (const gem of uncutGems) {
      const row = document.createElement('div');
      const selected = this.selectedGemInstanceId === gem.instanceId;
      row.className = 'gem-row' + (selected ? ' active' : '');
      row.innerHTML = `<span>${gem.name}</span><span style="opacity:0.6">${selected ? 'selected' : 'click to select'}</span>`;
      row.addEventListener('click', () => {
        this.selectedGemInstanceId = selected ? null : gem.instanceId;
        this.render();
      });
      gemList.appendChild(row);
    }
    body.appendChild(gemList);

    const listTitle = document.createElement('div');
    listTitle.className = 'stat-section-title';
    listTitle.textContent = kind === 'skill' ? `Cut into...` : 'Cut into...';
    body.appendChild(listTitle);

    const list = document.createElement('div');
    list.className = 'gem-list';
    const entries: [string, string, boolean][] = kind === 'skill'
      ? Object.values(SKILLS).map((s) => [s.id, `${s.name} (lvl ${s.levelReq})`, this.qualifiesForSkill(player, s)])
      : Object.values(SUPPORTS).map((s) => [s.id, s.name, player.level >= s.levelReq]);

    for (const [id, label, qualifies] of entries) {
      const row = document.createElement('div');
      const canPick = qualifies && this.selectedGemInstanceId;
      row.className = 'gem-row' + (canPick ? '' : ' locked');
      row.innerHTML = `<span>${label}</span>`;
      if (canPick) {
        row.addEventListener('click', () => {
          const removed = player.inventory.removeItem(this.selectedGemInstanceId!);
          if (!removed) return;
          onChosen(id);
          this.selectedGemInstanceId = null;
          this.markDirty();
        });
      }
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  private qualifiesForSkill(player: Player, skill: SkillDef): boolean {
    if (player.level < skill.levelReq) return false;
    const d = player.derived;
    const req = skill.requiredAttr;
    if (req.strength && d.strength < req.strength) return false;
    if (req.dexterity && d.dexterity < req.dexterity) return false;
    if (req.intelligence && d.intelligence < req.intelligence) return false;
    return true;
  }

  private renderCharacterTab(body: HTMLElement): void {
    const p = this.sim!.player;
    const d = p.derived;
    const rows: [string, string][] = [
      ['Name', p.name],
      ['Level', `${p.level}`],
      ['Class', p.classDef.name],
      ['Experience', `${p.xp}`],
      ['Passive Points', `${p.passivePoints}`],
      ['Kills', `${p.killCount}`],
      ['Deaths', `${p.deaths}`],
    ];
    body.appendChild(this.statBlock('Overview', rows));

    body.appendChild(this.statBlock('Attributes', [
      ['Strength', `${Math.round(d.strength)}`],
      ['Dexterity', `${Math.round(d.dexterity)}`],
      ['Intelligence', `${Math.round(d.intelligence)}`],
    ]));

    body.appendChild(this.statBlock('Life & Resources', [
      ['Life', `${Math.round(p.life)} / ${d.maxLife}`],
      ['Mana', `${Math.round(p.mana)} / ${d.maxMana}`],
      ['Energy Shield', `${Math.round(p.energyShield)} / ${d.maxEnergyShield}`],
      ['Life Regen', `${d.lifeRegen.toFixed(1)}/s`],
      ['Mana Regen', `${d.manaRegen.toFixed(1)}/s`],
    ]));

    body.appendChild(this.statBlock('Defenses', [
      ['Armour', `${Math.round(d.armor)}`],
      ['Evasion Rating', `${Math.round(d.evasion)}`],
      ['Fire Resistance', `${Math.round(d.fireRes)}%`],
      ['Cold Resistance', `${Math.round(d.coldRes)}%`],
      ['Lightning Resistance', `${Math.round(d.lightningRes)}%`],
      ['Chaos Resistance', `${Math.round(d.chaosRes)}%`],
      ['Block Chance', `${Math.round(d.blockChance * 100)}%`],
    ]));

    body.appendChild(this.statBlock('Offense', [
      ['Accuracy Rating', `${Math.round(d.accuracy)}`],
      ['Critical Strike Chance', `${(d.critChance * 100).toFixed(1)}%`],
      ['Critical Strike Multiplier', `${Math.round(d.critMultiplier * 100)}%`],
      ['Attack Speed', `${d.attackSpeed.toFixed(2)}x`],
      ['Cast Speed', `${d.castSpeed.toFixed(2)}x`],
      ['Movement Speed', `${d.movementSpeed.toFixed(2)}x`],
    ]));
  }

  private statBlock(title: string, rows: [string, string][]): HTMLElement {
    const wrap = document.createElement('div');
    const t = document.createElement('div');
    t.className = 'stat-section-title';
    t.textContent = title;
    wrap.appendChild(t);
    for (const [label, value] of rows) {
      const r = document.createElement('div');
      r.className = 'stat-row';
      r.innerHTML = `<span>${label}</span><span>${value}</span>`;
      wrap.appendChild(r);
    }
    return wrap;
  }

  // ---------------------------------------------------------------- grid rendering + drag/drop
  private buildGrid(
    inv: Inventory,
    kind: 'inventory' | 'stash',
    onRightClick?: (item: ItemInstance) => void,
    isEligible?: (item: ItemInstance) => boolean,
    onClickOverride?: (item: ItemInstance) => void,
  ): HTMLElement {
    const CELL = 46;
    const grid = document.createElement('div');
    grid.className = 'inv-grid';
    grid.style.position = 'relative';
    grid.style.width = `${inv.width * CELL}px`;
    grid.style.height = `${inv.height * CELL}px`;

    for (let y = 0; y < inv.height; y++) {
      for (let x = 0; x < inv.width; x++) {
        const cell = document.createElement('div');
        cell.className = 'inv-cell';
        cell.style.position = 'absolute';
        cell.style.left = `${x * CELL}px`;
        cell.style.top = `${y * CELL}px`;
        grid.appendChild(cell);
      }
    }

    grid.addEventListener('dragover', (e) => e.preventDefault());
    grid.addEventListener('drop', (e) => {
      e.preventDefault();
      const rect = grid.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / CELL);
      const y = Math.floor((e.clientY - rect.top) / CELL);
      this.handleGridDrop(inv, kind, x, y);
    });

    for (const [instanceId, item] of inv.items) {
      const placement = inv.placements.get(instanceId);
      if (!placement) continue;
      const base = ITEM_BASES[item.baseId];
      const chip = document.createElement('div');
      chip.className = 'inv-item';
      chip.style.left = `${placement.x * CELL + 1}px`;
      chip.style.top = `${placement.y * CELL + 1}px`;
      chip.style.width = `${base.gridW * CELL - 2}px`;
      chip.style.height = `${base.gridH * CELL - 2}px`;
      chip.style.background = RARITY_COLOR[item.rarity];
      chip.textContent = shortName(item.name);
      chip.draggable = true;
      chip.addEventListener('dragstart', () => { this.dragSource = { instanceId, kind }; });
      if (isEligible && !isEligible(item)) {
        chip.style.opacity = '0.35';
      }
      chip.addEventListener('click', () => onClickOverride?.(item));
      if (onRightClick) {
        chip.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          onRightClick(item);
        });
      }
      this.attachTooltip(chip, item);
      grid.appendChild(chip);
    }
    return grid;
  }

  private handleGridDrop(targetInv: Inventory, targetKind: 'inventory' | 'stash', x: number, y: number): void {
    const src = this.dragSource;
    this.dragSource = null;
    if (!src) return;
    const item = this.getItemFromSource(src);
    if (!item) return;

    if (src.kind === targetKind) {
      targetInv.moveItem(item.instanceId, x, y);
      this.markDirty();
      return;
    }

    const removed = this.removeFromSource(src);
    if (!removed) return;
    if (!targetInv.place(removed, x, y) && !targetInv.addItem(removed)) {
      this.revertToSource(src, removed);
      this.sim!.toasts.push({ text: 'Not enough space.', life: 1.6 });
    }
    this.markDirty();
  }

  private handleEquipDrop(targetKey: EquipmentSlotKey): void {
    const src = this.dragSource;
    this.dragSource = null;
    if (!src) return;
    const item = this.getItemFromSource(src);
    if (!item) return;
    if (!this.isValidForSlot(item, targetKey)) {
      this.sim!.toasts.push({ text: 'That item cannot go there.', life: 1.4 });
      return;
    }
    const player = this.sim!.player;
    const removed = this.removeFromSource(src);
    if (!removed) return;
    const current = player.equipment[targetKey];
    player.equipment[targetKey] = removed;

    if (current) {
      if (src.kind === 'equipment' && src.slot) {
        player.equipment[src.slot] = current;
      } else {
        const primary = src.kind === 'stash' ? player.stash : player.inventory;
        const secondary = primary === player.inventory ? player.stash : player.inventory;
        if (!primary.addItem(current) && !secondary.addItem(current)) {
          player.equipment[targetKey] = current;
          this.revertToSource(src, removed);
          this.sim!.toasts.push({ text: 'Not enough space to swap.', life: 1.6 });
        }
      }
    }
    this.markDirty();
  }

  private isValidForSlot(item: ItemInstance, key: EquipmentSlotKey): boolean {
    const base = ITEM_BASES[item.baseId];
    switch (key) {
      case 'weapon': return base.slot === 'weapon';
      case 'offhand': return base.slot === 'offhand';
      case 'helmet': return base.slot === 'helmet';
      case 'body': return base.slot === 'body';
      case 'gloves': return base.slot === 'gloves';
      case 'boots': return base.slot === 'boots';
      case 'belt': return base.slot === 'belt';
      case 'amulet': return base.slot === 'amulet';
      case 'ring1':
      case 'ring2':
        return base.slot === 'ring';
      case 'flask1':
        return base.slot === 'flask' && base.flaskKind === 'life';
      case 'flask2':
        return base.slot === 'flask' && base.flaskKind === 'mana';
    }
  }

  private getItemFromSource(src: DragSource): ItemInstance | null {
    const player = this.sim!.player;
    if (src.kind === 'inventory') return player.inventory.items.get(src.instanceId) ?? null;
    if (src.kind === 'stash') return player.stash.items.get(src.instanceId) ?? null;
    if (src.kind === 'equipment' && src.slot) return player.equipment[src.slot];
    return null;
  }

  private removeFromSource(src: DragSource): ItemInstance | null {
    const player = this.sim!.player;
    if (src.kind === 'inventory') return player.inventory.removeItem(src.instanceId);
    if (src.kind === 'stash') return player.stash.removeItem(src.instanceId);
    if (src.kind === 'equipment' && src.slot) {
      const item = player.equipment[src.slot];
      player.equipment[src.slot] = null;
      return item;
    }
    return null;
  }

  private revertToSource(src: DragSource, item: ItemInstance): void {
    const player = this.sim!.player;
    if (src.kind === 'inventory') player.inventory.addItem(item);
    else if (src.kind === 'stash') player.stash.addItem(item);
    else if (src.kind === 'equipment' && src.slot) player.equipment[src.slot] = item;
  }

  private attachTooltip(el: HTMLElement, item: ItemInstance): void {
    el.addEventListener('mousemove', (e) => {
      this.tooltip.classList.remove('hidden');
      this.tooltip.style.left = `${e.clientX + 16}px`;
      this.tooltip.style.top = `${e.clientY + 16}px`;
      this.tooltip.innerHTML = this.tooltipHtml(item);
    });
    el.addEventListener('mouseleave', () => this.tooltip.classList.add('hidden'));
  }

  private tooltipHtml(item: ItemInstance): string {
    const base = ITEM_BASES[item.baseId];
    const lines: string[] = [];
    lines.push(`<b style="color:${RARITY_COLOR[item.rarity]}">${item.name}</b>`);
    lines.push(`<span style="opacity:0.6">${base.name} · ilvl ${item.itemLevel}</span>`);
    if (item.flavorText) lines.push(`<i style="opacity:0.7">${item.flavorText}</i>`);
    if (base.damageMin !== undefined) lines.push(`Damage: ${base.damageMin}-${base.damageMax} (${base.attackTime}s)`);
    if (base.armorBase) lines.push(`Armour: ${base.armorBase}`);
    if (base.evasionBase) lines.push(`Evasion: ${base.evasionBase}`);
    if (base.esBase) lines.push(`Energy Shield: ${base.esBase}`);
    if (base.flaskKind === 'life') lines.push(`Recovers ${base.flaskLife} Life over ${base.flaskDuration}s`);
    if (base.flaskKind === 'mana') lines.push(`Recovers ${base.flaskMana} Mana over ${base.flaskDuration}s`);
    for (const a of item.affixes) lines.push(a.text);
    if (base.slot !== 'gem') lines.push(`<span style="opacity:0.5">Sell value: ${itemVendorValue(item)}g</span>`);
    return lines.join('<br/>');
  }

  private sellItem(item: ItemInstance): void {
    const base = ITEM_BASES[item.baseId];
    if (base.slot === 'gem') {
      this.sim!.toasts.push({ text: 'Gems cannot be sold.', life: 1.6 });
      return;
    }
    const player = this.sim!.player;
    const value = itemVendorValue(item);
    player.inventory.removeItem(item.instanceId);
    player.gold += value;
    this.sim!.toasts.push({ text: `Sold ${item.name} for ${value}g`, life: 1.6 });
    this.markDirty();
  }
}

function shortName(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}
