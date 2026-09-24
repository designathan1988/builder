# clipboard-cut-system — Cut, and copy elements as HTML for other applications

How Pager behaves, read from its source and checked by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

- `Ctrl+C` / `Ctrl+V` exist (see `clipboard-copy-paste.md`) but use an **in-memory** variable, not the system clipboard (`src/features/layers/layers-panel.js:658-680`). No `navigator.clipboard` or `copy`/`paste` event handling exists for elements (the only clipboard writes in Pager are the export fallback, `src/app/boot.js:768-775`).
- **`Ctrl+X` is not bound** (no key row, no command). Observed: with the Heading selected and the canvas focused, `Ctrl+X` changed nothing (outline identical, status unchanged).

## Hit zones and thresholds

Not applicable.

## Visual feedback

None for Ctrl+X.

## Result in the document

Ctrl+X: none. Copy/paste across tabs: impossible (the clipboard variable is per page instance).

## Undo and redo

Not applicable.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not applicable.

## Keyboard equivalent

Not applicable.

## Problems in Pager

1. **No Cut.** Required: `Ctrl+X` copies and deletes the selection as one undo step (manifest feature `clipboard-cut-system`); Cut appears in the context menu and the Edit menu.
2. **No system clipboard.** Required: the app's element format on the system clipboard is covered by `clipboard-copy-paste.md`. This entry adds that Copy also writes `text/html` of the element's exported markup with its CSS rules, next to the app format, and that `text/html` has no editor attributes, ids or inline styles (manifest feature `clipboard-cut-system`).
