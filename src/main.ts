import './style.css';
import { Camera } from './engine/Camera.ts';
import { Input } from './engine/Input.ts';
import { GameLoop } from './engine/Game.ts';
import { Rng } from './engine/Random.ts';
import { Player } from './entities/Player.ts';
import type { ClassId } from './data/classes.ts';
import { generatePassiveTree } from './data/passiveTree.ts';
import { Simulation } from './state/Simulation.ts';
import { WorldRenderer } from './render/WorldRenderer.ts';
import { Hud } from './ui/Hud.ts';
import { InventoryPanel } from './ui/InventoryPanel.ts';
import { PassiveTreeUI } from './ui/PassiveTreeUI.ts';
import { mountCharacterCreate } from './ui/CharacterCreate.ts';
import { saveGame, loadGame, hasSave, clearSave } from './state/SaveManager.ts';
import { generateItem } from './systems/ItemGen.ts';

const app = document.getElementById('app')!;
const tree = generatePassiveTree();

function grantStartingGear(player: Player, rng: Rng): void {
  const weapon = generateItem(player.classDef.startWeaponId, 1, 'normal', rng);
  player.equipment.weapon = weapon;

  const attrs = player.classDef.baseAttrs;
  const archetype = attrs.strength >= attrs.dexterity && attrs.strength >= attrs.intelligence
    ? 'str' : attrs.dexterity >= attrs.intelligence ? 'dex' : 'int';
  const gearFor = (slot: string) => `${slot}_${archetype}_t1`;
  for (const slot of ['helmet', 'body', 'gloves', 'boots']) {
    const baseId = gearFor(slot);
    player.equipment[slot as 'helmet' | 'body' | 'gloves' | 'boots'] = generateItem(baseId, 1, 'normal', rng);
  }
  player.equipment.flask1 = generateItem('flask_life_t1', 1, 'normal', rng);
  player.equipment.flask2 = generateItem('flask_mana_t1', 1, 'normal', rng);
  player.gold = 20;
}

function startGame(player: Player): void {
  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  app.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const camera = new Camera();
  const input = new Input(canvas);
  const sim = new Simulation(player, tree, camera, input);

  const renderer = new WorldRenderer(ctx, camera);
  const hud = new Hud(app);
  const invPanel = new InventoryPanel(app);
  const treeUI = new PassiveTreeUI(app);

  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera.viewW = window.innerWidth;
    camera.viewH = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  const closeAllPanels = () => {
    invPanel.hide();
    treeUI.hide();
    sim.inputLocked = false;
  };
  invPanel.onClose = () => { sim.inputLocked = treeUI.isVisible(); };
  treeUI.onClose = () => { sim.inputLocked = invPanel.isVisible(); };
  invPanel.onDirty = () => saveGame(sim.player);
  treeUI.onDirty = () => saveGame(sim.player);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyI') {
      if (invPanel.isVisible()) { invPanel.hide(); sim.inputLocked = treeUI.isVisible(); }
      else { treeUI.hide(); invPanel.show(sim); sim.inputLocked = true; }
    } else if (e.code === 'KeyT') {
      if (treeUI.isVisible()) { treeUI.hide(); sim.inputLocked = invPanel.isVisible(); }
      else { invPanel.hide(); treeUI.show(sim); sim.inputLocked = true; }
    } else if (e.code === 'KeyC') {
      treeUI.hide();
      invPanel.show(sim, 'character');
      sim.inputLocked = true;
    } else if (e.code === 'Escape') {
      closeAllPanels();
    }
  });

  sim.onDeath = () => hud.showDeath();
  sim.onLevelUp = () => hud.showLevelUp();
  sim.onZoneChange = () => saveGame(sim.player);

  let saveTimer = 0;
  const loop = new GameLoop(
    (dt) => {
      sim.update(dt);
      saveTimer += dt;
      if (saveTimer > 8) {
        saveTimer = 0;
        saveGame(sim.player);
      }
    },
    () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#050403';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      renderer.drawFloor(sim.zone);
      renderer.drawDecorations(sim.zone);
      renderer.drawExits(sim.zone);
      renderer.drawGroundEffects(sim.groundEffects, sim.time);
      renderer.drawItemDrops(sim.drops, sim.time);

      type DepthEntry = { depth: number; draw: () => void };
      const entries: DepthEntry[] = [];
      entries.push({ depth: renderer.worldDepth(sim.player.pos.x, sim.player.pos.y), draw: () => renderer.drawEntity('player', sim.player, { now: sim.time }) });
      for (const m of sim.monsters) {
        entries.push({ depth: renderer.worldDepth(m.pos.x, m.pos.y), draw: () => renderer.drawEntity('monster', m, { now: sim.time }) });
      }
      for (const m of sim.minions) {
        entries.push({ depth: renderer.worldDepth(m.pos.x, m.pos.y), draw: () => renderer.drawEntity('minion', m, { now: sim.time }) });
      }
      entries.sort((a, b) => a.depth - b.depth);
      for (const e of entries) e.draw();

      renderer.drawProjectiles(sim.projectiles);
      renderer.drawFloatingTexts(sim.floatingTexts);

      hud.update(sim, loop.step);
      treeUI.render();
    },
  );
  loop.start();

  window.addEventListener('beforeunload', () => saveGame(sim.player));
  window.addEventListener('pagehide', () => saveGame(sim.player));
}

function newCharacter(classId: ClassId): void {
  const rng = new Rng(Date.now());
  const player = new Player(classId, { x: 0, y: 0 });
  grantStartingGear(player, rng);
  startGame(player);
}

function boot(): void {
  if (hasSave()) {
    const loaded = loadGame();
    if (loaded) {
      startGame(loaded);
      return;
    }
  }
  const unmount = mountCharacterCreate(app, (classId) => {
    unmount();
    clearSave();
    newCharacter(classId);
  });
}

boot();
