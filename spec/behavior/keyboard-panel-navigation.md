# keyboard-panel-navigation — Move between panels and inside them with the keyboard

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900) and read from its source. Source references are `path:line` inside Pager.

## Trigger

- **Tab** moves between a few region stops. Pager removes almost every control inside the regions from the Tab order (`tabindex="-1"` on buttons, inputs, selects, links and scrollers, `sealRegions`, `src/features/input/index.js:378-428`) so that the page has only a handful of stops (`data-region` on menu, canvas tools, palette, canvas, inspector dock, workbench, status; `index.html:26`, `:103`, `:159`, `:188`, `:232`, `:248`, `:264`).
- **F6 does nothing** (no binding exists; observed: focus stayed on `BODY`).
- Inside the inspector dock region (the rail): ArrowRight/ArrowDown and ArrowLeft/ArrowUp move a drawn aim across panel tabs and splitters; Enter/Space shows the aimed panel and focuses its first control (`input/index.js:751-756`, `:507-569`).
- Tab strips (inspector tabs, workbench tabs, settings hub, panel windows) use roving tabindex with ArrowLeft/Right/Up/Down, Home, End, activating as they move (`src/features/workspace/camera.js:510-529`).
- Menus: see `app-menu.md`. The palette: arrows between tiles, Enter inserts, Escape returns to the region (`src/features/palette/index.js:276-300`).

## Hit zones and thresholds

Observed Tab order starting from the canvas: Inspector dock → `Close Elements` button → `Resize palette` divider → `Close Layers` button → an unnamed div → `Resize left dock` → Workbench → Status → `BODY` (the end of the page). The top bar menu and the canvas tools were not reached going forward from the canvas.

## Visual feedback

The rail aim is drawn as a 2 px outline on the aimed tab (`.kbaim`, `style/04-panels.css:87`); the status says `<name>, panel N of M. Enter shows it.` Regions show the browser focus ring when focused.

## Result in the document

None.

## Undo and redo

Not applicable.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not affected.

## Keyboard equivalent

This is the keyboard feature.

## Problems in Pager

1. **No F6 / Shift+F6.** Required: F6 and Shift+F6 cycle focus between top bar, left dock, canvas, inspector, workbench and status bar, and the focused region shows a visible focus ring (features.json `keyboard-panel-navigation`).
2. **Controls inside panels are removed from the Tab order,** so most buttons, inputs and trees cannot be reached by keyboard. Required: an automated sweep pressing F6 and Tab reaches every enabled button, input, tab and tree of every open panel.
3. **Escape inside a panel does not reliably return to the canvas** (only the palette handles Escape, and it goes to the palette region). Required: Escape inside a panel returns focus to the canvas with the selection intact.
4. **Unnamed focus stops** (a bare `DIV` in the Tab order). Required: every focusable element has an accessible name.
