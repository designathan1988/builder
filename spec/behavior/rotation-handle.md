# rotation-handle — Rotate an element with a handle on the canvas

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

**Pager has no rotation handle.** Rotation exists only as text properties in the inspector: `transform` (placeholder `rotate(2deg)`) and `rotate` (placeholder `6deg`) (`src/features/inspector/catalogue.js:399`, `:402`). The canvas selection shows resize handles only; no canvas code handles rotation (no rotation in `src/features/resize`, `src/features/spacing`, `src/features/selection` or `src/platform/overlay.js`).

## Hit zones and thresholds

None in Pager.

## Visual feedback

None in Pager.

## Result in the document

Pager writes rotation only through the inspector's text fields.

## Undo and redo

Not applicable in Pager.

## Nested elements

Not applicable in Pager.

## Zoom other than 100 %

Not applicable in Pager.

## Keyboard equivalent

None in Pager.

## Problems in Pager

1. **No rotation on the canvas.** Required (manifest feature `rotation-handle`):
   - A rotation handle sits outside the selection outline at a fixed screen distance; over it the cursor shows rotation.
   - Dragging it rotates the element around its transform-origin and the angle follows the pointer; Shift snaps to 15° steps; the status bar shows the live angle.
   - The handle and the inspector's Rotate field run the same command and write the `rotate` property, never the `transform` list (manifest property layer: translate, rotate and scale are their own properties); a whole drag is one undo step.
   - The angle does not depend on the zoom; the outline and handles follow the rotated box.
