// Resetting values (ARCHITECTURE.md, Command owners; spec inspector-provenance-reset): style.reset takes one property
// (a composite: its longhands) away from the styles of every selected element at the base breakpoint and state, so the
// element shows what it inherits or its default again; style.resetAll takes every style value of the selected elements
// away, at every breakpoint and state, one undo step. A locked element refuses both; an element that holds nothing to
// take away records nothing.
import { message, registerHandler } from '../commands/registry.ts';
import { locate, type NodeId } from '../document/model.ts';
import type { Patch } from '../history/transaction.ts';
import { firstLockRefusal } from '../nodes/flags.ts';
import { propertyName, styleHolders, writeDeclarations } from './set.ts';

export const resetValueCommand = registerHandler('style.reset', (context, { property }) => {
  const { state, rules } = context;
  const nodes = state.selection.map((id) => locate(state.document, id)).filter((found) => found !== null);
  const primary = nodes[0];
  if (primary === undefined) return { kind: 'change' };
  const locked = firstLockRefusal(state.document, nodes.map((found) => found.node.id as NodeId), 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const names = rules.compositeFacts.get(property)?.longhands ?? [property];
  const gone = Object.fromEntries(names.map((name) => [name, null] as const));
  const holders = styleHolders(context, nodes);
  const patches: Patch[] = holders.flatMap((held) => writeDeclarations(held.node, held.path, rules.base, gone));
  return { kind: 'change', patches, message: message('status.style.reset', { property: propertyName(property, rules), name: holders[0]?.name ?? primary.node.name }) };
});

export const resetAllCommand = registerHandler('style.resetAll', (context) => {
  const { state } = context;
  const nodes = state.selection.map((id) => locate(state.document, id)).filter((found) => found !== null);
  const primary = nodes[0];
  if (primary === undefined) return { kind: 'change' };
  const locked = firstLockRefusal(state.document, nodes.map((found) => found.node.id as NodeId), 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const holders = styleHolders(context, nodes);
  const patches: Patch[] = holders.filter((held) => Object.keys(held.node.styles).length > 0).map((held) => ({ op: 'replace', path: [...held.path, 'styles'], value: {} }));
  return { kind: 'change', patches, message: message('status.style.resetAll', { name: holders[0]?.name ?? primary.node.name }) };
});
