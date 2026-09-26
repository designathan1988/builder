# breakpoints-switch — Switch between Desktop, Laptop, Tablet and Phone breakpoints

Read from Pager's source (`reference/Pager`); references are `path:line` inside Pager.

## Trigger

- Pager: a segmented control of Desktop, Laptop, Tablet and Phone in the top bar (`src/features/workspace/dock.js:133`, `:607`) calls `setBreakpoint(name, width)` (`src/features/workspace/camera.js:262-276`): the page's width becomes the breakpoint's, the canvas re-centres, and the inspector reads and writes that breakpoint's layer from then on. The widths are the breakpoint table's (`src/model/style-layers.js`).

## Our rule

- The frame's tabs (`view.setBreakpoint`, one door per breakpoint of properties.json's `breakpoints`): the active one pressed, its tooltip naming its width.
- The page inside the frame takes the breakpoint's width in CSS px: Desktop 1440, Laptop 1180, Tablet 834, Phone 390; in Fit mode the canvas refits the zoom, at a manual zoom the zoom stays.
- The status bar shows the active breakpoint and its width.
- The active breakpoint is a workspace preference, restored after a reload. It changes nothing in the document and records nothing.
- The tabs, the frame's widths and the export's media queries read the one breakpoint table (properties.json `breakpoints`).

## Refusals

None.

## Problems in Pager

1. **The breakpoint is a global (`window.BP`)** kept apart from the store, and lost at a reload. Required: editor state, a preference restored after a reload.
2. **The widths are written in three places** (the buttons' `data-w`, the page style, the export). Required: one table.

## Undo and redo

Not affected: switching the breakpoint records nothing.
