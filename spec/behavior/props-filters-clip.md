# props-filters-clip — Filters, backdrop filter, clip path and mask image

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Container.

## Trigger

- Inspector › Style › Effects: **Filter**, a text field (placeholder `blur(2px)`, `src/features/inspector/catalogue.js:397`).
- More: **Backdrop filter** (placeholder `blur(8px)`), **Clip path** (`inset(0 round 8px)`), **Mask image** (`linear-gradient(#000,transparent)`), text fields (`catalogue.js:457-459`).

## Hit zones and thresholds

Not applicable: every control is a field of the inspector.

## Visual feedback

The canvas draws the element again at once; the fields show the stored text.

## Result in the document

- Each field stores the typed text as its property: `filter: blur(2px)`, `backdrop-filter: blur(8px)`, `clip-path: inset(0 round 8px)`, `mask-image: …`.
- The computed values in the iframe match.

## Undo and redo

Each change is one undo step.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not affected (the fields are in the Inspector).

## Keyboard equivalent

The fields are keyboard-operable like every inspector field.

## Problems in Pager

1. **The filters are one text field:** changing the blur means retyping every filter, and a typo (`blur(2)`) is stored and dropped by the browser. Required: one field per filter function (Blur, Brightness, Contrast, Saturation, Hue rotation, Grayscale, Invert, Sepia), each setting its function in the filter value (in its place, the others kept) through one command, `style.setFilter`; Remove filters takes them all away; a value the browser does not take is refused with a message and nothing is written.
2. **The mask image takes any text,** a script address included. Required: Mask image takes an image address as the background image does (bare or inside url(), a web address or a path inside the project); another scheme is refused naming the address.
3. **Backdrop filter and clip path store text the browser drops.** Required: a value the browser does not take is refused with a message.
