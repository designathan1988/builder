# absolute-nudge — Nudge positioned elements with the arrow keys

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900) and read from its source. Source references are `path:line` inside Pager. Test: an absolutely positioned Heading at `left: 124px; top: 120px`, selected, canvas focused.

## Trigger

- ArrowLeft/Right/Up/Down without Alt, with the canvas focused, when every selected element is absolutely or fixed positioned in the same parent and none is locked or hidden (`src/features/input/index.js:719-726`, `boxNudgeArmed` `src/features/resize/index.js:67-72`). Otherwise the arrows walk the tree (see `keyboard-tree-walk.md`).
- Shift multiplies the step.

## Hit zones and thresholds

- Step: **1 px**, Shift **10 px** (`BOX_NUDGE_PX`, `BOX_NUDGE_SHIFT_PX`, `src/platform/box-geometry.js:6-7`), in CSS px regardless of zoom.
- The box is clamped inside its containing block (`box-geometry.js:237-239`).
- Several selected positioned siblings move together (`resize/index.js:284-312`).

## Visual feedback

The element moves at once; the selection outline follows; status `Moved to 125, 120.` (observed, single element); for several elements the message is `Moved 2 elements by 1, 0.` (`canvas.positioning.nudgedMany`, `resize/index.js:310`).

## Result in the document

Observed from `left: 124px; top: 120px`:

| Key | left, top |
|---|---|
| ArrowRight | 125px, 120px |
| Shift+ArrowDown | 125px, 130px |
| ArrowLeft ×3 (quickly) | 122px, 130px |

Only `left`/`top` (or `right`/`bottom` when those are the set constraints) are rewritten, on the active layer (`resize/index.js:278-282`, `src/platform/measure.js:291-306`).

## Undo and redo

**Every key press is its own history entry:** after the three quick ArrowLeft presses, one Ctrl+Z went back to `left: 123px`, a second to `124px` (observed).

## Nested elements

Only the selected positioned elements; their children move with them.

## Zoom other than 100 %

The step is in CSS px; on screen it is step × zoom.

## Keyboard equivalent

This is the keyboard feature.

## Problems in Pager

1. **A burst of nudges is many undo steps.** Required: arrow presses in a quick burst on the same selection, with no other command in between, are one undo step (manifest feature `absolute-nudge`); the burst window is a named constant in the history owner.
