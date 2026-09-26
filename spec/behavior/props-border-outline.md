# props-border-outline — Borders per side, radius per corner and outline

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Container.

## Trigger

- Inspector › Style › Border: the border editor (`ppBorder`, `src/features/inspector/properties.js:1673-1760`, used at `:3371-3395`):
  - a box whose four **edges** and four **corners** are buttons choosing what the fields below edit (`:1686-1703`), and a **chain** linking the sides and the corners (`:1704-1716`);
  - **Width** (a number field in px, `:1722-1731`) and **Radius** (`:1734-1742`), for the chosen edge or corner, or all of them while linked;
  - **Style** (a menu of the border styles, `:1749-1753`) and **Colour**, for all sides.
- Border › Outline: **Outline** and **Outline offset** as text and length fields.

## Hit zones and thresholds

Not applicable: every control is a button or a field of the inspector.

## Visual feedback

| Stage | What is drawn |
|---|---|
| An edge or corner chosen | It is marked in the box; the fields show its values. |
| A value typed | The canvas draws the border, the radius or the outline at once. |

## Result in the document

- The editor writes the shorthands `border-width` (four values, `:3389`), `border-style`, `border-color` and `border-radius` (four values) of the node; only the ones that changed (`ppWriteMany(changed…)`, `:3392`).
- Outline writes `outline`; Outline offset writes `outline-offset`.
- The computed borders, radii and outline in the iframe match.

## Undo and redo

Each field change is one undo step.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not affected (the fields are in the Inspector).

## Keyboard equivalent

The edges, corners and chain are buttons; the fields and the menu are keyboard-operable like every inspector field.

## Problems in Pager

1. **Style and colour are one value for all sides** (`border-style`, `border-color`, `:3390`): an edge cannot have its own style or colour. Required: a side's width, style and colour can be set alone (its longhands only), and all sides at once (the longhands of every side, one command, one undo step).
2. **A width on an element without a border style draws nothing:** the style stays `none` (`style: read("borderStyle") || "none"`, `:3383`; a width change writes the width only, `:3392`). Required: writing a side's width while its style is `none` also writes `solid` for that side (the manifest's couplings `border-*-width-shows-style`), unless the same write names a style.
3. **The shorthands are stored:** the node holds `border-width: 1px 2px 1px 2px` and `border-radius: …` rather than the values of each side and corner, so a side's value cannot be read or changed alone. Required: every border value is stored as its longhands (`border-top-width` …, `border-top-left-radius` …), and each is written by one command per property (`style.setBorder`, `style.setRadius`) that every door of it uses.
