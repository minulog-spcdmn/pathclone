import type { Simulation } from '../state/Simulation.ts';
import type { TreeNode } from '../data/passiveTree.ts';
import { ASCENDANCY_NODES } from '../data/ascendancyTree.ts';
import { CLASSES } from '../data/classes.ts';

const NODE_COLOR: Record<TreeNode['kind'], string> = {
  start: '#e0c878',
  keystone: '#d9822b',
  notable: '#8fd0e0',
  small: '#7a7060',
};

export class PassiveTreeUI {
  private wrap: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tooltip: HTMLElement;
  private sim: Simulation | null = null;
  private camX = 0;
  private camY = 0;
  private zoom = 0.85;
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private camStart = { x: 0, y: 0 };
  private dragMoved = false;
  private hovered: TreeNode | null = null;
  private mouseScreen = { x: 0, y: 0 };
  onClose?: () => void;
  onDirty?: () => void;

  constructor(root: HTMLElement) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'panel hidden';
    this.wrap.style.width = '96vw';
    this.wrap.style.height = '90vh';
    this.wrap.style.maxHeight = '90vh';
    this.wrap.style.padding = '0';
    this.wrap.style.overflow = 'hidden';
    this.wrap.innerHTML = `
      <button class="panel-close" style="z-index:2">&times;</button>
      <div id="tree-points" style="position:absolute;top:14px;left:20px;z-index:2;font-size:15px;color:#e0c878;"></div>
      <div id="tree-ascendancy" style="position:absolute;top:14px;left:220px;z-index:2;max-width:320px;font-size:12px;"></div>
      <canvas style="display:block;width:100%;height:100%;cursor:grab;"></canvas>
    `;
    root.appendChild(this.wrap);
    this.canvas = this.wrap.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.wrap.querySelector('.panel-close')!.addEventListener('click', () => this.hide());

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip hidden';
    root.appendChild(this.tooltip);

    this.canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.dragMoved = false;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.camStart = { x: this.camX, y: this.camY };
      this.canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
      this.canvas.style.cursor = 'grab';
    });
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (this.dragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (Math.hypot(dx, dy) > 4) this.dragMoved = true;
        this.camX = this.camStart.x - dx / this.zoom;
        this.camY = this.camStart.y - dy / this.zoom;
      }
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.min(2.2, Math.max(0.28, this.zoom * factor));
    }, { passive: false });
    this.canvas.addEventListener('click', () => {
      if (this.dragMoved) return;
      if (this.hovered) this.handleNodeClick(this.hovered.id);
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  show(sim: Simulation): void {
    this.sim = sim;
    this.wrap.classList.remove('hidden');
    const startNode = sim.tree.nodes.get(`start_${sim.player.classId}`);
    if (startNode && this.camX === 0 && this.camY === 0) {
      this.camX = startNode.x;
      this.camY = startNode.y;
    }
    this.resize();
  }

  hide(): void {
    this.wrap.classList.add('hidden');
    this.tooltip.classList.add('hidden');
    this.onClose?.();
  }

  isVisible(): boolean {
    return !this.wrap.classList.contains('hidden');
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  private worldToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - this.camX) * this.zoom + this.canvas.width / 2,
      y: (y - this.camY) * this.zoom + this.canvas.height / 2,
    };
  }

  private handleNodeClick(nodeId: string): void {
    const sim = this.sim!;
    const player = sim.player;
    const node = sim.tree.nodes.get(nodeId);
    if (!node) return;
    if (node.kind === 'start') return;
    if (player.allocatedNodes.has(nodeId)) {
      player.allocatedNodes.delete(nodeId);
      player.passivePoints++;
      this.cascadeCheck();
      this.onDirty?.();
      return;
    }
    if (player.passivePoints <= 0) return;
    const adjacentAllocated = node.neighbors.some((n) => player.allocatedNodes.has(n));
    if (!adjacentAllocated) return;
    player.allocatedNodes.add(nodeId);
    player.passivePoints--;
    this.onDirty?.();
  }

  private cascadeCheck(): void {
    const sim = this.sim!;
    const player = sim.player;
    const startId = `start_${player.classId}`;
    const reachable = new Set<string>([startId]);
    const queue = [startId];
    while (queue.length) {
      const cur = queue.shift()!;
      const node = sim.tree.nodes.get(cur);
      if (!node) continue;
      for (const nb of node.neighbors) {
        if (player.allocatedNodes.has(nb) && !reachable.has(nb)) {
          reachable.add(nb);
          queue.push(nb);
        }
      }
    }
    for (const id of Array.from(player.allocatedNodes)) {
      if (!reachable.has(id)) {
        player.allocatedNodes.delete(id);
        player.passivePoints++;
      }
    }
  }

  chooseAscendancy(ascId: string): void {
    const player = this.sim!.player;
    player.ascendancyId = ascId;
    this.onDirty?.();
    this.renderSidebar();
  }

  private allocateAscNode(nodeId: string, index: number): void {
    const player = this.sim!.player;
    if (!player.ascendancyId) return;
    if (player.allocatedAscNodes.has(nodeId)) return;
    if (player.ascendancyPoints <= player.allocatedAscNodes.size) return;
    if (index > 0) {
      const nodes = ASCENDANCY_NODES[player.ascendancyId];
      if (!player.allocatedAscNodes.has(nodes[index - 1].id)) return;
    }
    player.allocatedAscNodes.add(nodeId);
    this.onDirty?.();
    this.renderSidebar();
  }

  render(): void {
    if (!this.sim || !this.isVisible()) return;
    this.resize();
    this.renderSidebar();
    const ctx = this.ctx;
    const player = this.sim.player;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#0c0a06';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.strokeStyle = 'rgba(120,110,80,0.28)';
    ctx.lineWidth = Math.max(1, 1.4 * this.zoom);
    const drawn = new Set<string>();
    for (const node of this.sim.tree.nodes.values()) {
      const a = this.worldToScreen(node.x, node.y);
      for (const nbId of node.neighbors) {
        const key = node.id < nbId ? `${node.id}|${nbId}` : `${nbId}|${node.id}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const nb = this.sim.tree.nodes.get(nbId);
        if (!nb) continue;
        const bothAllocated = player.allocatedNodes.has(node.id) && player.allocatedNodes.has(nbId);
        ctx.strokeStyle = bothAllocated ? 'rgba(224,200,120,0.7)' : 'rgba(120,110,80,0.25)';
        const b = this.worldToScreen(nb.x, nb.y);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    let hovered: TreeNode | null = null;
    let hoveredDist = Infinity;
    for (const node of this.sim.tree.nodes.values()) {
      const s = this.worldToScreen(node.x, node.y);
      if (s.x < -20 || s.y < -20 || s.x > w + 20 || s.y > h + 20) continue;
      const baseR = node.kind === 'start' ? 11 : node.kind === 'keystone' ? 9 : node.kind === 'notable' ? 7 : 4;
      const r = baseR * Math.max(0.5, this.zoom);
      const allocated = player.allocatedNodes.has(node.id);
      const allocatable = !allocated && node.neighbors.some((n) => player.allocatedNodes.has(n));

      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = allocated ? NODE_COLOR[node.kind] : allocatable ? 'rgba(224,200,120,0.5)' : 'rgba(90,84,64,0.55)';
      ctx.fill();
      if (allocated || node.kind !== 'small') {
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = allocated ? '#fff8e0' : 'rgba(180,170,130,0.6)';
        ctx.stroke();
      }

      const d = Math.hypot(this.mouseScreen.x - s.x, this.mouseScreen.y - s.y);
      if (d < r + 6 && d < hoveredDist) {
        hoveredDist = d;
        hovered = node;
      }
    }
    this.hovered = hovered;
    ctx.restore();

    if (hovered) {
      this.canvas.style.cursor = 'pointer';
      const rect = this.canvas.getBoundingClientRect();
      this.tooltip.classList.remove('hidden');
      this.tooltip.style.left = `${rect.left + this.mouseScreen.x + 18}px`;
      this.tooltip.style.top = `${rect.top + this.mouseScreen.y + 10}px`;
      const allocated = player.allocatedNodes.has(hovered.id);
      this.tooltip.innerHTML = `<b>${hovered.name}</b><br/>${hovered.desc || ''}${allocated ? '<br/><i style="opacity:0.6">Click to remove</i>' : ''}`;
    } else {
      this.canvas.style.cursor = this.dragging ? 'grabbing' : 'grab';
      this.tooltip.classList.add('hidden');
    }
  }

  private renderSidebar(): void {
    const player = this.sim!.player;
    const pointsEl = this.wrap.querySelector('#tree-points')!;
    pointsEl.textContent = `Passive Points: ${player.passivePoints}`;

    const ascEl = this.wrap.querySelector('#tree-ascendancy')! as HTMLElement;
    ascEl.innerHTML = '';
    const classDef = CLASSES[player.classId];
    if (!player.ascendancyId) {
      if (player.level < 10) {
        ascEl.innerHTML = `<span style="opacity:0.6">Ascendancy unlocks at level 10.</span>`;
        return;
      }
      const title = document.createElement('div');
      title.textContent = 'Choose your Ascendancy:';
      title.style.marginBottom = '4px';
      ascEl.appendChild(title);
      for (const asc of classDef.ascendancies) {
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.style.display = 'block';
        btn.style.marginBottom = '4px';
        btn.style.textAlign = 'left';
        btn.innerHTML = `<b>${asc.name}</b> — ${asc.description}`;
        btn.addEventListener('click', () => this.chooseAscendancy(asc.id));
        ascEl.appendChild(btn);
      }
      return;
    }

    const asc = classDef.ascendancies.find((a) => a.id === player.ascendancyId);
    const nodes = ASCENDANCY_NODES[player.ascendancyId];
    if (!asc || !nodes) return;
    const title = document.createElement('div');
    title.innerHTML = `<b>${asc.name}</b> — ${player.allocatedAscNodes.size}/${player.ascendancyPoints} points used`;
    title.style.marginBottom = '4px';
    ascEl.appendChild(title);
    nodes.forEach((n, i) => {
      const allocated = player.allocatedAscNodes.has(n.id);
      const prevOk = i === 0 || player.allocatedAscNodes.has(nodes[i - 1].id);
      const row = document.createElement('div');
      row.className = 'gem-row' + (allocated || (!prevOk) ? (allocated ? '' : ' locked') : '');
      row.style.opacity = allocated ? '1' : prevOk ? '0.85' : '0.35';
      row.innerHTML = `<span>${allocated ? '&#10003; ' : ''}${n.name}</span>`;
      row.title = n.desc;
      if (!allocated && prevOk) {
        row.addEventListener('click', () => this.allocateAscNode(n.id, i));
      }
      ascEl.appendChild(row);
    });
  }
}
