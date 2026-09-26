# props-more — Columns, breaks, scroll behaviour and snapping, containment and counters

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Container.

## Trigger

- Inspector › Style › Layout (`src/features/inspector/catalogue.js:320`) and More (`:439-440`, `:474-489`):
  - **Columns** (a number field, `kind: "num"`, `:320`);
  - **Column span**, **Column fill**, **Column rule width**, **Column rule style** (`none`, `solid`, `dashed`, `dotted`, `double`, `:480`), **Column rule colour**, shown for a multi-column box;
  - **Break before / after / inside**, shown inside a fragmented flow;
  - **Scroll behaviour** (`auto`, `smooth`), **Scroll snap type** (six fixed combinations, `:488`), **Scroll snap align**;
  - **Contain** (`none`, `layout`, `paint`, `size`, `style`, `content`, `strict`), **Content visibility**;
  - **Counter reset** and **Counter increment** (text fields, placeholders `section 0` and `section 1`).

## Hit zones and thresholds

Not applicable: every control is a field or a menu of the inspector.

## Visual feedback

The canvas draws the element again at once; the fields show the stored values.

## Result in the document

- Each control writes its property of the node's desktop base style: `columns: 3`, `column-rule-width: 2px`, `break-inside: avoid`, `scroll-behavior: smooth`, `contain: paint`, `counter-reset: section 0`.
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

1. **Columns is a number field** (`kind: "num"`, `:320`): only a count can be given, never a column width. Required: Columns takes a width, a count or both, in either order (`200px 3`), written as column-width and column-count; what is left out is auto.
2. **Column rule style offers five of the ten border styles** (`:480`). Required: every value of its generated list.
3. **A column rule width over a rule styled none draws nothing.** Required: writing the column rule width while its style is none also writes solid (the manifest's coupling `column-rule-width-shows-style`).
