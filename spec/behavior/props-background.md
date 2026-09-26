# props-background — Background colour, image, size, position, repeat and more

How Pager behaves, read from its source (source references are `path:line` inside Pager) and checked in `.cache/pager-run`. Test element: a Section.

## Trigger

- Inspector › Style › Paint, group Background (`src/features/inspector/catalogue.js:374-380`, `properties.js:2378-2386`):
  - **Colour** (`backgroundColor`, the colour field; its picker is the feature color-picker).
  - **Image** (`backgroundImage`, a plain text field with the placeholder `url(...)`, `catalogue.js:376`).
  - **Size** (`auto`, `cover`, `contain`, `100% 100%`), **Position** (the nine anchor points `center`, `top`, `bottom`, `left`, `right`, `top left`, `top right`, `bottom left`, `bottom right`), **Repeat** (`repeat`, `no-repeat`, `repeat-x`, `repeat-y`, `space`, `round`), **Attachment** (`scroll`, `fixed`, `local`) — menus shown only while the element paints an image (`paintsImage`, `catalogue.js:167-169`: the stored `background-image` or `background` holds `url(`, a gradient, `image-set(` …).
- Paint › More: **Origin** (`padding-box`, `border-box`, `content-box`), **Clip** (`border-box`, `padding-box`, `content-box`, `text`), **Blend** (eight blend modes) (`catalogue.js:453-455`).
- Each field writes one property of the selected elements with the inspector's setter; the Paint section's collapsed summary shows the background colour, or `None` when it is transparent.

## Hit zones and thresholds

Not applicable: every control is a field or a menu of the inspector.

## Visual feedback

| Stage | What is drawn |
|---|---|
| A value chosen or typed | The canvas repaints the section with the new background at once; the field shows the stored value. |
| Text the browser does not take (e.g. a bare `https://…/photo.jpg` in Image) | Nothing on the canvas and **no message**; the field keeps the typed text (`properties.js` setter: the declaration is dropped by the browser). |

## Result in the document

- Each field writes its own property of the node's desktop base style: `background-size: cover`, `background-position: center`, `background-repeat: no-repeat`, `background-attachment: fixed`, `background-origin: content-box`, `background-clip: padding-box`, `background-blend-mode: multiply`.
- Image stores the typed text as it is: `url(https://example.com/a.png)` works; `https://example.com/a.png` is stored and ignored by the browser; `url(javascript:alert(1))` is stored.
- The computed background of the section in the iframe matches the stored values.

## Undo and redo

Each field change is one undo step; Ctrl+Z restores the previous value.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not affected (the fields are in the Inspector).

## Keyboard equivalent

The fields and menus are keyboard-operable like every inspector field: Enter keeps a typed value, Escape puts the stored one back.

## Problems in Pager

1. **A bare URL typed in Image is stored and silently ignored** (the browser drops `background-image: https://…`). Required: a URL typed without `url()` (absolute http/https, or relative) is written as `url("…")`; text that is no image (neither `none`, a `url()`, nor a URL) is refused with a message and nothing is written.
2. **Any URL scheme is accepted in Image,** `url(javascript:alert(1))` included. Required: Image takes the addresses every resource of the page takes (an image's src): a web address (http, https) or a path inside the project; any other scheme (javascript:, data:, file:) is refused with a message naming the address (`status.url.unsafe`).
3. **The image and the gradient share the `background` shorthand in Pager's other field,** which resets the background colour (see gradient-editor, Problem 1). Required: Image writes `background-image` only; the background colour is kept.
4. **Position is a fixed menu of nine anchor points; typed offsets are stored as text** with no check of which axis each word belongs to. Required: Position is written as its two longhands, `background-position-x` and `background-position-y`: one keyword names its own axis and centres the other (`top` → x `center`, y `top`), two words may come in either order (`top left` → x `left`, y `top`), a length or a percentage is taken as x first; text that is no position is refused.
