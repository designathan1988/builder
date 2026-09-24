# align-distribute — Align and distribute positioned elements

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

**Pager has no align or distribute command.** Its i18n catalogue still holds the labels (`free.action.alignLeft`, `free.action.alignCenterX`, `free.action.distributeH`…, `src/core/i18n.js:2183-2190`), but no code uses them: no command, menu row, quick-panel control or key runs an alignment.

## Hit zones and thresholds

None in Pager.

## Visual feedback

None in Pager.

## Result in the document

None in Pager.

## Undo and redo

Not applicable in Pager.

## Nested elements

Not applicable in Pager.

## Zoom other than 100 %

Not applicable in Pager.

## Keyboard equivalent

None in Pager.

## Problems in Pager

1. **No alignment of positioned elements.** Required (manifest feature `align-distribute`):
   - With several absolutely positioned elements selected, Align left, Align centre and Align top (and the other edges) work on the selection's bounds; with one element selected, on its parent's box.
   - Distribute horizontally makes the gaps between the selected elements equal.
   - The commands are in the quick panel and the Arrange menu; top and left are written for each element as one undo step, and the measured positions in the iframe match.
