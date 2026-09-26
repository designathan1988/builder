// geometry.resize (ARCHITECTURE.md, Command owners; spec resize-handles): the selected element's width and height, and
// for a positioned element its left and top, written as whole CSS px at the base breakpoint and state through the one
// writer of declarations (core/style/set.ts). The canvas's handles run it during their drag, in one gesture: the page
// shows the size live and the history keeps one step. A locked element refuses (spec lock-element). The status bar
// says the size the element now declares ("Resized to 200px × 200px"; a size it does not declare reads auto).
// A shape of an SVG (spec elements-svg-shapes, Problems in Pager 3) takes the box as its own geometry attributes, in
// its SVG's coordinates (core/elements/svg.ts): the width and height of the box its geometry spans, and its corner for
// left and top; what the arguments leave out stays as it is.
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import { locate } from '../document/model.ts';
import { lockRefusal } from '../nodes/flags.ts';
import { writeDeclarations } from '../style/set.ts';
import { attributeOf, geometryAttributes, resizedShape, shapeBox } from '../elements/svg.ts';

const LENGTH = /^-?\d+px$/;

export const resizeCommand = registerHandler('geometry.resize', ({ state, rules }, args): Outcome<never> => {
  const id: NodeId | undefined = state.selection.length === 1 ? state.selection[0] : undefined;
  if (id === undefined) return { kind: 'refused', message: message('status.needsSingleSelection') };
  const at = locate(state.document, id);
  if (at === null) throw new Error(`geometry.resize: the document has no node ${id}`);
  const locked = lockRefusal(state.document, at.node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const values: Record<string, string> = {};
  for (const [property, value] of Object.entries(args)) {
    if (typeof value !== 'string') continue;
    if (!LENGTH.test(value)) throw new Error(`geometry.resize: ${property} "${value}" is no whole px length`);
    values[property] = value;
  }
  const geometry = geometryAttributes(rules, at.node.type, resizeCommand.command);
  const from = geometry.length > 0 ? shapeBox(at.node, geometry) : null;
  if (from !== null) {
    const number = (value: string | undefined, held: number) => (value === undefined ? held : Number.parseFloat(value));
    const box = { x: number(values.left, from.x), y: number(values.top, from.y), width: number(values.width, from.width), height: number(values.height, from.height) };
    const shaped = resizedShape(at.node, geometry, box) ?? {};
    const patches = Object.entries(shaped).flatMap(([id, value]) => (attributeOf(at.node, id) === value ? [] : [{ op: id in at.node.attributes ? ('replace' as const) : ('add' as const), path: [...at.path, 'attributes', id], value }]));
    return { kind: 'change', patches, message: message('status.resized', { width: `${box.width}px`, height: `${box.height}px` }) };
  }
  const { breakpoint, state: base } = rules.base;
  const declared = (at.node.styles as Record<string, Record<string, Record<string, string>> | undefined>)[breakpoint]?.[base] ?? {};
  const size = { ...declared, ...values };
  const said = message('status.resized', { width: size.width ?? 'auto', height: size.height ?? 'auto' });
  return { kind: 'change', patches: writeDeclarations(at.node, at.path, { breakpoint, state: base }, values), message: said };
});

// What a handle's drag writes (spec resize-handles): the element's border box from `from`, grown by the pointer's
// travel in CSS px on the handle's sides (twice as much with `centre`, Alt, around the middle); a corner handle with
// `aspect`, Shift, keeps the box's ratio; whole px, never below `min` on either axis. The width and height written
// measure the content under content-box. A positioned element's left and top move so the opposite edge (or, from the
// centre, the middle) stays where it was.
export interface ResizeFrom {
  readonly width: number;
  readonly height: number;
  readonly extraX: number;
  readonly extraY: number;
  readonly contentBox: boolean;
  readonly positioned: boolean;
  readonly left: number;
  readonly top: number;
}
export function resizedBox(from: ResizeFrom, handle: string, dx: number, dy: number, keys: { readonly aspect: boolean; readonly centre: boolean }, min: number): Record<'width' | 'height' | 'left' | 'top', string | undefined> {
  const side = handle.slice(handle.lastIndexOf('-') + 1);
  const east = side.includes('e');
  const west = side.includes('w');
  const south = side.includes('s');
  const north = side.includes('n');
  const times = keys.centre ? 2 : 1;
  let width = from.width + (east ? dx : west ? -dx : 0) * times;
  let height = from.height + (south ? dy : north ? -dy : 0) * times;
  if (keys.aspect && (east || west) && (north || south) && from.width > 0 && from.height > 0) {
    const scale = Math.max(width / from.width, height / from.height);
    width = from.width * scale;
    height = from.height * scale;
  }
  width = Math.max(min, Math.round(width));
  height = Math.max(min, Math.round(height));
  const px = (value: number) => `${Math.round(value)}px`;
  const across = east || west;
  const down = north || south;
  const left = !from.positioned || !across ? undefined : keys.centre ? from.left - (width - from.width) / 2 : west ? from.left + from.width - width : undefined;
  const top = !from.positioned || !down ? undefined : keys.centre ? from.top - (height - from.height) / 2 : north ? from.top + from.height - height : undefined;
  return {
    width: across ? px(from.contentBox ? width - from.extraX : width) : undefined,
    height: down ? px(from.contentBox ? height - from.extraY : height) : undefined,
    left: left === undefined ? undefined : px(left),
    top: top === undefined ? undefined : px(top),
  };
}
