# props-flex-container — Flex container controls: direction, wrap, alignment matrix and gap

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Container with `display: flex` holding three Paragraphs.

## Trigger

- Inspector › Style › Layout, for a flex container (`src/features/inspector/properties.js:2308`, `:2523`):
  - **Direction:** a segmented control of four arrows, `row`, `row-reverse`, `column`, `column-reverse` (`flexDirection`, editor `segmented`).
  - **Wrap:** `nowrap`, `wrap`, `wrap-reverse`.
  - **Align:** the alignment pad (`ppAlignPad`, `properties.js:1988-2044`): a 3 × 3 grid of cells, and beside it **Stretch** and **Spread**.
  - **Justify content**, **Align items**, **Align content** as menus; **Gap**, **Row gap**, **Column gap** as length fields.
- A click on a cell sets where the children sit, as the cell is drawn: the top-left cell puts them at the top left, whatever the direction.

## Hit zones and thresholds

| Part | Mapping |
|---|---|
| Cell (row r, column c) | Horizontal main axis (`row`): justify-content from the column, align-items from the row; vertical main axis (`column`): justify-content from the row, align-items from the column (`valuesAt`, `properties.js:1997-2000`). |
| Reversed direction | The main axis values are mirrored: in `row-reverse`, the left column writes `flex-end` (`mainReverse`, `:1995`). |
| `wrap-reverse` | The cross axis values are mirrored (`crossReverse`, `:1996`). |
| Values written | `flex-start`, `center`, `flex-end` (`PP_MAIN`, `:1987`). |

## Visual feedback

| Stage | What is drawn |
|---|---|
| Alignment set | The cell standing for the justify-content and align-items the element holds is pressed; none while Stretch or Spread holds (`paint`, `:2033-2043`). |
| Stretch / Spread | Their button is pressed while align-items is `stretch` / justify-content is `space-between`. |
| Every change | The canvas lays the children out again at once. |

## Result in the document

- Direction writes `flex-direction`; Wrap `flex-wrap`; each menu its property; Gap writes the gap (both axes), Row gap and Column gap one each.
- A cell writes `justify-content` and `align-items` of the node together, one undo step (`ppWriteMany`, `:3318`).
- Stretch writes `align-items: stretch`; Spread writes `justify-content: space-between`.
- The gap is the distance the iframe measures between two neighbouring children.

## Undo and redo

Each change is one undo step; a cell's two properties are undone together.

## Nested elements

Not applicable: the controls act on the selected container only.

## Zoom other than 100 %

Not affected (the controls are in the Inspector).

## Keyboard equivalent

The cells, Stretch and Spread are buttons: Tab reaches them and Enter or Space presses them. The menus and length fields are keyboard-operable like every inspector field.

## Problems in Pager

1. **Stretch and Spread write both properties:** a click on Stretch also writes the pad's justify-content (`onChange({ justify, align })`, `properties.js:2027`, `:2029`), so an element that held no justify-content gets `flex-start` it was never given. Required: Stretch writes only `align-items`, Spread only `justify-content`.
2. **The cells' names are English text written in the code** (`["Top", "Center", "Bottom"][r] + " " + ["left", "center", "right"][c]`, `:2019`), so they are never translated. Required: each cell is named from the catalogue, in the editor's language.

Pager draws the flex controls only for a flex box (`when: isFlexBox`, `catalogue.js:308-316`). In this editor the fields stay drawn, and the cells, whose command is available on a flex or grid container only (the manifest's availability `flexOrGridContainer`), are disabled elsewhere, their title giving the reason (`status.layout.notFlex`), and a click on them writes nothing.
