import { CLASS_LIST, CLASSES } from '../data/classes.ts';
import type { ClassId } from '../data/classes.ts';
import { Player } from '../entities/Player.ts';
import { generateItem } from '../systems/ItemGen.ts';
import { Rng } from '../engine/Random.ts';
import { listCharacters, loadCharacter, deleteCharacter, saveCharacter, hasFreeCharacterSlot } from '../state/SaveManager.ts';
import type { CharacterSummary } from '../state/SaveManager.ts';

function grantStartingGear(player: Player, rng: Rng): void {
  const weapon = generateItem(player.classDef.startWeaponId, 1, 'normal', rng);
  player.equipment.weapon = weapon;

  const attrs = player.classDef.baseAttrs;
  const archetype = attrs.strength >= attrs.dexterity && attrs.strength >= attrs.intelligence
    ? 'str' : attrs.dexterity >= attrs.intelligence ? 'dex' : 'int';
  for (const slot of ['helmet', 'body', 'gloves', 'boots'] as const) {
    player.equipment[slot] = generateItem(`${slot}_${archetype}_t1`, 1, 'normal', rng);
  }
  player.equipment.flask1 = generateItem('flask_life_t1', 1, 'normal', rng);
  player.equipment.flask2 = generateItem('flask_mana_t1', 1, 'normal', rng);
  for (let i = 0; i < 2; i++) player.inventory.addItem(generateItem('uncut_skill_gem', 1, 'normal', rng));
  player.inventory.addItem(generateItem('uncut_support_gem', 1, 'normal', rng));
  player.gold = 20;
}

export function mountStartFlow(root: HTMLElement, onStart: (player: Player) => void): () => void {
  const wrap = document.createElement('div');
  wrap.id = 'charcreate';
  root.appendChild(wrap);

  function clear(): void {
    wrap.innerHTML = '';
  }

  function showTitle(): void {
    clear();
    wrap.innerHTML = `
      <h1>CINDERFALL</h1>
      <div class="subtitle">An exile's path through Wraeth</div>
      <button class="big-btn" id="btn-play">PLAY</button>
    `;
    wrap.querySelector('#btn-play')!.addEventListener('click', showCharacterSelect);
  }

  function showCharacterSelect(): void {
    clear();
    const chars = listCharacters();
    const box = document.createElement('div');
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.gap = '10px';
    box.style.width = 'min(560px, 90vw)';

    const title = document.createElement('h1');
    title.textContent = 'SELECT CHARACTER';
    title.style.fontSize = '30px';
    wrap.appendChild(title);

    if (chars.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'subtitle';
      empty.style.marginTop = '-6px';
      empty.textContent = 'No exiles yet — create your first character.';
      wrap.appendChild(empty);
    }

    for (const c of chars) {
      box.appendChild(buildCharacterRow(c));
    }
    wrap.appendChild(box);

    const newBtn = document.createElement('button');
    newBtn.className = 'big-btn';
    newBtn.textContent = '+ NEW CHARACTER';
    newBtn.style.marginTop = '8px';
    newBtn.disabled = !hasFreeCharacterSlot();
    if (!hasFreeCharacterSlot()) newBtn.title = `Maximum of characters reached — delete one to make room.`;
    newBtn.addEventListener('click', showClassSelect);
    wrap.appendChild(newBtn);

    const back = document.createElement('button');
    back.className = 'tab-btn';
    back.textContent = 'Back';
    back.style.marginTop = '4px';
    back.addEventListener('click', showTitle);
    wrap.appendChild(back);
  }

  function buildCharacterRow(c: CharacterSummary): HTMLElement {
    const row = document.createElement('div');
    row.className = 'char-row';
    const classDef = CLASSES[c.classId];
    row.innerHTML = `
      <div class="char-row-info">
        <span class="char-row-name" style="color:${classDef.color}">${escapeHtml(c.name)}</span>
        <span class="char-row-meta">Level ${c.level} ${classDef.name}</span>
      </div>
      <div class="char-row-actions">
        <button class="tab-btn char-play">Play</button>
        <button class="tab-btn char-delete">Delete</button>
      </div>
    `;
    row.querySelector('.char-play')!.addEventListener('click', () => {
      const player = loadCharacter(c.saveId);
      if (player) onStart(player);
    });
    const delBtn = row.querySelector('.char-delete')!;
    delBtn.addEventListener('click', () => {
      if (delBtn.textContent === 'Delete') {
        delBtn.textContent = 'Confirm?';
        delBtn.classList.add('char-delete-confirm');
        setTimeout(() => {
          delBtn.textContent = 'Delete';
          delBtn.classList.remove('char-delete-confirm');
        }, 3000);
      } else {
        deleteCharacter(c.saveId);
        showCharacterSelect();
      }
    });
    return row;
  }

  function showClassSelect(): void {
    clear();
    wrap.innerHTML = `
      <h1 style="font-size:30px">CHOOSE YOUR CLASS</h1>
      <div class="class-grid"></div>
      <button class="tab-btn" id="btn-back" style="margin-top:8px">Back</button>
    `;
    const grid = wrap.querySelector('.class-grid')!;
    for (const cls of CLASS_LIST) {
      const card = document.createElement('div');
      card.className = 'class-card';
      card.style.borderColor = cls.color;
      card.innerHTML = `
        <h3 style="color:${cls.color}">${cls.name}</h3>
        <div class="tagline">${cls.tagline}</div>
        <div class="desc">${cls.description}</div>
        <div style="margin-top:8px;font-size:11px;opacity:0.7;">
          STR ${cls.baseAttrs.strength} &nbsp; DEX ${cls.baseAttrs.dexterity} &nbsp; INT ${cls.baseAttrs.intelligence}
        </div>
      `;
      card.addEventListener('click', () => showNameEntry(cls.id));
      grid.appendChild(card);
    }
    wrap.querySelector('#btn-back')!.addEventListener('click', showCharacterSelect);
  }

  function showNameEntry(classId: ClassId): void {
    clear();
    const classDef = CLASSES[classId];
    wrap.innerHTML = `
      <h1 style="font-size:30px">NAME YOUR ${classDef.name.toUpperCase()}</h1>
      <input id="name-input" class="name-input" maxlength="18" placeholder="Enter a name" autocomplete="off" />
      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="tab-btn" id="btn-back">Back</button>
        <button class="big-btn" id="btn-begin">BEGIN</button>
      </div>
    `;
    const input = wrap.querySelector('#name-input') as HTMLInputElement;
    input.focus();
    const begin = (): void => {
      const name = input.value.trim().slice(0, 18) || `${classDef.name}`;
      const rng = new Rng(Date.now() ^ Math.floor(Math.random() * 1e9));
      const player = new Player(classId, { x: 0, y: 0 }, name);
      grantStartingGear(player, rng);
      saveCharacter(player);
      onStart(player);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') begin();
    });
    wrap.querySelector('#btn-begin')!.addEventListener('click', begin);
    wrap.querySelector('#btn-back')!.addEventListener('click', showClassSelect);
  }

  showTitle();
  return () => wrap.remove();
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
