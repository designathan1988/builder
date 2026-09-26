# props-effects-basic — Opacity, visibility, blend mode, isolation, cursor, pointer events and selection

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Container.

## Trigger

- Inspector › Style › Effects (`src/features/inspector/catalogue.js:394-408`, `:438`):
  - **Opacity:** a number field, step 0.05, from 0 to 1 (`:394`).
  - **Blend** (`mix-blend-mode`, eight values, `:398`), **Cursor** (eleven values, `:405`), **Visibility** (`visible`, `hidden`, `collapse`), **Pointer events** (`auto`, `none`), **User select** (`auto`, `none`, `text`, `all`) as menus; **Isolation** (`auto`, `isolate`) under More.

## Hit zones and thresholds

Not applicable: every control is a field or a menu of the inspector.

## Visual feedback

The canvas draws the element again at once; the fields show the stored values.

## Result in the document

- Each control writes its property of the node's desktop base style: `opacity: 0.5`, `visibility: hidden`, `mix-blend-mode: multiply`, `isolation: isolate`, `cursor: pointer`, `pointer-events: none`, `user-select: none` (Pager writes `user-select` alone).
- The computed values in the iframe match.

## Undo and redo

Each change is one undo step.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not affected (the fields are in the Inspector).

## Keyboard equivalent

The fields and menus are keyboard-operable like every inspector field.

## Problems in Pager

1. **Opacity takes a number only:** `50%`, which CSS takes, is not read as 0.5. Required: opacity takes a number from 0 to 1 or a percentage from 0 to 100 %, written as its number (50 % is 0.5); anything else is refused with a message.
2. **The menus offer a fraction of the values:** eight of the sixteen blend modes, eleven cursors (`catalogue.js:398`, `:405`). Required: each offers every value of its generated list.
3. **User select is written without its prefix,** which Safari needs. Required: user-select is written through its recipe (`-webkit-user-select` and `user-select`, properties.json recipes).
