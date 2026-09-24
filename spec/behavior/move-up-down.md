# move-up-down — Move the selection up or down among its siblings with Alt+ArrowUp and Alt+ArrowDown

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900) and read from its source. Source references are `path:line` inside Pager. Test document: Section > [Heading, Paragraph, Paragraph 2].

## Trigger

- `Alt+ArrowUp` / `Alt+ArrowDown` with the canvas focused and something selected (`src/features/input/index.js:714-718`, handler `moveSelectionBy`, `:629-658`).
- On a focused Layers row the same keys select that row and run the same command (`src/features/layers/layers-panel.js:410-417`).
- Other doors: selection bar "move up/down within the parent", Arrange menu Move up/Move down, context menu Move up/Move down. The context menu items use a separate handler that moves by exactly one index (`layers-panel.js:515-528`).

## Hit zones and thresholds

- Each press swaps every selected node with its previous (or next) sibling that is not selected; the relative order of selected nodes is kept (`input/index.js:642-649`).
- All selected nodes must share one parent, else the command is refused with "Move the selected elements into one parent before reordering them together." (`:638-641`).
- Locked or hidden selections are refused (`:631-637`).
- Absolute or fixed positioned selections: `Alt+Arrow` still reorders (the nudge rows require no Alt, `:719-726`).

## Visual feedback

No indicator: the element moves on the canvas and in Layers at once, stays selected, and the status bar reads `Moved 1 selected elements within Section.` At the ends: `Already at the start of Section.` / `Already at the end of Section.`

## Result in the document

Observed from [Heading, Paragraph, Paragraph 2] with Paragraph 2 selected:

| Key | Children of Section | Status |
|---|---|---|
| Alt+ArrowUp | Heading, Paragraph 2, Paragraph | Moved 1 selected elements within Section. |
| Alt+ArrowUp | Paragraph 2, Heading, Paragraph | Moved 1 … |
| Alt+ArrowUp | unchanged | Already at the start of Section. |
| Alt+ArrowDown | Heading, Paragraph 2, Paragraph | Moved 1 … |
| Alt+ArrowDown ×2 | Heading, Paragraph, Paragraph 2 (second press: unchanged) | Already at the end of Section. |

The write is one `nwReorder` of the parent's child list inside a transaction (`input/index.js:654`).

## Undo and redo

Each press that moves is one history entry; a press at the edge adds none.

## Nested elements

Only siblings are swapped; the command never leaves the parent (see `promote-out.md` and `nest-into-previous.md`).

## Zoom other than 100 %

Not affected.

## Keyboard equivalent

The keys are the primary door.

## Problems in Pager

1. **The status text is not pluralised** (`Moved 1 selected elements`). Required: `Moved <name> to position N of M in <parent>.` for one element and `Moved N elements within <parent>.` for several, through i18n plural rules.
2. **Two implementations exist:** the keyboard path reorders the whole selection (`input/index.js:629-658`), the context-menu path moves only the primary node by one index (`layers-panel.js:515-528`), with different messages and different lock checks, and the menu path says nothing at the edges. Required: one command, used by the keys, the menus, the selection bar and Layers.
