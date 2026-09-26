# canvas-outlines-zones — Show element outlines and drop zones on the canvas

How Pager behaves, read from its source (`reference/Pager`) and its shell. Source references are `path:line` inside Pager.

## Trigger

- Two toggle buttons in the canvas tools: **guides** (`#tggBtn`, `index.html:105`) and **Zones** (`#tgzBtn`), each flipping a hidden checkbox (`#tgg`, `#tgz`) and drawing its `aria-pressed` state (`src/app/boot.js:109-118`).
- Guides adds the class `guides` to the editor's body and to the canvas page's body, projects the page again and repaints the selection (`boot.js:123-129`).
- Zones calls `setZones` (`boot.js:120-121`, `src/platform/overlay.js:332-336`), which draws the drop zones of the selected node (`zonesPreview`, `overlay.js:337-349`; `drawZones`, `:351-380`).

## Hit zones and thresholds

- Guides: every node gets a 1 px dashed outline, inset by 1 px (`style/06-canvas-chrome.css:16`, `.guide-outline`); an empty container is marked (`style/04-panels.css:37`).
- Zones: for the selected node only, the bands a drop would use: before and after (the edge band) and, for a container, inside (`overlay.js:363-378`), each labelled ("before", "inside", "after"). With nothing selected, or the page selected, nothing is drawn and the status explains it (`zones.atRest`, `zones.pageItself`, `src/core/i18n.js:73-74`).

## Visual feedback

Dashed outlines on every element (guides); tinted labelled bands around the selection (Zones). Neither draws in the exported page.

## Result in the document

None. The two switches are not stored: after a reload both are off.

## Undo and redo

Not undo steps.

## Nested elements

Guides outline every level. Zones show the selected node's bands only.

## Zoom other than 100 %

The outlines and bands follow the page's geometry at the zoom.

## Keyboard equivalent

None.

## Problems in Pager

1. **Guides re-project the whole page** (`render()` in `boot.js:126`), and the outline class is written into the canvas page's own body. Required: the outlines are drawn by the canvas chrome over the page, never written into the page, so they cannot reach the export (manifest feature `canvas-outlines-zones`).
2. **Zones show only the selection's drop bands.** Required: Zones show the padding of every container and the empty drop area of every empty container, so the places a drop can land are visible at rest.
3. **The switches are not stored.** Required: both choices are preferences, restored after a reload.
4. **The toggle's name ("guides") is the name of another feature** (manual guides). Required: the switch is named Outlines.
