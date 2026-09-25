// The canvas chrome (ARCHITECTURE.md): what the editor draws over the page, on the canvas overlay: the outline of
// every selected node and the primary's label (its name and its exported tag, so the page root reads "body"); with
// several selected, the dashed outline of their union and one label counting them ("3 elements selected"); the
// thinner outline of the node the pointer hovers (pointer.ts); the band of a marquee while pointer.ts draws one
// (spec marquee-select: a 1 px accent border, a 16 % accent fill); and during an element drag (pointer.ts), the drop
// indicator (the insertion line, the receiver's outline and the drop label), with the dragged selection's outline
// dashed and its label hidden. A palette tile's creation drag (spec palette-drag-insert: nothing dragged) draws the
// same indicator, its label reading "Insert Paragraph · position 2 of 4 in Hero" (Problems in Pager 1), and, where
// the element's command would refuse it, the refused indicator with that refusal and no line (Problems in Pager 3);
// it leaves the selection's outline solid, and its ghost, the element's icon and name, follows the pointer at
// drag.ghostOffset over the whole window (Problems in Pager 4); cancelled with Escape, the ghost goes back to its
// tile and fades out (spec drag-level-keys-escape, Problems in Pager 4). While the keyboard's hand holds an element
// (core/structure/hand.ts), the same indicator stands at the hand's aim, with the refusal the move would meet there
// (spec hand-keyboard-move, "Visual feedback"). While a text is edited in place, its outline and label ("Editing
// text · Intro") wear the text editing mode colour instead of the selection's.
// The label of the one selected element is the one part of the chrome that takes a
// press: pointer.ts reads it (data-label-for) as a press on that element (spec select-click, "Hit zones"). Where a
// node is on the screen comes from the
// coordinates module (nodeBox), measured on every animation frame while there is something to draw, so the chrome
// follows scrolling, zoom and layout; the page itself is never touched (only the renderer writes it). Apart from
// those labels the chrome takes no pointer event, and it has no listener of its own (pointer.ts owns every gesture).
//
// Label rule (DESIGN.md "Canvas"): a label never covers page content. It sits above its element when that space is
// free, otherwise inside the element's top-left corner when that corner is free, otherwise below the element.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { message, type Message } from '../../core/commands/registry.ts';
import { locate, type DocNode, type DocumentJson, type NodeId } from '../../core/document/model.ts';
import { heldHand, type HandState } from '../../core/structure/hand.ts';
import type { MessageId } from '../../generated/ids.ts';
import { elementIcon, manifest } from '../../manifest/runtime.ts';
import { Icon } from '../doors/door.tsx';
import { GLYPHS } from '../doors/placement.ts';
import type { DropProposal } from '../drag/drop.ts';
import { band, drag, ghostReturn, hover, type DragView, type GhostReturn } from '../input/pointer.ts';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { canvasFrame, contentBoxes, flowAxis, nodeBox } from './coordinates.ts';

// the palette's entries by id: the element a creation drag inserts and the words that name it
const PALETTE = new Map(manifest.elements.palette.flatMap((g) => g.entries.map((e) => [e.id, e] as const)));
// where a creation drag's ghost sits from the pointer, in screen pixels (interactions.json)
const GHOST_OFFSET = ((): readonly [number, number] => {
  const value = manifest.interactions.constants.find((c) => c.id === 'drag.ghostOffset')?.value;
  if (!Array.isArray(value) || typeof value[0] !== 'number' || typeof value[1] !== 'number') throw new Error('interactions.json has no pair drag.ghostOffset');
  return [value[0], value[1]];
})();
// how long the ghost of a cancelled creation drag takes to go back to its tile: halfway between the bounds of
// interactions.json (spec drag-level-keys-escape, Problems in Pager 4: 150 to 250 ms)
const GHOST_RETURN_MS = ((): number => {
  const bound = (id: string) => manifest.interactions.constants.find((c) => c.id === id)?.value;
  const [min, max] = [bound('drag.cancelReturnMin'), bound('drag.cancelReturnMax')];
  if (typeof min !== 'number' || typeof max !== 'number') throw new Error('interactions.json has no number drag.cancelReturnMin or drag.cancelReturnMax');
  return (min + max) / 2;
})();

// What the drop indicator draws: the drag in progress (pointer.ts), or the aim of the keyboard's hand, which has no
// pointer and no ghost (and climbs no level of a drag).
type DropView = Pick<DragView, 'dragged' | 'inserting' | 'proposal' | 'refusal' | 'levels'>;

// The words of the drag in progress (DESIGN.md "Canvas", drag): what its drop label reads, and, for a palette tile's
// creation drag, the status bar too (spec palette-drag-insert, Problems in Pager 1 and 2). Over the dragged nodes'
// own subtree, or where the new element's command refuses it, the refusal; a move reads "Drop in Hero · position 2 of
// 3"; a creation drag "Insert Paragraph · position 2 of 4 in Hero", or "Insert Container · into Actions" into a
// receiver with no child, and, with no proposal (off the page), "Outside the page — release to cancel.". Null for a
// move with no proposal. The hand's aim reads as a move, or its refusal. A proposal the level keys climbed says how
// many receiver levels it climbed ("· ↑1", spec drag-level-keys-escape, Problems in Pager 3): the levels actually
// climbed, never the keys pressed.
export function dragWords(document: DocumentJson, view: DropView): Message | null {
  const { proposal, dragged, inserting, refusal, levels } = view;
  if (proposal === null) return inserting !== null ? message('status.drop.outsidePage') : null;
  // the refusal its drop would meet (a creation drag's, the hand's aim), else the dragged nodes' own subtree
  if (refusal !== null) return refusal;
  if (proposal.refused) return message('status.refused.intoItself');
  const receiver = locate(document, proposal.parent)?.node ?? null;
  if (receiver === null) return null;
  const siblings = receiver.children.filter((c) => !dragged.includes(c.id));
  if (inserting === null) {
    const where = { parent: receiver.name, position: proposal.index + 1, count: siblings.length + dragged.length };
    return levels > 0 ? message('canvas.dropTargetLevel', { ...where, levels }) : message('canvas.dropTarget', where);
  }
  const labelKey = PALETTE.get(inserting)?.labelKey;
  const element = labelKey === undefined ? inserting : { key: labelKey as MessageId };
  if (siblings.length === 0) return message('canvas.insertInto', { element, parent: receiver.name });
  const where = { element, position: proposal.index + 1, count: siblings.length + 1, parent: receiver.name };
  return levels > 0 ? message('canvas.insertTargetLevel', { ...where, levels }) : message('canvas.insertTarget', where);
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export type Placement = 'above' | 'inside' | 'below';
interface Layout {
  readonly selected: readonly Box[];
  // the box around every selected node, drawn dashed while several are selected (DESIGN.md "Canvas", multi)
  readonly union: Box | null;
  readonly hovered: Box | null;
  readonly label: { readonly box: Box; readonly placement: Placement } | null;
  // the marquee's band while one is drawn (pointer.ts)
  readonly band: Box | null;
}
const EMPTY: Layout = { selected: [], union: null, hovered: null, label: null, band: null };

// the smallest box around every box given; null for none
export function unionOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const within = (a: Box, area: Box) => a.x >= area.x && a.y >= area.y && a.x + a.width <= area.x + area.width && a.y + a.height <= area.y + area.height;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Where the label of a box goes: the first free place in the rule's order, all in screen pixels; a place is free
// when it lies on the canvas and covers no page content. With none free it goes below.
export function placeLabel(box: Box, size: { readonly width: number; readonly height: number }, gap: number, content: readonly Box[], canvas: Box): { box: Box; placement: Placement } {
  const places: { box: Box; placement: Placement }[] = [
    { placement: 'above', box: { x: box.x, y: box.y - gap - size.height, ...size } },
    { placement: 'inside', box: { x: box.x + gap, y: box.y + gap, ...size } },
    { placement: 'below', box: { x: box.x, y: box.y + box.height + gap, ...size } },
  ];
  return places.find((p) => within(p.box, canvas) && !content.some((c) => overlaps(p.box, c))) ?? (places[2] as { box: Box; placement: Placement });
}

// Where the insertion line of a drop goes, on the screen: across the receiver's box, in the middle of the gap between
// the reference and its neighbour on the side of the drop (the reference's own edge when it has none there), along
// the receiver's flow axis.
export function dropLine(axis: 'x' | 'y', receiver: Box, reference: Box, neighbour: Box | null, placement: 'before' | 'after'): Box {
  const [start, end] = axis === 'y' ? [(b: Box) => b.y, (b: Box) => b.y + b.height] : [(b: Box) => b.x, (b: Box) => b.x + b.width];
  const at = placement === 'before' ? (neighbour ? (end(neighbour) + start(reference)) / 2 : start(reference)) : neighbour ? (end(reference) + start(neighbour)) / 2 : end(reference);
  return axis === 'y' ? { x: receiver.x, y: at, width: receiver.width, height: 0 } : { x: at, y: receiver.y, width: 0, height: receiver.height };
}

// The sibling an insertion line is drawn against, and its neighbour on that side: the proposal's own reference
// beside a sibling; inside a container, the child at the slot (before it) or the last child (after it); none for a
// refused proposal or a container with no other child, which shows its outline alone.
export function lineAnchor(proposal: DropProposal, siblings: readonly string[]): { reference: string; neighbour: string | null; placement: 'before' | 'after' } | null {
  if (proposal.refused) return null;
  if (proposal.placement !== 'inside') {
    const at = siblings.indexOf(proposal.reference);
    return { reference: proposal.reference, neighbour: siblings[proposal.placement === 'before' ? at - 1 : at + 1] ?? null, placement: proposal.placement };
  }
  const slot = siblings[proposal.index];
  if (slot !== undefined) return { reference: slot, neighbour: siblings[proposal.index - 1] ?? null, placement: 'before' };
  const last = siblings.at(-1);
  return last === undefined ? null : { reference: last, neighbour: null, placement: 'after' };
}

interface DropLayout {
  readonly line: Box | null;
  readonly receiver: Box;
  readonly label: { readonly box: Box; readonly placement: Placement } | null;
}

// The hand's aim as a drop (spec hand-keyboard-move: "the same indicator a mouse drag draws"): the held element is
// dragged, the aim is a slot inside its receiver, and the move's refusal of the aim, if any, is the drop's.
export function handDrop(hand: HandState): DropView {
  const { parent, index } = hand.aim;
  return { dragged: [hand.held], inserting: null, proposal: { parent, index, placement: 'inside', reference: parent, refused: false }, refusal: hand.refusal, levels: 0 };
}

// The drop indicator of the drag in progress (spec drag-reorder-canvas, "Visual feedback", and Problems in Pager 3):
// the insertion line where the dragged nodes will land, the receiving parent's outline, and the label naming the
// receiver and the position ("Drop in Hero · position 1 of 3", DESIGN.md "Canvas", drag), placed by the label rule
// next to the line, never at the receiver's far corner. A proposal that the command would refuse (a creation drag's,
// the hand's aim) is drawn refused (spec palette-drag-insert, Problems in Pager 3). A drag's proposal drawn is the one
// of the level the level keys set (drag-session.ts), redrawn as soon as a key changes it.
function DropIndicator({ view }: { readonly view: DropView }) {
  const document = useEditorState((s) => s.document);
  const t = useT();
  const layer = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<DropLayout | null>(null);
  const { dragged } = view;
  const refusedHere = view.refusal !== null;
  const proposal = useMemo(() => (view.proposal !== null && refusedHere ? { ...view.proposal, refused: true } : view.proposal), [view.proposal, refusedHere]);
  const words = dragWords(document, view);
  const receiver = proposal === null ? null : (locate(document, proposal.parent)?.node ?? null);
  const siblings = receiver === null ? [] : receiver.children.filter((c) => !dragged.includes(c.id));

  useEffect(() => {
    let request = 0;
    const parent = proposal === null ? null : (locate(document, proposal.parent)?.node ?? null);
    if (proposal === null || parent === null) {
      request = requestAnimationFrame(() => setLayout(null));
      return () => cancelAnimationFrame(request);
    }
    const siblings = parent.children.filter((c) => !dragged.includes(c.id));
    const anchor = lineAnchor(proposal, siblings.map((c) => c.id));
    const measure = () => {
      const iframe = canvasFrame();
      const origin = layer.current?.getBoundingClientRect();
      if (iframe && origin) {
        const local = (b: Box | null): Box | null => (b === null ? null : { x: b.x - origin.x, y: b.y - origin.y, width: b.width, height: b.height });
        const box = local(nodeBox(iframe, proposal.parent));
        const reference = anchor === null ? null : local(nodeBox(iframe, anchor.reference));
        const next = anchor?.neighbour == null ? null : local(nodeBox(iframe, anchor.neighbour));
        if (box && (anchor === null || reference)) {
          const line = anchor !== null && reference ? dropLine(flowAxis(iframe, proposal.parent), box, reference, next, anchor.placement) : null;
          const size = label.current ? { width: label.current.offsetWidth, height: label.current.offsetHeight } : null;
          const gap = parseFloat(getComputedStyle(layer.current as HTMLDivElement).getPropertyValue('--space-2')) || 0;
          const content = contentBoxes(iframe).map((b) => local(b) as Box);
          const placed = size === null ? null : placeLabel(line ?? box, size, gap, content, { x: 0, y: 0, width: origin.width, height: origin.height });
          const nextLayout: DropLayout = { line, receiver: box, label: placed };
          setLayout((before) => (same(before, nextLayout) ? before : nextLayout));
        }
      }
      request = requestAnimationFrame(measure);
    };
    request = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(request);
  }, [proposal, dragged, document]);

  if (proposal === null || receiver === null) return <div ref={layer} className="chrome__drop" />;
  const at = (b: Box): CSSProperties => ({ left: b.x, top: b.y, width: b.width, height: b.height });
  // refused over the dragged subtree; into a container that shows no line (it has no other child); or between siblings
  const state = proposal.refused ? 'refused' : lineAnchor(proposal, siblings.map((c) => c.id)) === null ? 'into' : 'between';
  return (
    <div ref={layer} className="chrome__drop" data-chrome="drop">
      {layout ? <div className={`chrome__receiver is-${state}`} data-chrome="drop-receiver" data-state={state} style={at(layout.receiver)} /> : null}
      {layout?.line ? <div className="chrome__drop-line" data-chrome="drop-line" style={at(layout.line)} /> : null}
      <div
        ref={label}
        className={`chrome__label${layout?.label ? '' : ' is-measuring'}${proposal.refused ? ' is-refused' : ''}`}
        data-chrome="drop-label"
        data-placement={layout?.label?.placement}
        style={layout?.label ? { left: layout.label.box.x, top: layout.label.box.y } : undefined}
      >
        <span className="chrome__name">{words === null ? null : t(words.key, words.params)}</span>
      </div>
    </div>
  );
}

// The ghost of a palette tile's creation drag (spec palette-drag-insert, Problems in Pager 4): a chip with the new
// element's icon and name, at drag.ghostOffset from the pointer wherever it is in the window (over the palette, the
// stage or the page), so a creation drag never looks like the move of an element of the same name. Drawn over the
// whole window (a portal on the body), never a pointer target; refused (off the page, or where the element is
// refused) it wears the refusal's colour.
function Ghost({ entry, at, refused, ref }: { readonly entry: string; readonly at: { readonly x: number; readonly y: number }; readonly refused: boolean; readonly ref?: Ref<HTMLDivElement> }) {
  const t = useT();
  const item = PALETTE.get(entry);
  if (item === undefined) return null;
  return createPortal(
    <div ref={ref} className={`chrome-ghost${refused ? ' is-refused' : ''}`} data-chrome="ghost" data-entry={entry} style={{ left: at.x + GHOST_OFFSET[0], top: at.y + GHOST_OFFSET[1] }}>
      <Icon name={elementIcon(item.element) ?? GLYPHS.folder} size="sm" />
      <span className="chrome-ghost__label">{t(item.labelKey as MessageId)}</span>
    </div>,
    document.body,
  );
}

// The ghost of a creation drag Escape cancelled (pointer.ts, ghostReturn) goes back to the tile it came from and fades
// out over GHOST_RETURN_MS (spec drag-level-keys-escape, Problems in Pager 4), then is drawn no more; at once when the
// person asks for reduced motion.
function ReturningGhost({ view }: { readonly view: GhostReturn }) {
  const ghost = useRef<HTMLDivElement>(null);
  const [back, setBack] = useState(false);
  useLayoutEffect(() => {
    const element = ghost.current;
    if (element === null) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const way = element.animate(
      [
        { transform: 'translate(0px, 0px)', opacity: 1 },
        { transform: `translate(${view.to.x - view.from.x}px, ${view.to.y - view.from.y}px)`, opacity: 0 },
      ],
      { duration: reduced ? 0 : GHOST_RETURN_MS, easing: 'ease-in', fill: 'forwards' },
    );
    let playing = true;
    way.finished.then(
      () => {
        if (playing) setBack(true);
      },
      () => {},
    );
    return () => {
      playing = false;
      way.cancel();
    };
  }, [view]);
  return back ? null : <Ghost ref={ghost} entry={view.entry} at={view.from} refused={false} />;
}

// Where a selected node is drawn: itself, or, when it or an ancestor is hidden (spec hide-element, Problems in Pager
// 1), the nearest ancestor that is shown, with the node marked hidden. As one text, so the store's selector returns
// the same value while nothing changes.
function drawnTargets(document: DocumentJson, selection: readonly NodeId[]): string {
  return JSON.stringify(
    selection.map((id) => {
      const chain: DocNode[] = [];
      for (let at = locate(document, id); at !== null; at = at.parent === null ? null : locate(document, at.parent.id)) chain.push(at.node);
      const outermost = chain.map((n) => n.hidden === true).lastIndexOf(true);
      return outermost < 0 ? { id, hidden: false } : { id: chain[outermost + 1]?.id ?? id, hidden: true };
    }),
  );
}

export function CanvasChrome() {
  const selection = useEditorState((s) => s.selection);
  const targetsText = useEditorState((s) => drawnTargets(s.document, s.selection));
  const targets = useMemo(() => JSON.parse(targetsText) as { id: NodeId; hidden: boolean }[], [targetsText]);
  // the drag in progress (pointer.ts): the drop indicator is drawn, the selection's label hides and its outline turns
  // into the dashed outline of the source (Problems in Pager 1)
  const dragging = useSyncExternalStore(drag.subscribe, drag.get);
  // the ghost of a creation drag Escape cancelled, on its way back to its tile
  const returning = useSyncExternalStore(ghostReturn.subscribe, ghostReturn.get);
  // the element the keyboard's hand holds: its aim is drawn as a drag's drop (spec hand-keyboard-move, "Visual
  // feedback")
  const hand = useEditorState(heldHand);
  const aiming = useMemo(() => (hand === null ? null : handDrop(hand)), [hand]);
  const dropping: DropView | null = dragging ?? aiming;
  // the primary selected node, read as the store holds it (a node object is replaced only when it changes)
  const node = useEditorState((s) => (s.selection[0] === undefined ? null : (locate(s.document, s.selection[0])?.node ?? null)));
  const hovered = useSyncExternalStore(hover.subscribe, hover.get);
  const drawnBand = useSyncExternalStore(band.subscribe, band.get);
  // the text edited in place (text-edit.ts): its outline and label wear the text editing mode, so the edit never looks
  // like a plain selection (spec text-edit-inline, Problems in Pager 2; DESIGN.md "Canvas", text)
  const editing = useEditorState((s) => s.ui.textEdit.node !== null && s.selection.length === 1 && s.selection[0] === s.ui.textEdit.node);
  const t = useT();
  const layer = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>(EMPTY);

  useEffect(() => {
    let request = 0;
    // nothing selected, hovered or banded: nothing to measure, and the last layout is dropped
    if (selection.length === 0 && hovered === null && drawnBand === null) {
      request = requestAnimationFrame(() => setLayout(EMPTY));
      return () => cancelAnimationFrame(request);
    }
    let placedFor = '';
    let placed: Layout['label'] = null;
    const measure = () => {
      const iframe = canvasFrame();
      const origin = layer.current?.getBoundingClientRect();
      if (iframe && origin) {
        const local = (b: Box | null): Box | null => (b === null ? null : { x: b.x - origin.x, y: b.y - origin.y, width: b.width, height: b.height });
        const selected = targets.map((target) => local(nodeBox(iframe, target.id))).filter((b): b is Box => b !== null);
        const union = selection.length > 1 ? unionOf(selected) : null;
        // the label belongs to the one selected node, or to the union of several
        const first = union ?? selected[0];
        const size = label.current ? { width: label.current.offsetWidth, height: label.current.offsetHeight } : null;
        // the label is placed again only when its element or its size moved: reading the page's content is the slow part
        const key = JSON.stringify([first, size]);
        if (first === undefined || size === null) placed = null;
        else if (key !== placedFor) {
          const gap = parseFloat(getComputedStyle(layer.current as HTMLDivElement).getPropertyValue('--space-2')) || 0;
          const content = contentBoxes(iframe).map((b) => local(b) as Box);
          placed = placeLabel(first, size, gap, content, { x: 0, y: 0, width: origin.width, height: origin.height });
        }
        placedFor = key;
        const hoveredBox = hovered !== null && !selection.includes(hovered as (typeof selection)[number]) ? local(nodeBox(iframe, hovered)) : null;
        const next: Layout = { selected, union, hovered: hoveredBox, label: placed, band: local(drawnBand) };
        setLayout((before) => (same(before, next) ? before : next));
      }
      request = requestAnimationFrame(measure);
    };
    request = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(request);
  }, [selection, targets, hovered, node, drawnBand]);

  const at = (b: Box): CSSProperties => ({ left: b.x, top: b.y, width: b.width, height: b.height });
  const shown = selection.length === 0 && hovered === null && drawnBand === null ? EMPTY : layout;
  return (
    <div className="chrome" ref={layer} data-canvas-chrome>
      {shown.hovered ? <div className="chrome__hover" data-chrome="hover" style={at(shown.hovered)} /> : null}
      {drawnBand !== null && shown.band ? <div className="chrome__band" data-chrome="band" style={at(shown.band)} /> : null}
      {shown.selected.map((b, i) => (
        <div
          key={i}
          className={`chrome__selection${dropping && dropping.dragged.length > 0 ? ' is-source' : ''}${editing ? ' is-editing' : ''}${targets[i]?.hidden === true ? ' is-hidden-node' : ''}`}
          data-chrome="selection"
          style={at(b)}
        />
      ))}
      {dropping ? <DropIndicator view={dropping} /> : null}
      {dragging?.inserting != null ? <Ghost entry={dragging.inserting} at={dragging.at} refused={dragging.proposal === null || dragging.refusal !== null} /> : null}
      {returning !== null && dragging === null ? <ReturningGhost key={returning.id} view={returning} /> : null}
      {shown.union && selection.length > 1 ? <div className="chrome__union" data-chrome="union" style={at(shown.union)} /> : null}
      {selection.length > 1 ? (
        <div
          ref={label}
          className={`chrome__label${shown.label ? '' : ' is-measuring'}`}
          data-chrome="label"
          data-placement={shown.label?.placement}
          style={shown.label ? { left: shown.label.box.x, top: shown.label.box.y } : undefined}
        >
          <span className="chrome__name">{t('canvas.selectedCount', { count: selection.length })}</span>
        </div>
      ) : node !== null ? (
        <div
          ref={label}
          className={`chrome__label is-target${shown.label ? '' : ' is-measuring'}${dropping ? ' is-hidden' : ''}${editing ? ' is-editing' : ''}`}
          data-chrome="label"
          data-label-for={node.id}
          data-placement={shown.label?.placement}
          style={shown.label ? { left: shown.label.box.x, top: shown.label.box.y } : undefined}
        >
          {editing ? (
            <span className="chrome__name">{t('canvas.editingText', { name: node.name })}</span>
          ) : (
            <>
              <span className="chrome__name">{node.name}</span>
              <small className="chrome__tag">{node.tag ?? ''}</small>
              {targets[0]?.hidden === true ? <small className="chrome__flag">{t('canvas.hiddenFlag')}</small> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
