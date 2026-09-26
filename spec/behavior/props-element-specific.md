# props-element-specific — List, table, form and media properties, only where they apply

Read from Pager's source (`reference/Pager`, run from `.cache/pager-run`); references are `path:line` inside Pager.

## Trigger

- Pager's inspector catalogue declares a row per property with a `when` test on the selected node (`src/features/inspector/catalogue.js:419-434`, `:492`):
  - table: `borderCollapse`, `borderSpacing`, `tableLayout` and `emptyCells` on a table; `captionSide` on a table or a caption;
  - list: `listStyleType`, `listStylePosition` and `listStyleImage` on a list, an ordered list or a list item (`LIST_ANY`, `catalogue.js:158`);
  - media: `objectFit` and `objectPosition` on the media types (`MEDIA_ANY`, `catalogue.js:157`: image, video, canvas, iframe, svg and picture);
  - form: `resize` on a textarea; `accentColor` and `appearance` on the form types (`FORM_ANY`, `src/model/elements.js:143`); `caretColor` on an input or a textarea.
- A row whose test fails is not drawn. Each row is edited like any other field of the inspector, and the value goes to the node's style.

## Result in the document

- The value is written to the selected element's style at the current breakpoint and state (`style.set`), one undo step, and the page draws it.
- The initial values the inspector shows are Pager's defaults (`catalogue.js:586-588`), for example separate, auto, top, show, disc, outside, none, fill, 50% 50%.

## Our rule

- Each of these properties names its kind in `properties.json` (`appliesTo`): `table`, `tableOrCaption`, `list`, `media`, `textarea`, `formControl` or `textInput`. One owner, `src/core/style/applies.ts`, says whether a kind holds for an element, from the tag the element is written with (a switched tag counts):
  - table: `table`;
  - tableOrCaption: `table`, `caption`;
  - list: `ul`, `ol`, `menu`, `li`;
  - media: the replaced elements the object properties act on, `img`, `video`, `canvas`, `iframe`;
  - textarea: `textarea`;
  - formControl: `input`, `textarea`, `select`, `button`, `progress`, `meter`;
  - textInput: `input`, `textarea`.
- The inspector draws a field of one of these kinds only while every selected element is of that kind. With nothing selected it draws none of them, and Add a property does not offer them for an element they do not apply to.
- `border-spacing` takes one length for both axes or two (horizontal, then vertical). A bare number takes px. No percentage: CSS refuses one here.
- `list-style-type` offers the menu's counter styles (the property's `menu` subset) and takes any other counter-style name, or a quoted string, typed.
- `list-style-image` takes an image address (written `url("…")`), a gradient, or none.
- `object-position` takes keywords and lengths or percentages, one or two.

## Problems in Pager

1. **The media rows show on elements they do nothing for.** Pager's `MEDIA_ANY` includes `svg` and `picture`; `object-fit` and `object-position` have no effect on either (a picture is not a replaced element; the image inside it is). Required: the media fields show only on `img`, `video`, `canvas` and `iframe`.
2. **The form rows show on options.** Pager's `FORM_ANY` includes `option` and `optgroup`, where Chrome ignores `accent-color` and `appearance`. Required: the form fields show only on `input`, `textarea`, `select`, `button`, `progress` and `meter`.
3. **`object-position` only offers five keywords** (`catalogue.js:430`). Required: a position of keywords, lengths or percentages, one or two values, like the background position.
4. **`border-spacing` takes one length** (`catalogue.js:420`). Required: one or two lengths; anything else is refused, naming the value.
5. **`list-style-image` is free text** (`catalogue.js:427`, placeholder `url(...)`): anything typed is written. Required: an address, a gradient or none, else refused; the address is checked like every other image address (no script source).
6. **`list-style-type` can only take the menu's nine values.** Required: the menu offers them, and any other counter style or a string can be typed.
7. **The kind is read from Pager's own node type, not from the tag**, so a list whose tag was switched keeps or loses its rows by its old type. Required: the kind is read from the tag the element is written with.

## Refusals

- A value the property does not take is refused, the document is unchanged, and the status bar names the value (`status.style.invalidValue`).

## Undo and redo

Each value set is one undo step; undo restores the value the element held before.
