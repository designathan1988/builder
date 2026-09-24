# selection-actions-bar — Action bar for the selection

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900) and read from its source. Source references are `path:line` inside Pager. Test document: Section > Container > [Heading, Paragraph], Container selected.

## Trigger

- The `⋯` (More actions) button in the quick panel opens a strip of icon buttons below it (`src/features/selection/selection.js:167-202`); clicking outside or `Escape` closes it (`:140-155`).
- Each button runs an action (`src/app/boot.js:233-239`, `runSelbarAction` `:262-346`); moveup, movedown, wraprow, wrapcol and promote call the same key rows as their shortcuts (`runKey`, `:279-283`).
- The **drag** button (first in the strip): press on it arms the same move drag as pressing the element (`boot.js:163-182`), so threshold, indicators and commit are those of `drag-reorder-canvas.md`.

## Hit zones and thresholds

The strip holds, in order: drag · move up · move down · wrap in a row · wrap in a column · promote · remove wrapper · take into the hand · duplicate · lock · hide · remove (`selection.js:121-137`), each about 28 px wide and icon-only. Tooltips: `drag (same engine as dragging the element)`, `move up within the parent`, `move down within the parent`, `wrap in a row`, `wrap in a column`, `promote out of the parent, one rung`, `remove this wrapper and lift its children`, `take into the hand for keyboard repositioning`, `duplicate — the copy lands immediately after it`, `lock/unlock`, `hide/show`, `remove (undoable)`; five of them get their chord appended in parentheses (`boot.js:241-260`).

- The drag button is disabled when the selection is locked or hidden (`selection.js:253`).
- The remove-wrapper button is **hidden** unless the selection is a single container with children (`:258-259`).
- Wrap, promote, unwrap, hand, lock and hide refuse multi-selections with `This action needs one selected element.` (`boot.js:275-277`).

## Visual feedback

| Stage | What is drawn | Image |
|---|---|---|
| More actions open on a Container | The icon strip under the quick panel; the lower row of the strip shows the quick panel's Margin, Padding and More… buttons drawn on top of each other. | ![strip](img/unwrap--01-more-actions.png) |

Actions report in the status bar as their shortcuts do (e.g. `Wrapped Paragraph in a row. Row selected.`).

## Result in the document

Each button produces the same document JSON as its keyboard door (same code path for the key-row actions). Duplicate, lock, hide and remove have their own handlers in `runSelbarAction`.

## Undo and redo

One history entry per action, as for the shortcuts.

## Nested elements

Acts on the selection.

## Zoom other than 100 %

Window chrome; unaffected.

## Keyboard equivalent

Each action's shortcut (Alt+ArrowUp/Down, R, C, P, M, Ctrl+D, Delete); lock, hide and unwrap have none.

## Problems in Pager

1. **The strip overlaps its own text** (Margin, Padding and More… drawn on top of each other). Required: no overlapping controls or clipped text.
2. **Only five tooltips name their shortcut;** duplicate, hand and the others do not. Required: every button's tooltip names its action and its shortcut (features.json `selection-actions-bar`).
3. **Unavailable actions are hidden (remove wrapper) or enabled and refused on click (wrap on a multi-selection).** Required: buttons for actions that cannot apply to the selection are shown disabled, with the reason in the tooltip.
4. **The strip's buttons are removed from the Tab order** (`tabindex="-1"` via `sealRegion`). Required: the strip is reachable by keyboard and each button shows a visible focus ring (features.json `keyboard-panel-navigation` sweeps every enabled button).
