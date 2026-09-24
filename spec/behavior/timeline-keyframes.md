# timeline-keyframes — Add, edit, move and delete keyframes on the timeline

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900) and read from its source. Source references are `path:line` inside Pager.

## Trigger

**Pager has no timeline and no keyframe editor.**

- The workspace mentions a timeline: the bench description "read-out, code, history, timeline" (`src/features/workspace/shell.js:57`), a `timeline` icon (`src/features/workspace/camera.js:349`), and a comment about "Timeline track rows" (`src/features/workspace/dock.js:44`).
- No timeline panel is registered (observed: Ctrl+K `open` lists no Timeline; the workbench tabs are `Engine read-out` and `Keyboard shortcuts`).
- Animation exists only as CSS text: `animation-name` is a free text property with the placeholder `fade-in` (`src/features/inspector/catalogue.js:467`). Pager has no `@keyframes` model; the keyframes have to exist somewhere else.

## Hit zones and thresholds

None in Pager.

## Visual feedback

None in Pager.

## Result in the document

Pager stores only the property value (e.g. `animationName: "fade-in"`) on the node.

## Undo and redo

Not applicable in Pager.

## Nested elements

Not applicable in Pager.

## Zoom other than 100 %

Not applicable in Pager: the timeline is outside the canvas.

## Keyboard equivalent

None in Pager.

## Problems in Pager

1. **No keyframes.** Required (manifest feature `timeline-keyframes`):
   - An animation's keyframes are drawn as diamonds on its track, at their percentage along the track.
   - `Add keyframe` adds one at the playhead.
   - Dragging a diamond along the track changes its offset (the offset follows the pointer as a percentage of the track width, clamped to 0–100 %). The whole drag is one undo step.
   - Each keyframe has its own easing. Deleting a keyframe is one undo step.
2. **The Inspector cannot edit keyframe values.** Required:
   - While the playhead sits on a keyframe, the Inspector edits that keyframe's values (e.g. opacity, Move Y) and not the base styles, and a badge in the Inspector says so.
   - Keyframe offsets, values and per-keyframe easing are stored in the document JSON.
