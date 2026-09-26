// The project's saved colours (ARCHITECTURE.md, Command owners; feature color-swatches-eyedropper): the colours a
// person saves from the colour picker, kept with the project (the document's `swatches`, in the order they were saved)
// and listed in every picker. colors.saveSwatch adds a colour once (a colour already saved changes nothing and records
// nothing); colors.removeSwatch takes one away by its place. Each is one undo step.
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import type { DocumentJson } from '../document/model.ts';

const NONE: readonly string[] = [];
export const swatchesOf = (document: DocumentJson): readonly string[] => document.swatches ?? NONE;

export const saveSwatchCommand = registerHandler('colors.saveSwatch', ({ state }, { color }): Outcome<never> => {
  const colour = String(color).trim();
  if (colour === '') throw new Error('colors.saveSwatch: the door hands the colour the picker shows');
  const said = message('status.swatch.saved', { color: colour });
  const saved = swatchesOf(state.document);
  if (saved.includes(colour)) return { kind: 'change', message: said };
  const patch = state.document.swatches === undefined ? { op: 'add' as const, path: ['swatches'], value: [colour] } : { op: 'add' as const, path: ['swatches', saved.length], value: colour };
  return { kind: 'change', patches: [patch], message: said };
});

export const removeSwatchCommand = registerHandler('colors.removeSwatch', ({ state }, { index }): Outcome<never> => {
  const saved = swatchesOf(state.document);
  const colour = saved[index];
  if (colour === undefined) throw new Error(`colors.removeSwatch: the project saves no colour at ${index}`);
  const patch = saved.length === 1 ? { op: 'remove' as const, path: ['swatches'] } : { op: 'remove' as const, path: ['swatches', index] };
  return { kind: 'change', patches: [patch], message: message('status.swatch.removed', { color: colour }) };
});
