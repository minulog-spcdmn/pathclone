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
  belt: 'Belt', amulet: 'Amulet', ring1: 'Ring', ring2: 'Ring', flask1: 'Flask', flask2: 'Flask', flask3: 'Flask', flask4: 'Flask',
};

const CURRENCY_LABELS: Record<CraftAction, string> = {
  transmutation: 'Orb of Transmutation', augmentation: 'Orb of Augmentation', alteration: 'Orb of Alteration',
  regal: 'Regal Orb', chaos: 'Chaos Orb', alchemy: 'Orb of Alchemy', exalted: 'Exalted Orb',
};

export class InventoryPanel {
  private panel: HTMLElement;
  private tab: Tab = 'inventory';
  private sim: Simulation | null = null;
  private tooltip: HTMLElement;
  private selectedCurrency: CraftAction | null = null;
  private selectedSkillSlot = 0;
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
    const order: EquipmentSlotKey[] = ['weapon', 'offhand', 'helmet', 'body', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2', 'flask1', 'flask2', 'flask3', 'flask4'];
    for (const key of order) {
      const slot = document.createElement('div');
      slot.className = 'equip-slot';
      const item = player.equipment[key];
      if (item) {
        const chip = document.createElement('div');
        chip.className = 'equip-item';
        chip.style.background = RARITY_COLOR[item.rarity];
        chip.textContent = shortName(item.name);
        chip.addEventListener('click', () => this.unequip(key));
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
    hint.textContent = 'Click an item to equip it. Click an equipped item to unequip. Right-click to sell.';
    body.appendChild(hint);
    body.appendChild(this.buildGrid(player.inventory, (item) => this.tryEquip(item), (item) => this.sellItem(item)));
  }

  private renderStashTab(body: HTMLElement): void {
    const player = this.sim!.player;
    if (this.sim!.zone.def.kind !== 'town') {
      const msg = document.createElement('div');
      msg.textContent = 'The stash can only be accessed in Ashport Landing.';
      body.appendChild(msg);
      return;
    }
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '20px';
    wrap.style.flexWrap = 'wrap';

    const invCol = document.createElement('div');
    invCol.innerHTML = '<div class="stat-section-title">Inventory (click to move to stash)</div>';
    invCol.appendChild(this.buildGrid(player.inventory, (item) => {
      const removed = player.inventory.removeItem(item.instanceId);
      if (removed) {
        if (!player.stash.addItem(removed)) player.inventory.addItem(removed);
        this.markDirty();
      }
    }));

    const stashCol = document.createElement('div');
    stashCol.innerHTML = '<div class="stat-section-title">Stash (click to move to inventory)</div>';
    stashCol.appendChild(this.buildGrid(player.stash, (item) => {
      const removed = player.stash.removeItem(item.instanceId);
      if (removed) {
        if (!player.inventory.addItem(removed)) player.stash.addItem(removed);
        this.markDirty();
      }
    }));

    wrap.appendChild(invCol);
    wrap.appendChild(stashCol);
    body.appendChild(wrap);
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

    body.appendChild(this.buildGrid(player.inventory, (item) => {
      if (!this.selectedCurrency) return;
      if (!canApplyCraft(item, this.selectedCurrency)) {
        this.sim!.toasts.push({ text: 'That currency cannot be used on this item.', life: 1.6 });
        return;
      }
      player.currencies[this.selectedCurrency] -= 1;
      applyCraft(item, this.selectedCurrency, this.sim!.rng);
      this.markDirty();
    }, undefined, (item) => this.selectedCurrency ? canApplyCraft(item, this.selectedCurrency) : true));
  }

  private renderGemsTab(body: HTMLElement): void {
    const player = this.sim!.player;
    const slotRow = document.createElement('div');
    slotRow.style.display = 'flex';
    slotRow.style.gap = '8px';
    slotRow.style.marginBottom = '12px';
    for (let i = 0; i < 4; i++) {
      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (this.selectedSkillSlot === i ? ' active' : '');
      const skill = player.skillSlots[i].skillId ? SKILLS[player.skillSlots[i].skillId!] : null;
      btn.textContent = `${i + 1}: ${skill ? skill.name : 'Empty'}`;
      btn.addEventListener('click', () => {
        this.selectedSkillSlot = i;
        this.render();
      });
      slotRow.appendChild(btn);
    }
    body.appendChild(slotRow);

    const title = document.createElement('div');
    title.className = 'stat-section-title';
    title.textContent = `Active Skills — assign to slot ${this.selectedSkillSlot + 1}`;
    body.appendChild(title);

    const list = document.createElement('div');
    list.className = 'gem-list';
    for (const skill of Object.values(SKILLS)) {
      const qualifies = this.qualifiesForSkill(player, skill);
      const row = document.createElement('div');
      row.className = 'gem-row' + (qualifies ? '' : ' locked');
      row.innerHTML = `<span>${skill.name} <span style="opacity:0.6">(lvl ${skill.levelReq})</span></span><span style="opacity:0.7">${skill.tags.join(', ')}</span>`;
      if (qualifies) {
        row.addEventListener('click', () => {
          player.skillSlots[this.selectedSkillSlot].skillId = skill.id;
          this.markDirty();
        });
      }
      list.appendChild(row);
    }
    body.appendChild(list);

    const supportTitle = document.createElement('div');
    supportTitle.className = 'stat-section-title';
    supportTitle.textContent = 'Support Gems (2 slots per skill)';
    body.appendChild(supportTitle);

    const slot = player.skillSlots[this.selectedSkillSlot];
    const supportRow = document.createElement('div');
    supportRow.style.display = 'flex';
    supportRow.style.gap = '8px';
    supportRow.style.marginBottom = '8px';
    for (let i = 0; i < slot.supportIds.length; i++) {
      const chip = document.createElement('div');
      chip.className = 'currency-chip';
      const supportId = slot.supportIds[i];
      chip.textContent = supportId ? SUPPORTS[supportId].name : 'Empty';
      chip.addEventListener('click', () => {
        slot.supportIds[i] = null;
        this.markDirty();
      });
      supportRow.appendChild(chip);
    }
    body.appendChild(supportRow);

    const supportList = document.createElement('div');
    supportList.className = 'gem-list';
    for (const support of Object.values(SUPPORTS)) {
      const qualifies = player.level >= support.levelReq;
      const row = document.createElement('div');
      row.className = 'gem-row' + (qualifies ? '' : ' locked');
      row.innerHTML = `<span>${support.name}</span><span style="opacity:0.7">${support.desc}</span>`;
      if (qualifies) {
        row.addEventListener('click', () => {
          const emptyIdx = slot.supportIds.findIndex((s) => s === null);
          slot.supportIds[emptyIdx >= 0 ? emptyIdx : 0] = support.id;
          this.markDirty();
        });
      }
      supportList.appendChild(row);
    }
    body.appendChild(supportList);
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

  // ---------------------------------------------------------------- grid rendering
  private buildGrid(
    inv: Inventory,
    onClick: (item: ItemInstance) => void,
    onRightClick?: (item: ItemInstance) => void,
    isEligible?: (item: ItemInstance) => boolean,
  ): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'inv-grid';
    grid.style.gridTemplateColumns = `repeat(${inv.width}, 46px)`;
    grid.style.gridTemplateRows = `repeat(${inv.height}, 46px)`;
    grid.style.position = 'relative';
    grid.style.width = `${inv.width * 46}px`;
    grid.style.height = `${inv.height * 46}px`;

    for (let y = 0; y < inv.height; y++) {
      for (let x = 0; x < inv.width; x++) {
        const cell = document.createElement('div');
        cell.className = 'inv-cell';
        cell.style.position = 'absolute';
        cell.style.left = `${x * 46}px`;
        cell.style.top = `${y * 46}px`;
        grid.appendChild(cell);
      }
    }

    const seen = new Set<string>();
    for (const [instanceId, item] of inv.items) {
      if (seen.has(instanceId)) continue;
      seen.add(instanceId);
      const placement = inv.placements.get(instanceId);
      if (!placement) continue;
      const base = ITEM_BASES[item.baseId];
      const chip = document.createElement('div');
      chip.className = 'inv-item';
      chip.style.left = `${placement.x * 46 + 1}px`;
      chip.style.top = `${placement.y * 46 + 1}px`;
      chip.style.width = `${base.gridW * 46 - 2}px`;
      chip.style.height = `${base.gridH * 46 - 2}px`;
      chip.style.background = RARITY_COLOR[item.rarity];
      chip.textContent = shortName(item.name);
      if (isEligible && !isEligible(item)) {
        chip.style.opacity = '0.35';
      }
      chip.addEventListener('click', () => onClick(item));
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
    for (const a of item.affixes) lines.push(a.text);
    lines.push(`<span style="opacity:0.5">Sell value: ${itemVendorValue(item)}g</span>`);
    return lines.join('<br/>');
  }

  // ---------------------------------------------------------------- interactions
  private tryEquip(item: ItemInstance): void {
    const player = this.sim!.player;
    const base = ITEM_BASES[item.baseId];
    let targetKey: EquipmentSlotKey | null = null;
    if (base.slot === 'ring') targetKey = player.equipment.ring1 ? (player.equipment.ring2 ? 'ring1' : 'ring2') : 'ring1';
    else if (base.slot === 'flask') {
      const flaskKeys: EquipmentSlotKey[] = ['flask1', 'flask2', 'flask3', 'flask4'];
      targetKey = flaskKeys.find((k) => !player.equipment[k]) ?? 'flask1';
    } else if (base.slot === 'weapon') targetKey = 'weapon';
    else if (base.slot === 'offhand') targetKey = 'offhand';
    else targetKey = base.slot as EquipmentSlotKey;

    if (!targetKey) return;
    const removedFromInv = player.inventory.removeItem(item.instanceId);
    if (!removedFromInv) return;
    const current = player.equipment[targetKey];
    player.equipment[targetKey] = removedFromInv;
    if (current) {
      if (!player.inventory.addItem(current)) {
        // revert: no space to hold the swapped-out item
        player.equipment[targetKey] = current;
        player.inventory.addItem(removedFromInv);
        this.sim!.toasts.push({ text: 'Not enough inventory space to swap.', life: 1.6 });
      }
    }
    this.markDirty();
  }

  private unequip(key: EquipmentSlotKey): void {
    const player = this.sim!.player;
    const item = player.equipment[key];
    if (!item) return;
    if (!player.inventory.hasSpaceFor(item)) {
      this.sim!.toasts.push({ text: 'Inventory is full.', life: 1.6 });
      return;
    }
    player.equipment[key] = null;
    player.inventory.addItem(item);
    this.markDirty();
  }

  private sellItem(item: ItemInstance): void {
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
