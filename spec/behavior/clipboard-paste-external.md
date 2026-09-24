# clipboard-paste-external — Paste HTML and text copied from outside the app

How Pager behaves, read from its source (the canvas paste path) and observed by running it from `.cache/pager-run` (the in-text paste path; Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

- `Ctrl+V` on the canvas pastes only the editor's in-memory copy (`src/features/input/index.js:677-678`, `src/features/layers/layers-panel.js:665-680`). With nothing copied inside the editor it does nothing; content copied from outside the app is ignored. There is no `paste` event handler for the canvas.
- Inside an element being edited in place, a paste inserts the clipboard's `text/plain` only (`src/app/boot.js:661-665`); observed: pasting `text/html` `<b>RICH</b> <i>x</i>` inserted `RICH x` as plain text (see `text-inline-formatting.md`).
- Pager has no HTML importer (the File menu comment says "Importing HTML is not a current capability", `index.html:40-43`).

## Hit zones and thresholds

Not applicable.

## Visual feedback

None.

## Result in the document

External HTML or text pasted with an element selected: nothing changes.

## Undo and redo

Not applicable.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not applicable.

## Keyboard equivalent

Not applicable.

## Problems in Pager

1. **External clipboard content cannot be pasted as elements.** Required: `text/html` from the system clipboard goes through the HTML importer (same cleaning and nesting rules) and is inserted into the selection as one undo step; multi-line `text/plain` becomes one Paragraph per line; anything the importer drops is reported in the status bar (manifest feature `clipboard-paste-external`).
2. **One paste door per source.** Required: `Ctrl+V` reads the system clipboard once and chooses in this order: the app's own element format, then `text/html`, then `text/plain`; external content uses the same placement rule as internal paste (selected container → appended as last children; otherwise inserted right after the selection).
