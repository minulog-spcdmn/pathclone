import './style.css';
import { Camera } from './engine/Camera.ts';
import { Input } from './engine/Input.ts';
import { GameLoop } from './engine/Game.ts';
import { generatePassiveTree } from './data/passiveTree.ts';
import { Simulation } from './state/Simulation.ts';
import { Scene3D } from './render/Scene3D.ts';
import { Overlay } from './render/Overlay.ts';
import { Hud } from './ui/Hud.ts';
import { InventoryPanel } from './ui/InventoryPanel.ts';
import { PassiveTreeUI } from './ui/PassiveTreeUI.ts';
import { PauseMenu } from './ui/PauseMenu.ts';
import { WaypointPanel } from './ui/WaypointPanel.ts';
import { mountStartFlow } from './ui/StartFlow.ts';
import { saveCharacter } from './state/SaveManager.ts';
import type { Player } from './entities/Player.ts';
import type { Zone } from './world/Zone.ts';

const app = document.getElementById('app')!;
const tree = generatePassiveTree();

function startGame(player: Player): void {
  const container = document.createElement('div');
  container.id = 'game-root';
  app.appendChild(container);

  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  container.appendChild(canvas);

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.id = 'overlay-canvas';
  container.appendChild(overlayCanvas);

  const labelLayer = document.createElement('div');
  labelLayer.id = 'world-labels';
  container.appendChild(labelLayer);

  const camera = new Camera();
  const input = new Input(canvas);
  const sim = new Simulation(player, tree, camera, input);

  const scene = new Scene3D(canvas, camera, labelLayer);
  const overlay = new Overlay(overlayCanvas, camera);
  let lastZone: Zone | null = null;

  const hud = new Hud(container);
  const invPanel = new InventoryPanel(container);
  const treeUI = new PassiveTreeUI(container);
  const pauseMenu = new PauseMenu(container);
  const waypointPanel = new WaypointPanel(container);

  function resize(): void {
    // Measure the actual container box rather than trusting window.innerWidth/innerHeight —
    // those can diverge from the real rendered area when the page is embedded, scrolled, or
    // sized by something other than the raw browser viewport.
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    scene.resize(w, h, hud.getBottomHudHeight());
    overlay.resize(w, h);
  }
  window.addEventListener('resize', resize);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  // Re-measure once more after layout settles (fonts/first paint can shift the HUD's real
  // height right after mount), so the playfield fit is correct from the very first frame.
  requestAnimationFrame(() => requestAnimationFrame(resize));

  const anyPanelOpen = (): boolean => invPanel.isVisible() || treeUI.isVisible() || waypointPanel.isVisible();
  const closeAllPanels = (): void => {
    invPanel.hide();
    treeUI.hide();
    waypointPanel.hide();
    sim.inputLocked = false;
  };
  invPanel.onClose = () => { sim.inputLocked = anyPanelOpen(); };
  treeUI.onClose = () => { sim.inputLocked = anyPanelOpen(); };
  waypointPanel.onClose = () => { sim.inputLocked = anyPanelOpen(); };
  invPanel.onDirty = () => saveCharacter(sim.player);
  treeUI.onDirty = () => saveCharacter(sim.player);

  sim.onStashOpen = () => {
    treeUI.hide();
    waypointPanel.hide();
    invPanel.show(sim, 'stash');
    sim.inputLocked = true;
  };
  sim.onWaypointOpen = () => {
    invPanel.hide();
    treeUI.hide();
    waypointPanel.show(sim);
    sim.inputLocked = true;
  };
  sim.onDeath = () => hud.showDeath();
  sim.onLevelUp = () => hud.showLevelUp();
  sim.onZoneChange = () => {
    saveCharacter(sim.player);
    hud.showZoneBanner(sim.zone.def.name);
  };
  hud.showZoneBanner(sim.zone.def.name);

  scene.onDropClick = (drop) => sim.queueInteraction({ kind: 'drop', drop });
  scene.onExitClick = (exit) => sim.queueInteraction({ kind: 'exit', exit });
  scene.onStashClick = (pos) => sim.queueInteraction({ kind: 'stash', pos });
  scene.onWaypointClick = (pos) => sim.queueInteraction({ kind: 'waypoint', pos });

  if (new URLSearchParams(location.search).has('debug')) {
    (window as unknown as { __sim: Simulation }).__sim = sim;
  }

  const togglePause = (): void => {
    if (pauseMenu.isVisible()) {
      pauseMenu.hide();
      sim.paused = false;
    } else if (!anyPanelOpen()) {
      pauseMenu.show();
      sim.paused = true;
    }
  };
  pauseMenu.onResume = togglePause;
  pauseMenu.onSaveAndExit = () => {
    saveCharacter(sim.player);
    teardown();
    boot();
  };

  const keydownHandler = (e: KeyboardEvent): void => {
    if (pauseMenu.isVisible() && e.code !== 'Escape') return;
    if (e.code === 'KeyI') {
      if (invPanel.isVisible()) { invPanel.hide(); sim.inputLocked = anyPanelOpen(); }
      else { treeUI.hide(); waypointPanel.hide(); invPanel.show(sim, 'inventory'); sim.inputLocked = true; }
    } else if (e.code === 'KeyP') {
      if (treeUI.isVisible()) { treeUI.hide(); sim.inputLocked = anyPanelOpen(); }
      else { invPanel.hide(); waypointPanel.hide(); treeUI.show(sim); sim.inputLocked = true; }
    } else if (e.code === 'KeyC') {
      treeUI.hide();
      waypointPanel.hide();
      invPanel.show(sim, 'character');
      sim.inputLocked = true;
    } else if (e.code === 'Escape') {
      if (anyPanelOpen()) closeAllPanels();
      else togglePause();
    }
  };
  window.addEventListener('keydown', keydownHandler);

  let saveTimer = 0;
  const loop = new GameLoop(
    (dt) => {
      sim.update(dt);
      if (!sim.paused) {
        saveTimer += dt;
        if (saveTimer > 8) {
          saveTimer = 0;
          saveCharacter(sim.player);
        }
      }
    },
    () => {
      if (lastZone !== sim.zone) {
        lastZone = sim.zone;
        scene.buildZone(sim.zone);
      }
      scene.syncFrame(sim);
      scene.render();
      overlay.draw(sim);
      canvas.style.cursor = sim.hoverTarget ? 'pointer' : 'crosshair';

      hud.update(sim, loop.step);
      treeUI.render();
    },
  );
  loop.start();

  function teardown(): void {
    loop.stop();
    window.removeEventListener('resize', resize);
    resizeObserver.disconnect();
    window.removeEventListener('keydown', keydownHandler);
    window.removeEventListener('beforeunload', saveOnUnload);
    window.removeEventListener('pagehide', saveOnUnload);
    container.remove();
  }

  function saveOnUnload(): void {
    saveCharacter(sim.player);
  }
  window.addEventListener('beforeunload', saveOnUnload);
  window.addEventListener('pagehide', saveOnUnload);
}

function boot(): void {
  const unmount = mountStartFlow(app, (player) => {
    unmount();
    startGame(player);
  });
}

boot();
