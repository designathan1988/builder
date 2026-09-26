# workspace-settings-dialog — Guides & Grids settings dialog

Read from Pager's source (`reference/Pager`, run from `.cache/pager-run`); references are `path:line` inside Pager.

## Trigger

- Pager draws a Guides & Grids panel of rows in six sections (`src/features/precision/index.js:363-368`): Visibility, Manual guides, Column grid, Row grid, Dot grid and Smart behaviour.
  - Visibility has switches for rulers, manual guides and smart guides (`:238-246`, rows `:372-384`). They are flags in a preference, `pe-guides-v2` (`:76-89`).
  - Manual guides lists each guide with its axis, place and a remove action, and has a row to add one (`:261-356`).
  - The grids: a switch per grid and one field per number. Columns: count, width, gutter, margin. Rows: height, gutter. Dots: step (`:248-259`, `:396-417`). They are stored in the page (`gdpGrid`, `:95-105`) and clamped to bounds (`gdpNum`, `:91-94`): columns 1–96, width 0–20000, gutter 0–400, margin 0–2000, row height 1–4000, row gutter 0–400, dot step 2–400.

## Our rule

- **View › Guides & Grids** (`workspace.openDialog`, dialog `guides-grids`) opens a modal dialog. Opening it changes nothing in the document and records nothing.
  - It closes with Escape (`ui.dismiss`, the dialog key context) or its close button (`ui.dismiss`, the `dialog` region). The focus then goes back to where it was.
- The dialog shows its sections, each titled with an info tooltip (its hint):
  - **Visibility:** the rulers (`view.toggleRulers`) and the manual guides (`guides.toggleVisible`). These are preferences, restored after a reload, not recorded in the history. Smart guides and equal spacing (`view.toggleSmartGuides`, `view.toggleEqualSpacing`) belong to smart-guides and are not available until it is built.
  - **Manual guides:** each guide of the page with its place and its remove button (`guides.delete`). Then Add a guide, one button per axis (`guides.create`), which opens a field where the place is typed; Enter adds the guide.
  - **Column grid, Row grid, Dot grid:** each grid's switch (`grid.toggleColumns`, `grid.toggleRows`, `grid.toggleDots`). Then one field per setting, which keeps its number with `grid.setSettings` (grid, setting, value) on Enter.
    - Column grid: count, width, gutter, margin.
    - Row grid: height, gutter.
    - Dot grid: spacing.
    Grids and guides are page data (the page root's `grid` and `guides`): undoable, saved with the document, never exported.
- Every change applies to the canvas at once: the rulers hide, the guides hide, the grids take their new sizes.
- The grids' sizes are the page's `grid` settings, else the defaults of interactions.json (grid.columns, grid.width, grid.gutter, grid.margin, grid.rowHeight, grid.rowGutter, grid.dotSpacing).

## Refusals

- A value outside its bounds is refused naming the setting and its bounds (`status.grid.outOfRange`), and nothing changes. The bounds: count 1–96, width 0–20000, gutter 0–400, margin 0–2000, row height 1–4000, row gutter 0–400, dot spacing 2–400.

## Problems in Pager

1. **A value out of bounds is silently clamped** (`gdpNum`, `:91-94`), so the grid shows something other than what was typed. Required: it is refused, naming the setting and its bounds.
2. **The panel is a floating panel that stays open.** Required: a modal dialog that Escape and its close button close, with the focus back where it was.
3. **Smart guides and snap are one flag** (`gdpSetSmart`, `:117-123`). Required: separate settings (smart-guides, snap-toggle-settings).

## Undo and redo

- A grid's switch, a grid setting, and adding or removing a guide are one undo step each.
- The visibility switches are preferences and record nothing.
