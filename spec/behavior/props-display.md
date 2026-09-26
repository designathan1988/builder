# props-display — Edit display with every keyword

How Pager behaves, read from its source (`reference/Pager`). Source references are `path:line` inside Pager.

## Trigger

- The inspector's Layout section: a **Display** choice (`catalogueProperty({id:"display",kind:"sel",…})`,
  `src/features/inspector/catalogue.js:307`), drawn as icon buttons (`src/features/inspector/properties.js:2307`) with
  the nine values block, inline, inline-block, flex, inline-flex, grid, inline-grid, contents and none.
- A click on a value writes it; the field shows the element's own display, else the display its tag takes
  (`dispOf`, `catalogue.js:137-144`, `:632`).

## Result in the document

The chosen keyword is written as the element's `display` at the active breakpoint and state. The canvas redraws the
element with it.

## Undo and redo

One undo step per choice.

## Nested elements

Only the selected element changes; `contents` makes its box disappear so its children lay out in its parent.

## Zoom other than 100 %

Not affected.

## Keyboard equivalent

None in Pager beyond Tab and a click.

## Problems in Pager

1. **Only nine values exist, and nothing else can be typed.** Required: in All properties the Display field offers
   every display keyword the browser data allows (the generated list) and a typed value is accepted only when the
   browser takes it; the nine values stay the Essentials menu (manifest feature `props-display`).
2. **A value the browser does not take is not refused with a word** (Pager cannot receive one). Required: text that is
   not a display value is refused with `status.value.invalid` naming Display and the text; the document keeps its value.
3. **Nothing says what changed.** Required: the status bar says `status.style.set` (property, element, value).
4. **A locked element's display can be changed.** Required: a locked element, or one inside one, refuses with
   `status.locked.edit` (spec lock-element).
