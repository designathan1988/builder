# props-position — Position mode, offsets, z-index, float and clear

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Container.

## Trigger

- Inspector › Style › Position (`src/features/inspector/catalogue.js:410-417`):
  - **Position:** `static`, `relative`, `absolute`, `fixed`, `sticky` (a menu).
  - **Top, Right, Bottom, Left** (length fields) and **Z-index** (a number field), shown only for a positioned element (`when: positioned`).
  - **Float** (`none`, `left`, `right`) and **Clear** (`none`, `left`, `right`, `both`), shown for a box outside flex and grid.

## Hit zones and thresholds

Not applicable: every control is a field or a menu of the inspector.

## Visual feedback

The canvas lays the element out again at once; the fields show the stored values.

## Result in the document

- Each control writes its property of the node's desktop base style: `position: absolute`, `top: 10px`, `z-index: 5`, `float: left`, `clear: both`.
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

1. **Z-index is a number field of any number** (`kind: "num"`, `catalogue.js:415`): a decimal is stored and the browser drops it. Required: z-index takes a whole number or `auto`; anything else is refused with a message and nothing is written.
2. **The offsets and z-index disappear while the element is static** (`when: positioned`), so a person cannot prepare them before switching the mode. Required: they stay drawn; the mode is its own control, one button per mode, and its command (`position.setMode`) is the one writer of the mode.
