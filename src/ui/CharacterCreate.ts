import { CLASS_LIST } from '../data/classes.ts';
import type { ClassId } from '../data/classes.ts';

export function mountCharacterCreate(root: HTMLElement, onSelect: (classId: ClassId) => void): () => void {
  const el = document.createElement('div');
  el.id = 'charcreate';
  el.innerHTML = `
    <h1>CINDERFALL</h1>
    <div class="subtitle">Choose your exile</div>
    <div class="class-grid"></div>
  `;
  const grid = el.querySelector('.class-grid')!;
  let selected: ClassId | null = null;

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
    card.addEventListener('click', () => {
      selected = cls.id;
      onSelect(selected);
    });
    grid.appendChild(card);
  }

  root.appendChild(el);
  return () => el.remove();
}
