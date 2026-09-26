# drag-layout — Dragging builds the layout: what a professional page builder's drag and drop does

This spec gathers what the drag and drop of a professional page builder offers so that a layout is built by dragging,
quickly and without detours, and names the feature of the manifest that owns each behaviour. The single drag
behaviours stay in their own specs (drag-reorder-canvas, drag-drop-inside, drag-level-keys-escape, palette-drag-insert,
layers-drag, wrap-row-column); this one is the whole picture and the requirements the separate specs lacked.

## What the reference builders do

- **Webflow Designer**: while dragging, one colour marks the parent the element goes into and another the position
  inside it (an insertion line); holding Alt (Option) while dragging drops a duplicate and leaves the original; the
  Navigator (Layers) takes the same drags for precise nesting. Sources: Webflow Help Center, "Navigator" and "The Add
  panel"; Webflow shortcut references.
- **Elementor (Flexbox containers)**: a container has a drag handle on its toolbar; an empty container shows a "+"
  drop zone; a row container lays its children side by side, and dropping beside a child adds a column.
- **Framer**: layers are wrapped in a Stack with one shortcut (Shift+A); a wrapper is removed keeping its children;
  a modifier drag moves a layer through others.
- **Pager** (reference/Pager, documented in wrap-row-column): a drop in the side band of an element that fills its
  parent's width offers "create a row" with the element and the dragged one side by side.

## Behaviours (requirements)

| # | Behaviour | Feature |
|---|---|---|
| 1 | A press on an element and a move past drag.threshold drags the selection's roots; below it the press is a click. | drag-reorder-canvas |
| 2 | One proposal per pointer position: before/after a leaf by its halves, before/after/inside a container by its bands, the slot nearest the pointer inside it; a new proposal only after the pointer moved drag.hysteresis (12 screen pixels) from where the drawn one was taken, so a tremor never changes it. | drag-reorder-canvas, drag-drop-inside |
| 3 | The indicator names both things: the receiving parent (its outline and soft fill) and the position (the insertion line along the parent's flow: horizontal in a vertical flow, vertical in a row), with a label next to the line: "Drop in Hero · position 2 of 3". | drag-reorder-canvas |
| 4 | A ghost chip with the dragged element's icon and name follows the pointer at drag.ghostOffset, for an element drag as for a tile's creation drag; the source keeps its place with a dashed outline and its selection handles hidden. | drag-reorder-canvas (Problems 1), palette-drag-insert |
| 5 | **Positioning first; a side drop builds a row or a column** (the user's corrections, 2026-09-25: no surgical pointing, and a drag positions first). Over any element the drop positions it (rows 2 and 3). Only in a narrow strip at the left or right edge (top or bottom in a row flex) of the element right under the pointer, min(wrap.sideBandMax 40, wrap.sideBandFraction 0.12 × its extent) screen pixels, clear of its other edges by min(wrap.sideEdgeExclusion, a quarter of it), does the drop put the dragged element beside it in a new Row (vertical flow) or Column (row flow). Never over an ancestor's edge (the element under the pointer decides), never for a band of the page (an element right in the page root), never for a child of a grid or a wrapping flex; the element must be at least wrap.sideTargetMin across and fill wrap.sideFill of its parent. The strip confirms at once (wrap.sideDwell 0); the indicator then shows the side drop instead of a position: a line along the element's side edge, the element outlined in the drop colour, the label "Create a row: Paragraph beside Card", and under the ghost a pill with the wrapper's glyph. The side drop drawn holds while the pointer stays by that side of its element within drag.hysteresis (a tremor never moves it), and yields to a deeper element's own strip. The release wraps (element.wrapBeside), one undo step, the new wrapper selected. The same for a palette tile's creation drag. | drag-side-wrap |
| 6 | In a row (a flex row parent) a drop beside a child is an ordinary before/after along x: it adds a column to the row; no wrapper. | drag-reorder-canvas |
| 7 | An empty container is a drop target at least drop.emptyAimMin tall on the canvas (not exported), drawn with a dashed placeholder while a drag is over it. | drag-drop-inside, empty-container |
| 8 | Near an edge of the stage (drop.autoscrollZone) the canvas scrolls by up to drop.autoscrollMaxStep per frame, faster nearer the edge, once the pointer has been inside the stage; the proposal follows the scrolled page. | drag-autoscroll |
| 9 | A proposal whose line lies outside the visible stage (drop.outsideStageTolerance) is refused and drawn refused. | drag-autoscroll |
| 10 | The dropped elements flash for drop.flashDuration and stay selected; the status bar says where they went. | drag-reorder-canvas |
| 11 | Arrow keys change the drop level, Escape cancels, a refused target is drawn refused with its reason. | drag-level-keys-escape, nesting-grammar |
| 12 | Alt held at the release drops a duplicate and leaves the original (Webflow), in one undo step. Not built yet: it needs a gesture modifier for the element drag and its command. | drag-duplicate |
| 13 | The same drops in Layers (rows' zones), with the row dwell expanding a collapsed row. | layers-drag |

## Problems in Pager

1. The side drop wraps on release even before its hint appears (wrap-row-column, Problems 2), and its bands take the
   edges of whole sections. Required: row 5 (a narrow strip of the element under the pointer only), and an indicator
   that shows which drop will happen.
2. The element drag has no ghost; only the dashed source outline says what moves. Required: row 4.
3. Autoscroll starts as soon as a drag begins near an edge, so a drag that starts at the stage's edge scrolls at once.
   Required: row 8's "once the pointer has been inside the stage".
