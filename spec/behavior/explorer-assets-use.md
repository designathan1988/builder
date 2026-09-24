# explorer-assets-use — Use assets in Image elements and drop images onto the canvas

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900) and read from its source. Source references are `path:line` inside Pager. Test page: Section > [Heading, Paragraph].

## Trigger

- **Image Source:** a plain text field for a URL (observed: one text input, no asset picker).
- **Dropping an image file on the canvas does nothing.** Observed by dispatching `dragenter`, `dragover` and `drop` with a `DataTransfer` holding `photo.png` (`image/png`) at a point between the Heading and the Paragraph:
  - on the shell (the target was the `IFRAME#paperFrame`) and inside the iframe (target `P`);
  - no handler called `preventDefault`;
  - the document was unchanged and no status message appeared.
- The only `drop` handler in Pager belongs to the in-place text editor and takes `text/plain` only (`src/app/boot.js:666-672`). Because `dragover` is never prevented, the page does not accept file drops at all; the browser's default handling applies.
- There are no assets to rename or delete (see `explorer-assets.md`).

## Hit zones and thresholds

None for file drops in Pager.

## Visual feedback

None in Pager: no indicator, no insertion line, no message.

## Result in the document

Unchanged.

## Undo and redo

Not applicable in Pager.

## Nested elements

Not applicable in Pager.

## Zoom other than 100 %

Not applicable in Pager.

## Keyboard equivalent

None in Pager.

## Problems in Pager

1. **An Image cannot use an uploaded asset.** Required: the Image's Source field has an asset picker. Choosing an asset stores a reference to the asset in the document JSON and the canvas renders it (features.json `explorer-assets-use`).
2. **Image files dropped on the canvas are ignored.** Required:
   - While an image file is dragged over the canvas, the same drop indicator as a palette drag is shown (receiver tint, insertion line, label; see `palette-drag-insert.md`) at the same drop positions.
   - On drop, the file is uploaded as an asset and an Image that uses it is inserted at the indicated position, as one undo step.
3. **Renaming and deleting assets in use.** Required:
   - Renaming an asset keeps every Image that uses it working.
   - Deleting an asset in use asks for confirmation and lists where it is used.
