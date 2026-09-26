// The handles of an Edit on canvas mode (canvas/edit-mode.ts) on the one selected element, drawn by the canvas chrome.
// Each handle is the door of its value (the canvas-handle doors of the mode; what it stands for is canvas/handles.ts's
// handleArgs): it tells the pointer owner what its drag starts from and which way on the screen grows it (data-start,
// data-normal, a unit direction, data-min, data-value-arg), labels its value in CSS px, and takes the focus for its
// arrows (the canvas-handle key context, handle.step: its data-args name it). The pointer owner runs the drag.
//  - Padding and Margin (spec spacing-handles): the four sides as tinted bands (padding inside the border, margin
//    outside it, a negative margin inside; each as thick as its value and never thinner than spacing.minBand screen
//    px); a band also says its opposite side and its start, for Alt, and its click opens its typed field (TypedBand:
//    Enter keeps the text with the band's command, leaving the field closes it).
//  - Radius (spec radius-border-gap-handles, Problems in Pager 1): a corner handle inside the top left corner, moved
//    along the diagonal as the radius grows; dragging it toward the element's centre grows every corner.
//  - Border (Problems in Pager 2): a handle per side, just inside it; dragging it inward thickens that side.
//  - Shadow offset and Shadow blur (spec shadow-handles): one handle below the element's middle, moved by the first
//    layer's X and Y (offset) or blur, so it follows the pointer while it is dragged (Problems in Pager 1), labelled
//    X, Y or the blur; it edits the text shadow of an element that holds one, else its box shadow (canvas/handles.ts
//    shadowOf); an element with no shadow draws none.
//  - Gap, Row gap, Column gap (Problems in Pager 4 and 5): the column gap as a band between each two columns of the
//    children, the row gap between each two rows, read from their real boxes (core/geometry/lines.ts: a grid's
//    columns and rows, a wrapped flex's lines, a row flex's items, a column's or a block's rows), as thick as the gap;
//    a gap the layout does not show (Row gap in a single row) draws none.
//
// The sides are the box composite's longhands in CSS order (properties.json: top, right, bottom, left): a side's
// opposite is two places on, and the side's band lies across the element for the first and the third.
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from 'react';
import { isFeatureBuilt } from '../../app/features.ts';
import { locate, type NodeId } from '../../core/document/model.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import { gapBands } from '../../core/geometry/lines.ts';
import { mayBeNegative } from '../../core/style/spacing.ts';
import type { CommandId, FeatureId } from '../../generated/ids.ts';
import { manifest, numberConstant, type DoorEntry } from '../../manifest/runtime.ts';
import { useDoor } from '../doors/door.tsx';
import { useEditorState, useStore } from '../store.ts';
import { typedBand } from './band-typing.ts';
import { canvasFrame, computedValues, nodeBox } from './coordinates.ts';
import { editMode, handlesOf, type EditMode } from './edit-mode.ts';
import { handleArgs, movesOffset, shadowLength, shadowOf, valueArg } from './handles.ts';
import { MODEL_RULES } from '../store.ts';
import { lineStyles } from '../../core/style/set.ts';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
const MIN_BAND = numberConstant('spacing.minBand');
const DIRECT = numberConstant('handle.directSize');
// which way on the screen grows each side from inside the border (CSS order: down, left, up, right)
const INWARD: readonly (readonly [number, number])[] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];
const DIAGONAL = Math.SQRT1_2;
// a box composite's longhands, in its CSS order (properties.json)
const COMPOSITES = manifest.properties.composites;
const longhandsOf = (box: string): readonly string[] => COMPOSITES.find((c) => c.id === box)?.longhands ?? [];
// the gap longhands, row first: those of the gap handle that writes both (manifest)
const [ROW_GAP = '', COLUMN_GAP = ''] = manifest.doors.find((d) => d.door.kind === 'canvas-handle' && 'property' in d.command.args && d.door.adapter.writes.length === 2)?.door.adapter.writes ?? [];
const NONE: readonly string[] = [];
const px = (value: string | undefined): number => {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

// the values the page computes for these properties of a node, read at every frame while they are drawn
function useComputed(node: NodeId | null, properties: readonly string[]): Readonly<Record<string, string>> | null {
  const [read, setRead] = useState<{ readonly node: NodeId; readonly values: Readonly<Record<string, string>> | null } | null>(null);
  useEffect(() => {
    if (node === null || properties.length === 0) return;
    let request = 0;
    let last = '';
    const measure = () => {
      const values = computedValues(node, properties, lineStyles(MODEL_RULES));
      const text = JSON.stringify(values);
      if (text !== last) {
        last = text;
        setRead({ node, values });
      }
      request = requestAnimationFrame(measure);
    };
    request = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(request);
  }, [node, properties]);
  return read !== null && read.node === node ? read.values : null;
}

// the boxes of a node's children on the chrome (`origin`: the chrome's place on the screen), read at every frame while
// they are drawn
function useFlow(node: NodeId | null, children: readonly string[], origin: { readonly x: number; readonly y: number }): { readonly boxes: readonly Box[] } | null {
  const [read, setRead] = useState<{ readonly text: string; readonly boxes: readonly Box[] } | null>(null);
  const { x, y } = origin;
  useEffect(() => {
    if (node === null) return;
    let request = 0;
    const measure = () => {
      const frame = canvasFrame();
      if (frame) {
        const boxes = children
          .map((id) => nodeBox(frame, id))
          .filter((b): b is Box => b !== null)
          .map((b) => ({ x: b.x - x, y: b.y - y, width: b.width, height: b.height }));
        const text = JSON.stringify(boxes);
        setRead((before) => (before?.text === text ? before : { text, boxes }));
      }
      request = requestAnimationFrame(measure);
    };
    request = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(request);
  }, [node, children, x, y]);
  return read;
}

// A band's box on the chrome: side `i` of the element's box, with the four values in screen px.
function bandBox(box: Box, inwardOnly: boolean, i: number, screen: readonly number[]): Box {
  const own = screen[i] ?? 0;
  const thick = Math.max(Math.abs(own), MIN_BAND);
  const inside = inwardOnly || own < 0;
  const first = Math.abs(screen[0] ?? 0);
  const third = Math.abs(screen[2] ?? 0);
  if (i === 0) return { x: box.x, y: inside ? box.y : box.y - thick, width: box.width, height: thick };
  if (i === 2) return { x: box.x, y: inside ? box.y + box.height - thick : box.y + box.height, width: box.width, height: thick };
  const across = inside ? { y: box.y + first, height: Math.max(0, box.height - first - third) } : { y: box.y, height: box.height };
  if (i === 3) return { x: inside ? box.x : box.x - thick, width: thick, ...across };
  return { x: inside ? box.x + box.width - thick : box.x + box.width, width: thick, ...across };
}

interface Drawn {
  readonly entry: DoorEntry;
  readonly box: Box;
  readonly start: number;
  readonly normal: readonly [number, number];
  readonly min: number | null;
  readonly kind: 'band' | 'direct';
  // a spacing band's opposite side and its start (Alt)
  readonly opposite?: { readonly side: string; readonly start: number };
  // a shadow handle: the property it edits, what it moves and where from, and its label
  readonly shadow?: { readonly property: string; readonly offset: boolean; readonly x: number; readonly y: number; readonly blur: number };
}

function Handle({ drawn, mode }: { readonly drawn: Drawn; readonly mode: EditMode }) {
  const { entry, box, start, normal, min, kind, opposite, shadow } = drawn;
  const stands = shadow === undefined ? handleArgs(entry) : { property: shadow.property };
  const door = useDoor(entry, stands, undefined, isFeatureBuilt(entry.door.feature as FeatureId));
  const style: CSSProperties = { left: box.x, top: box.y, width: box.width, height: box.height };
  return (
    <div
      className={`chrome__${kind} chrome__${kind}--${mode}${door.available ? '' : ' is-unavailable'}`}
      data-door={entry.ref}
      data-args={JSON.stringify({ ...stands, handle: entry.ref })}
      data-edit-handle=""
      data-start={start}
      data-normal={normal.join(',')}
      data-min={min === null ? '' : String(min)}
      data-value-arg={valueArg(entry)}
      data-opposite={opposite?.side}
      data-opposite-start={opposite?.start}
      data-shadow={shadow === undefined ? undefined : shadow.offset ? 'offset' : 'blur'}
      data-start-x={shadow?.x}
      data-start-y={shadow?.y}
      data-chrome="handle"
      data-key-context="canvas-handle"
      tabIndex={door.available ? 0 : -1}
      role="slider"
      aria-valuenow={start}
      aria-label={door.label}
      aria-disabled={door.available ? undefined : true}
      title={door.title}
      style={style}
    >
      <span className="chrome__handle-value">{shadow?.offset === true ? `${shadow.x}, ${shadow.y}` : start}</span>
    </div>
  );
}

// The typed field of a band clicked without a drag: its text kept with the band's command (a bare number is px).
function TypedBand({ entry, box, value }: { readonly entry: DoorEntry; readonly box: Box; readonly value: number }) {
  const store = useStore();
  const input = useRef<HTMLInputElement>(null);
  const stands = handleArgs(entry);
  const door = useDoor(entry, stands);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.current?.value ?? '';
    typedBand.close();
    (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(entry.command.id as CommandId, { ...entry.door.args, ...stands, [valueArg(entry)]: text });
  };
  return (
    <form className="chrome__band-field" style={{ left: box.x, top: box.y }} onSubmit={submit} data-band-field="">
      <input ref={input} className="input" defaultValue={String(value)} aria-label={door.label} spellCheck={false} onBlur={() => typedBand.close()} data-key-context="field" />
    </form>
  );
}

// the properties each mode's handles read: every property their doors write
const READS = new Map<string, readonly string[]>();
const readsOf = (mode: EditMode, doors: readonly DoorEntry[]): readonly string[] => {
  const held = READS.get(mode);
  if (held !== undefined) return held;
  const list = [...new Set(doors.flatMap((d) => d.door.adapter.writes))];
  READS.set(mode, list);
  return list;
};
// a node's children, one list per text of them (a stable value while they are the same)
const IDS = new Map<string, readonly string[]>();
function childrenOf(text: string): readonly string[] {
  const held = IDS.get(text);
  if (held !== undefined) return held;
  const ids = JSON.parse(text) as string[];
  IDS.set(text, ids);
  return ids;
}

export function EditHandles({ node, box }: { readonly node: NodeId; readonly box: Box }) {
  const frame = canvasFrame();
  // the canvas zoom, which turns CSS px into the chrome's screen px, and the chrome's place on the screen
  const zoom = frame?.currentCSSZoom ?? 1;
  const screen = frame ? nodeBox(frame, node) : null;
  const origin = screen === null ? { x: 0, y: 0 } : { x: Math.round((screen.x - box.x) * 100) / 100, y: Math.round((screen.y - box.y) * 100) / 100 };
  const mode = useEditorState((s) => editMode(s.ui));
  const childrenText = useEditorState((s) => JSON.stringify(locate(s.document, node)?.node.children.map((c) => c.id) ?? []));
  const doors = handlesOf(mode);
  const reads = doors.length > 0 ? readsOf(mode, doors) : NONE;
  const computed = useComputed(doors.length > 0 ? node : null, reads);
  const gaps = doors.some((d) => 'property' in handleArgs(d));
  const flow = useFlow(gaps ? node : null, childrenOf(childrenText), origin);
  const typing = useSyncExternalStore(typedBand.subscribe, typedBand.get);
  // the element as the document holds it (its shadows' layers)
  const held = useEditorState((s) => locate(s.document, node)?.node ?? null);
  if (computed === null || doors.length === 0) return null;
  const drawn: Drawn[] = [];
  for (const entry of doors) {
    const writes = entry.door.adapter.writes;
    const first = writes[0] ?? '';
    const stands = handleArgs(entry);
    if ('edit' in entry.command.args) {
      // a shadow handle: below the element's middle, moved by the layer's offset or blur
      const shadow = held === null ? null : shadowOf(entry, held, MODEL_RULES);
      if (shadow === null) continue;
      const offset = movesOffset(entry);
      const [fx = '', fy = ''] = entry.door.adapter.fields;
      const x = shadowLength(shadow.layer[offset ? fx : '']);
      const y = shadowLength(shadow.layer[offset ? fy : '']);
      const blur = shadowLength(shadow.layer[offset ? '' : fx]);
      const cx = box.x + box.width / 2 + (offset ? x : blur) * zoom;
      const cy = box.y + box.height - DIRECT + (offset ? y : 0) * zoom;
      drawn.push({ entry, box: { x: cx - DIRECT / 2, y: cy - DIRECT / 2, width: DIRECT, height: DIRECT }, start: offset ? x : blur, normal: [1, 0], min: offset ? null : 0, kind: 'direct', shadow: { property: shadow.property, offset, x, y, blur } });
    } else if (stands.box !== undefined) {
      // a spacing band
      const sides = longhandsOf(stands.box);
      const values = sides.map((p) => px(computed[p]));
      const i = sides.indexOf(first);
      if (i < 0) continue;
      const [nx, ny] = INWARD[i] ?? [0, 0];
      const outward = mayBeNegative(stands.box);
      const facing = doors.find((d) => d.door.adapter.writes[0] === sides[(i + 2) % 4]);
      drawn.push({
        entry,
        box: bandBox(box, !outward, i, values.map((v) => v * zoom)),
        start: values[i] ?? 0,
        normal: outward ? [-nx, -ny] : [nx, ny],
        min: outward ? null : 0,
        kind: 'band',
        opposite: { side: facing === undefined ? '' : (handleArgs(facing).sides ?? ''), start: values[(i + 2) % 4] ?? 0 },
      });
    } else if (stands.corners !== undefined) {
      // the radius corner, along the diagonal
      const r = px(computed[first]);
      const at = Math.max(DIRECT, r * zoom * DIAGONAL + DIRECT / 2);
      drawn.push({ entry, box: { x: box.x + at - DIRECT / 2, y: box.y + at - DIRECT / 2, width: DIRECT, height: DIRECT }, start: r, normal: [DIAGONAL, DIAGONAL], min: 0, kind: 'direct' });
    } else if (stands.sides !== undefined) {
      // a border side, just inside it
      const widths = COMPOSITES.find((c) => c.longhands.includes(first) && c.longhands.length === 4)?.longhands ?? [];
      const i = widths.indexOf(first);
      const w = px(computed[first]);
      const [nx, ny] = INWARD[i] ?? [0, 0];
      const inset = w * zoom + DIRECT / 2;
      const cx = box.x + box.width / 2 - nx * (box.width / 2 - inset);
      const cy = box.y + box.height / 2 - ny * (box.height / 2 - inset);
      drawn.push({ entry, box: { x: cx - DIRECT / 2, y: cy - DIRECT / 2, width: DIRECT, height: DIRECT }, start: w, normal: [nx, ny], min: 0, kind: 'direct' });
    } else if (flow !== null) {
      // the gap bands, from the children's real boxes (Problems in Pager 5): the column gap between each two columns,
      // the row gap between each two rows; Gap draws both
      const laid = flow.boxes.map((b) => ({ box: b }));
      const gaps: readonly ('column' | 'row')[] = writes.length > 1 ? ['column', 'row'] : first === ROW_GAP ? ['row'] : ['column'];
      for (const gap of gaps) {
        const g = px(computed[gap === 'row' ? ROW_GAP : COLUMN_GAP]);
        for (const band of gapBands(laid, box, gap, MIN_BAND)) drawn.push({ entry, box: band, start: g, normal: gap === 'row' ? [0, 1] : [1, 0], min: 0, kind: 'band' });
      }
    }
  }
  const typed = typing === null ? undefined : drawn.find((d) => d.entry.ref === typing.ref && d.opposite !== undefined);
  return (
    <>
      {drawn.map((d, i) => (
        <Handle key={`${d.entry.ref}-${i}`} drawn={d} mode={mode} />
      ))}
      {typed !== undefined && typing !== null ? <TypedBand key={typing.count} entry={typed.entry} box={typed.box} value={typed.start} /> : null}
    </>
  );
}
