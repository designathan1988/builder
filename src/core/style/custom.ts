// style.setCustomDeclarations (ARCHITECTURE.md, Command owners; feature props-attributes): the element's declarations
// written as CSS text, one "property: value;" each, at the base breakpoint and state. The text replaces the
// declarations the element holds there: a property written is stored with its value, a property left out is removed.
// Every property must be an edited property of properties.json and every value non-empty CSS text without braces or
// semicolons inside; the first piece that is not is refused naming its line and why (status.css.notDeclaration,
// status.css.unknownProperty, status.css.badValue), and the document keeps its declarations. One undo step; a locked element refuses (spec lock-element). The declarations are
// written to the page by the renderer through the element's own style rule, never as a style attribute.
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, type Message, type Outcome } from '../commands/registry.ts';
import { locate } from '../document/model.ts';
import type { Patch } from '../history/transaction.ts';
import { lockRefusal } from '../nodes/flags.ts';

// "property: value" pairs of CSS text, or why the first piece that is wrong is wrong, naming its line
export function parseDeclarations(text: string, known: ReadonlySet<string>): { readonly declarations: ReadonlyMap<string, string> } | { readonly refused: Message } {
  const declarations = new Map<string, string>();
  const lines = text.split('\n');
  for (const [i, raw] of lines.entries()) {
    for (const part of raw.split(';')) {
      const piece = part.trim();
      if (piece === '') continue;
      const colon = piece.indexOf(':');
      if (colon <= 0) return { refused: message('status.css.notDeclaration', { line: i + 1, text: piece }) };
      const property = piece.slice(0, colon).trim().toLowerCase();
      const value = piece.slice(colon + 1).trim();
      if (!known.has(property)) return { refused: message('status.css.unknownProperty', { line: i + 1, property }) };
      if (value === '' || /[{}]/.test(value)) return { refused: message('status.css.badValue', { line: i + 1, property, value }) };
      declarations.set(property, value);
    }
  }
  return { declarations };
}

export const setCustomDeclarationsCommand = registerHandler('style.setCustomDeclarations', ({ state, rules }, { declarations, target }): Outcome<never> => {
  const id = (target as NodeId | undefined) ?? (state.selection.length === 1 ? state.selection[0] : undefined);
  if (id === undefined) return { kind: 'refused', message: message('status.needsSingleSelection') };
  const at = locate(state.document, id);
  if (at === null) throw new Error(`style.setCustomDeclarations: the document has no node ${id}`);
  const locked = lockRefusal(state.document, at.node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const parsed = parseDeclarations(String(declarations), rules.properties);
  if ('refused' in parsed) return { kind: 'refused', message: parsed.refused };
  const { breakpoint, state: base } = rules.base;
  const byBreakpoint = (at.node.styles as Record<string, Record<string, Record<string, string>> | undefined>)[breakpoint];
  const current = byBreakpoint?.[base] ?? {};
  const wanted = Object.fromEntries(parsed.declarations);
  const same = Object.keys(current).length === Object.keys(wanted).length && Object.entries(wanted).every(([p, v]) => current[p] === v);
  const said = message('status.style.declarationsSet', { name: at.node.name, count: parsed.declarations.size });
  if (same) return { kind: 'change', message: said };
  const stylesPath = [...at.path, 'styles'];
  const patch: Patch =
    byBreakpoint === undefined
      ? { op: 'add', path: [...stylesPath, breakpoint], value: { [base]: wanted } }
      : { op: byBreakpoint[base] === undefined ? 'add' : 'replace', path: [...stylesPath, breakpoint, base], value: wanted };
  return { kind: 'change', patches: [patch], message: said };
});
