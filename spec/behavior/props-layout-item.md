# props-layout-item — Flex and grid item controls

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Paragraph inside a flex Container, and one inside a grid.

## Trigger

- Inspector › Style › Layout, group Item (`src/features/inspector/catalogue.js:322-329`), for a child of a flex or grid container:
  - **Grow**, **Shrink** (number fields) and **Basis** (a length field), for a flex item;
  - **Align self** (`auto`, `stretch`, `flex-start`, `flex-end`, `center`, `baseline`), for a flex or grid item; **Justify self** (`auto`, `stretch`, `start`, `end`, `center`), for a grid item;
  - **Order** (a number field);
  - **Grid column** and **Grid row** (text fields, placeholders `2` and `1`), for a grid item.

## Hit zones and thresholds

Not applicable: every control is a field or a menu of the inspector.

## Visual feedback

The canvas lays the item out again at once; the fields show the stored values.

## Result in the document

- Each control writes its property of the node's desktop base style: `flex-grow: 1`, `flex-basis: 50%`, `align-self: center`, `order: 2`, `grid-column: 1 / 3`.
- The computed values in the iframe match.

## Undo and redo

Each change is one undo step.

## Nested elements

Not applicable: the controls act on the selected item only.

## Zoom other than 100 %

Not affected (the fields are in the Inspector).

## Keyboard equivalent

The fields and menus are keyboard-operable like every inspector field.

## Problems in Pager

1. **Order is a number field of any number** (`kind: "num"`, `catalogue.js:327`): a decimal is stored and dropped by the browser. Required: order takes a whole number; anything else is refused with a message.
2. **Grow and Shrink take negative numbers** (a plain number field), which the browser drops. Required: they take a number that is not negative; anything else is refused with a message.
3. **Align self offers six values** (`catalogue.js:325`), leaving out `start`, `end`, `self-start`, `self-end` and `anchor-center`, which every browser takes. Required: it offers every value of the property's generated list.
