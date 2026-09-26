// Shadows (ARCHITECTURE.md, Command owners; spec shadow-editor): style.setShadows writes the layers of a box shadow or
// a text shadow into every selected element, one undo step. A shadow is stored as its layers' typed fields (the
// structure of its property, properties.json structures: colour, X, Y, blur, and for a box shadow spread and inset;
// hidden), never as CSS text: a hidden layer stays in the document and its editor, only the CSS leaves it out
// (Problems in Pager 1); the output writes the CSS (src/core/render/output.ts structuredCss). The command applies an
// edit to the layers the primary selected element holds: add a layer, set a layer's field, hide or show it, remove it,
// remove them all, or nudge its X and Y (the light pad's keys). A length that is no length, a negative blur, and layers
// the browser does not take (a colour it does not know) are refused naming what was typed; a locked element refuses it.
import { message, registerHandler } from '../commands/registry.ts';
import { locate, type StructuredLayer } from '../document/model.ts';
import type { ModelRules, StructureField } from '../document/validate.ts';
import { structuredCss } from '../render/output.ts';
import { propertyName, storedLayers, writeStyle } from './set.ts';

// the layer Add a shadow appends (spec, "Trigger"): its colour, its lengths, its flags off
const DEFAULT_COLOUR = 'rgba(15, 23, 42, 0.24)';
const DEFAULT_LENGTHS: Readonly<Record<string, string>> = { offsetX: '0px', offsetY: '4px', blur: '12px', spread: '0px' };
// the edit's name for the colour typed
const [COLOUR_EDIT = ''] = Object.keys({ color: 0 } satisfies Partial<Record<keyof ShadowEdit, number>>);
// the length fields an edit names by x, y, blur and spread
const LENGTH_OF: Readonly<Record<string, string>> = { x: 'offsetX', y: 'offsetY', blur: 'blur', spread: 'spread' };

export interface ShadowEdit {
  readonly add?: boolean;
  readonly reset?: boolean;
  readonly layer?: number;
  readonly x?: string;
  readonly y?: string;
  readonly blur?: string;
  readonly spread?: string;
  readonly color?: string;
  readonly inset?: boolean;
  readonly hidden?: boolean;
  readonly remove?: boolean;
  readonly nudge?: { readonly x?: number; readonly y?: number };
}

const LENGTH = /^(-?(?:\d+(?:\.\d*)?|\.\d+))(px|em|rem)?$/i;
// a length as the shadow stores it (px when no unit is typed), or null
function lengthOf(text: string, least: number | null): string | null {
  const typed = LENGTH.exec(text.trim());
  if (typed === null) return null;
  const n = Number(typed[1]);
  if (least !== null && n < least) return null;
  return `${Math.round(n * 100) / 100}${(typed[2] ?? 'px').toLowerCase()}`;
}

// The layers once the edit is made, or the name of what the edit typed that is refused (layer: no such layer).
export function editedLayers(layers: readonly StructuredLayer[], fields: readonly StructureField[], edit: ShadowEdit): { readonly layers: readonly StructuredLayer[] } | { readonly refused: string } {
  if (edit.reset === true) return { layers: [] };
  // the colour field: the one that is neither a length nor a flag (the structure's closed list of types)
  const isColour = (f: StructureField) => f.type !== 'length' && f.type !== 'boolean';
  const colour = fields.find(isColour)?.id;
  if (edit.add === true) return { layers: [...layers, Object.fromEntries(fields.map((f) => [f.id, f.type === 'boolean' ? false : isColour(f) ? DEFAULT_COLOUR : (DEFAULT_LENGTHS[f.id] ?? '0px')]))] };
  const i = edit.layer;
  const layer = i === undefined ? undefined : layers[i];
  if (i === undefined || layer === undefined) return { refused: 'layer' };
  if (edit.remove === true) return { layers: layers.filter((_, n) => n !== i) };
  let next: Record<string, string | boolean> = { ...layer };
  for (const [name, field] of Object.entries(LENGTH_OF)) {
    const text = edit[name as keyof ShadowEdit];
    if (typeof text !== 'string' || !fields.some((f) => f.id === field)) continue;
    const length = lengthOf(text, field === 'blur' ? 0 : null);
    if (length === null) return { refused: name };
    next = { ...next, [field]: length };
  }
  if (typeof edit.color === 'string' && colour !== undefined) {
    if (edit.color.trim() === '') return { refused: COLOUR_EDIT };
    next = { ...next, [colour]: edit.color.trim() };
  }
  const flag = (id: string) => fields.some((f) => f.id === id && f.type === 'boolean');
  if (typeof edit.inset === 'boolean' && flag('inset')) next = { ...next, inset: edit.inset };
  if (typeof edit.hidden === 'boolean' && flag('hidden')) next = { ...next, hidden: edit.hidden };
  if (edit.nudge !== undefined) {
    for (const [axis, field] of [
      ['x', 'offsetX'],
      ['y', 'offsetY'],
    ] as const) {
      const by = edit.nudge[axis];
      if (by === undefined) continue;
      const held = LENGTH.exec(String(next[field] ?? ''));
      if (held === null || (held[2] ?? 'px').toLowerCase() !== 'px') return { refused: axis };
      next = { ...next, [field]: `${Math.round((Number(held[1]) + by) * 100) / 100}px` };
    }
  }
  return { layers: layers.map((l, n) => (n === i ? next : l)) };
}

export const setShadowsCommand = registerHandler('style.setShadows', (context, { property, edit, modifier }) => {
  const { state, rules, css } = context;
  const fields = rules.structures.get(property);
  if (fields === undefined) throw new Error(`properties.json: ${property} has no structured value`);
  const primary = state.selection[0] === undefined ? null : locate(state.document, state.selection[0]);
  if (primary === null || edit === null || typeof edit !== 'object' || Array.isArray(edit)) return { kind: 'change' };
  const refuse = (typed: unknown) => ({ kind: 'refused' as const, message: message('status.value.invalid', { property: propertyName(property, rules), value: typeof typed === 'string' ? typed : JSON.stringify(edit) }) });
  // Shift with a key of the light pad moves the light ten pixels (the gesture shadow-pad-keys)
  const given = edit as ShadowEdit;
  const stepped = modifier === 'Shift' && given.nudge !== undefined ? { ...given, nudge: { ...(given.nudge.x === undefined ? {} : { x: given.nudge.x * 10 }), ...(given.nudge.y === undefined ? {} : { y: given.nudge.y * 10 }) } } : given;
  const result = editedLayers(storedLayers(primary.node, property, rules), fields, stepped);
  if ('refused' in result) return refuse((edit as Record<string, unknown>)[result.refused]);
  const text = structuredCss(result.layers, fields);
  // the browser takes the layers as the output writes them, or they are refused (a colour it does not know)
  if (!css.supports(property, text)) return refuse((edit as ShadowEdit).color ?? text);
  return writeStyle(context, property, text, { [property]: result.layers });
});

// the CSS a shadow's layers make (the editor's rows show it)
export function shadowCss(layers: readonly StructuredLayer[], property: string, rules: ModelRules): string {
  return structuredCss(layers, rules.structures.get(property) ?? []);
}
