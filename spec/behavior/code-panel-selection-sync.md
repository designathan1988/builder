# code-panel-selection-sync — Code panel follows the selection

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900) and read from its source. Source references are `path:line` inside Pager.

## Trigger

**Pager has no Code panel.**

- Its workspace names one: the bench is described as "read-out, code, history, timeline" (`src/features/workspace/shell.js:57`), and the Panels menu has a slot for `code` (`src/features/workspace/camera.js:665`).
- But no such panel is registered. The only registered panels are `layers`, `palette`, `readout`, `inspector` and `provenance` (`registerPanel` calls in `src/features/workspace/dock.js:692-694` and `src/features/inspector/properties.js:3536-3539`), plus the Guides & Grids, Properties and Keyboard shortcuts panels.
- Observed: Ctrl+K `open` lists Layers, Elements, Engine read-out, Guides & Grids, Properties, Inspector and Keyboard shortcuts. The workbench tabs are `Engine read-out` and `Keyboard shortcuts`.
- The generated HTML/CSS can only be seen through Export (see `app-menu.md`), not next to the canvas.

## Hit zones and thresholds

None in Pager.

## Visual feedback

None in Pager: there is no view of the markup to highlight.

## Result in the document

Not applicable: selection sync changes the selection only, never the document.

## Undo and redo

Selection changes are not undo steps.

## Nested elements

Not applicable in Pager.

## Zoom other than 100 %

Not applicable in Pager.

## Keyboard equivalent

None in Pager.

## Problems in Pager

1. **No Code panel, so nothing follows the selection.** Required (features.json `code-panel-selection-sync`):
   - Selecting an element on the canvas or in Layers highlights its markup lines in the HTML tab and its rules in the CSS tab, and scrolls them into view.
   - Clicking a line inside an element's markup in the HTML tab selects that element on the canvas and in Layers, through the same selection command as a canvas click. For nested markup, the innermost element whose markup contains the clicked line is selected.
