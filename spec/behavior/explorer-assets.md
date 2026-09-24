# explorer-assets — Upload and manage image and font files

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

1. **No file uploads.** Required (manifest feature `explorer-assets`):
   - The Explorer uploads images and font files with the file picker and accepts image files dropped onto a folder.
   - Uploaded files are ordinary files of the file tree, stored in IndexedDB, placed in the folder they were uploaded or dropped into (img/ by default for images, fonts/ for fonts), and listed with a thumbnail for images, their name and size.
2. **Rename and delete.** Required:
   - Renaming a file changes its listed name; names stay unique per folder.
   - Deleting an unused file removes it from the tree and from IndexedDB, as an undo step.
