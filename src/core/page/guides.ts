// Manual guides (ARCHITECTURE.md, Command owners; spec guides-manual): lines across the page at a page px position,
// horizontal or vertical, kept on the page's root (its `guides`), never exported. Each is named by its axis and the
// first number no guide of the page has (horizontal-1), so a person, a scenario and the keys name the same guide.
//  - guides.create: a guide on an axis at a place (from 0, whole px).
//  - guides.move: to a place, or by a step along the axis a key moves (`delta`, `along`: a horizontal guide moves up and
//    down, a vertical one left and right; the keymap has made Shift's step the larger one); a locked guide refuses
//    (status.guides.locked).
//  - guides.delete, guides.toggleLock. One undo step each (a drag's creation, moves and delete are one gesture).
// The guides of the page the canvas shows: the first page, as element.insert places elements.
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import type { DocumentJson, Guide } from '../document/model.ts';
import type { Patch } from '../history/transaction.ts';

const NONE: readonly Guide[] = [];
const PAGE = 0;
export const guidesOf = (document: DocumentJson): readonly Guide[] => document.pages[PAGE]?.tree.guides ?? NONE;
const ROOT: readonly (string | number)[] = ['pages', PAGE, 'tree'];
const place = (at: number) => Math.max(0, Math.round(at));

// the patch that makes the page's guides these (none: the field goes)
function guidesPatch(document: DocumentJson, next: readonly Guide[]): Patch {
  const held = document.pages[PAGE]?.tree.guides;
  if (next.length === 0) return { op: 'remove', path: [...ROOT, 'guides'] };
  return held === undefined ? { op: 'add', path: [...ROOT, 'guides'], value: next } : { op: 'replace', path: [...ROOT, 'guides'], value: next };
}

// the name of a new guide on an axis: the axis and the first free number
export function nextGuideId(document: DocumentJson, axis: Guide['axis']): string {
  const taken = new Set(guidesOf(document).map((g) => g.id));
  let n = 1;
  while (taken.has(`${axis}-${n}`)) n += 1;
  return `${axis}-${n}`;
}

function found(document: DocumentJson, id: string): Guide {
  const guide = guidesOf(document).find((g) => g.id === id);
  if (guide === undefined) throw new Error(`guides: the page has no guide ${id}`);
  return guide;
}

export const createGuideCommand = registerHandler('guides.create', ({ state }, { axis, at }): Outcome<never> => {
  const guide: Guide = { id: nextGuideId(state.document, axis), axis, at: place(at) };
  return { kind: 'change', patches: [guidesPatch(state.document, [...guidesOf(state.document), guide])], message: message('status.guides.at', { at: guide.at }) };
});

// the axis a guide moves along: a horizontal line up and down, a vertical one left and right
const alongOf = (guide: Guide): Guide['axis'] => (guide.axis === 'horizontal' ? 'vertical' : 'horizontal');

export const moveGuideCommand = registerHandler('guides.move', ({ state }, { guide, at, delta, along }): Outcome<never> => {
  const held = found(state.document, guide);
  // a key that moves along the other axis moves nothing
  if (at === undefined && (delta === undefined || (along !== undefined && along !== alongOf(held)))) return { kind: 'change' };
  if (held.locked === true) return { kind: 'refused', message: message('status.guides.locked') };
  const next = place(at ?? held.at + (delta ?? 0));
  const said = message('status.guides.at', { at: next });
  if (next === held.at) return { kind: 'change', message: said };
  const list = guidesOf(state.document).map((g) => (g.id === guide ? { ...g, at: next } : g));
  return { kind: 'change', patches: [guidesPatch(state.document, list)], message: said };
});

export const deleteGuideCommand = registerHandler('guides.delete', ({ state }, { guide }): Outcome<never> => {
  found(state.document, guide);
  return { kind: 'change', patches: [guidesPatch(state.document, guidesOf(state.document).filter((g) => g.id !== guide))], message: message('status.guides.deleted') };
});

export const toggleGuideLockCommand = registerHandler('guides.toggleLock', ({ state }, { guide }): Outcome<never> => {
  const held = found(state.document, guide);
  const list = guidesOf(state.document).map((g): Guide => {
    if (g.id !== guide) return g;
    if (held.locked === true) {
      const { locked: _dropped, ...rest } = g;
      void _dropped;
      return rest;
    }
    return { ...g, locked: true };
  });
  return { kind: 'change', patches: [guidesPatch(state.document, list)], message: message(held.locked === true ? 'status.guides.unlocked' : 'status.guides.lockedNow') };
});
