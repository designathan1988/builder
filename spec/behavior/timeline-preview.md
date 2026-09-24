# timeline-preview — Preview animations by playing and scrubbing the timeline

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900) and read from its source. Source references are `path:line` inside Pager.

## Trigger

**Pager has no timeline, so it has no Play, Pause, Stop, Loop or playhead.** See `timeline-keyframes.md`:

- No timeline panel is registered (observed via Ctrl+K and the workbench tabs).
- Animation exists only as the free text property `animation-name` (`src/features/inspector/catalogue.js:467`).
- An element whose `animation-name` refers to `@keyframes` that exist in the page's CSS would simply run in the iframe with no preview controls.

## Hit zones and thresholds

None in Pager.

## Visual feedback

None in Pager.

## Result in the document

Not applicable.

## Undo and redo

Not applicable: previewing is not an edit.

## Nested elements

Not applicable in Pager.

## Zoom other than 100 %

Not applicable in Pager.

## Keyboard equivalent

None in Pager.

## Problems in Pager

1. **No preview controls.** Required (manifest feature `timeline-preview`):
   - `Play` animates the element on the canvas from the stored keyframes.
   - `Pause` freezes it at the current time.
   - `Stop` returns it to its base styles.
   - With `Loop` on, playing repeats.
2. **No scrubbing.** Required:
   - Dragging the playhead along the timeline shows the interpolated state at the playhead on the canvas.
   - At 50 % of a linear 0-to-1 opacity animation, the computed opacity in the iframe is 0.5.
3. Previewing (play, pause, stop, loop, scrub) never changes the document JSON and never adds an undo step.
