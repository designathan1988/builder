# marquee-select — Select elements by dragging a marquee on the page

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900, zoom 100 %) and read from its source. Source references are `path:line` inside Pager. Test document: Section (padding 56 px 40 px) > [Heading, Paragraph, Paragraph 2]; the page is 640 px tall, so there is empty page area below the Section.

## Trigger

- Primary-button press on the **Page root** (empty page area) or on the stage/overlay outside the page, captured before any other handler (`src/features/marquee/index.js:63-78`, listener in capture phase `:211`). Not in preview, not while the pan tool or Space is armed, not on handles, chips or the selection bar.
- A press on any other element (including a Section's padding) is that element's gesture (select/drag), never a marquee (`marquee/index.js:72-75`). Observed: press on a Paragraph + 30 px move started a drag (`dragging`), no band.
- The band appears after **4 px** of movement in screen pixels (`:118-124`, `DRAG_THRESHOLD_PX`).
- Modifiers read at press time: Shift = add, Ctrl/Cmd = toggle, none = replace (`:58`).
- `Escape`, `pointercancel`, a lost capture or window blur cancel and restore the selection held at the press (`:156-169`).

## Hit zones and thresholds

- Candidates: every descendant of the Page that is not locked or hidden, measured once at the press (`:79-98`).
- Leaf elements are taken when the band **touches** them (any overlap); containers only when the band **contains** them entirely; a taken element whose ancestor is also taken is dropped (`:127-130`, `src/platform/box-geometry.js:179-203`).
- The selection is recomputed on every move from the same starting selection (`box-geometry.js:216-228`), so it follows the band live.

## Visual feedback

| Stage | What is drawn | Image |
|---|---|---|
| Dragging from empty page area up over the two Paragraphs | A band with a 1 px accent border and a 16 % accent fill (`style/06-canvas-chrome.css:481`); the touched elements are already selected (union outline, chip `2 elements`). | ![dragging](img/marquee-select--01-dragging.png) |
| Released | The band disappears; status `2 elements selected.` (`canvas.marquee.took`). | ![released](img/marquee-select--02-released.png) |

## Result in the document

Selection only. Observed:

| Gesture | Selection | Status |
|---|---|---|
| band from (600,400) to the Paragraph's middle | Paragraph, Paragraph 2 | `2 elements selected.` |
| Shift + band over Paragraph 2 | Paragraph, Paragraph 2 (already in) | `2 elements selected.` |
| Ctrl + band touching Heading, Paragraph, Paragraph 2 | Heading (the two paragraphs toggled out) | `1 element selected.` |
| band covering all three but not the whole Section | Heading, Paragraph, Paragraph 2 (Section not contained) | `3 elements selected.` |
| band + Escape | the selection before the press | `Cancelled — nothing changed.` |
| press and release without moving | the Page root | — |

## Undo and redo

Not undo steps.

## Nested elements

Only presses on the Page start a marquee, so there is no marquee inside a container. Leaves inside containers are reachable by touching them.

## Zoom other than 100 %

The 4 px threshold is in screen px (`marquee/index.js:119-120`); element boxes are measured on the zoomed canvas.

## Keyboard equivalent

`Ctrl+A` is covered by `select-container-children.md` (not bound in Pager).

## Problems in Pager

1. **A marquee cannot start inside a container,** e.g. in a tall Section's empty padding. Required: a press on the empty area of any container (not on a child) starts a marquee limited to that container's descendants when the pointer moves 4 px; without movement it selects the container. Elements that contain the start point are never taken (manifest feature `marquee-select`).
2. **A press without movement on the stage outside the page selects the Page root** (the marquee path). Required: it clears the selection (see `select-click.md`).
