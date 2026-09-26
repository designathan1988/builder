# props-grid-container — Grid container: tracks, areas, auto flow and item alignment

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Container with `display: grid` holding three cards.

## Trigger

- Inspector › Style › Layout, for a grid container (`src/features/inspector/catalogue.js:313-319`):
  - **Columns:** the track editor (`ppTracks`, `properties.js:2048-2100`; `editor: "tracks"`, `:2319`): one row per track with its size and unit (`fr`, `px`, `%`, `em`, `rem`), a track written as an expression shown as text, and **Add a track** (`:2059-2061`), which adds `1fr`.
  - **Rows:** a text field (placeholder `auto auto`).
  - **Auto flow:** `row`, `column`, `dense`, `row dense`, `column dense`; **Justify items:** `stretch`, `start`, `end`, `center`.
  - **Areas** (More): a text field (placeholder `"head head" "side main"`, `:441`).

## Hit zones and thresholds

Not applicable: every control is a field, a button or a menu of the inspector.

## Visual feedback

The canvas lays the grid out again at once; the track editor's strip shows the rendered size of each column.

## Result in the document

- Columns writes `grid-template-columns` (the tracks joined, `none` for none, `:2067`); Rows `grid-template-rows`; the menus their properties; Areas `grid-template-areas`.
- Add a track appends `1fr` to the columns.
- The children are laid out in the iframe on the tracks written.

## Undo and redo

Each change is one undo step.

## Nested elements

Not applicable: the controls act on the selected container only.

## Zoom other than 100 %

Not affected (the controls are in the Inspector).

## Keyboard equivalent

The fields, the button and the menus are keyboard-operable like every inspector control.

## Problems in Pager

1. **The track editor's names are English text written in the code** (`"Line names"`, `"Track expression"`, `"Track size"`, `properties.js:2081-2082`), so they are never translated. Required: every name of the grid controls comes from the catalogue.
2. **Areas are stored as typed:** rows of different lengths (`"a b" "c"`) are stored and the browser drops them silently. Required: areas the browser does not take are refused with a message and nothing is written; so are tracks.
3. **Add a track has no door of its own that says what it writes.** Required: Add column is a door of style.set that stands for the tracks it writes (the columns the element has, then 1fr; the first track of a grid with none).
