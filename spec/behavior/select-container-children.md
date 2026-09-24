# select-container-children — Select every element in the current container with Ctrl+A

How Pager behaves, read from its source and checked by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

- Pager has **no keyboard binding** for this: `Ctrl+A` is not in any keymap row or command chord (searched: no `Ctrl+A` in `src/`). Observed: with Paragraph 2 selected on the canvas, `Ctrl+A` changed nothing (selection unchanged, no text selected, no status message).
- The behaviour exists only as a command-bar entry, **Select every element in this container** (`canvas.selectContainerChildren`, `src/features/marquee/index.js:202-206`, with `k:""`). Observed: Ctrl+K, typing `select every`, Enter → the three Paragraphs selected, status `3 elements selected.`

## Hit zones and thresholds

`selectSiblingsOfSelection` (`marquee/index.js:187-196`): the board is the parent of the current selection when that parent is a container; the new selection is every child of it that is neither locked nor hidden. With nothing selected the command is not offered (`when: () => !!state.sel && …`, `:204`).

## Visual feedback

Union outline and chip `N elements`; status `N elements selected.` (`canvas.marquee.took`).

## Result in the document

Selection only; the document JSON never changes.

## Undo and redo

Not an undo step.

## Nested elements

Only the direct children of the selection's parent, never deeper.

## Zoom other than 100 %

Not affected.

## Keyboard equivalent

None in Pager.

## Problems in Pager

1. **No `Ctrl+A` binding.** Required: `Ctrl+A` on the canvas selects the selected element and all its siblings; with nothing selected it selects every child of the Page; while editing text it selects the text and does not change the element selection (features.json `select-container-children`).
2. **Locked and hidden siblings are silently skipped.** Required: they are skipped and the status says how many were left out (`3 elements selected, 1 locked left out.`).
3. **With nothing selected the command is not available at all.** Required: it selects every child of the Page.
