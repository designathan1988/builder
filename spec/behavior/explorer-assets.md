# explorer-assets — Upload and manage image assets

How Pager behaves, observed by running it from `.cache/pager-run` (Chrome, window 1600×900) and read from its source. Source references are `path:line` inside Pager.

## Trigger

**Pager has no Explorer and no asset store.**

- The workspace menu reserves slots for `assets` and `explorer` (`src/features/workspace/camera.js:666`), and i18n has Assets strings (e.g. `panel.assets.empty.files`, `src/core/i18n.js:2544`).
- No such panel is registered (observed: Ctrl+K `open` lists no Assets or Explorer panel).
- An Image's `Source` is a plain text field for a URL, with no file picker and no asset button (observed on an Image: one text input, no buttons).
- Dropping a file on Pager is not handled. The only `drop` handler is the in-place text editor's, and it accepts `text/plain` only (`src/app/boot.js:666-672`).

## Hit zones and thresholds

None in Pager.

## Visual feedback

None in Pager.

## Result in the document

Nothing is stored in Pager.

## Undo and redo

Not applicable in Pager.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not applicable: the Explorer is outside the canvas.

## Keyboard equivalent

None in Pager.

## Problems in Pager

1. **No asset management.** Required (features.json `explorer-assets`):
   - The Explorer's Assets folder uploads images with the file picker and also accepts image files dropped onto the Explorer.
   - Uploaded images are stored in IndexedDB and listed with thumbnail, name and size.
2. **Rename and delete.** Required:
   - Renaming an asset changes its listed name, and names stay unique.
   - Deleting an unused asset removes it from the list and from IndexedDB, as an undo step.
