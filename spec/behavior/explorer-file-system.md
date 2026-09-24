# explorer-file-system — File explorer with a virtual file system

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

**Pager has no file explorer and no file tree.** Its i18n catalogue holds the texts of a "Files" panel (`panel.explorer.title`, `panel.explorer.action.newFolder`, `panel.explorer.action.openFolder`, `panel.explorer.prompt.move`, `src/core/i18n.js:216-228`) and the workspace menu reserves a slot for `explorer` (`src/features/workspace/camera.js:666`), but no such panel is registered (observed: Ctrl+K `open` offers no Explorer). Pager's project is one document; the only files it writes are the export and the project JSON.

## Hit zones and thresholds

None in Pager.

## Visual feedback

None in Pager.

## Result in the document

None in Pager.

## Undo and redo

Not applicable in Pager.

## Nested elements

Not applicable in Pager.

## Zoom other than 100 %

Not applicable: the Explorer is outside the canvas.

## Keyboard equivalent

None in Pager.

## Problems in Pager

1. **No file tree.** Required (manifest feature `explorer-file-system`):
   - The Explorer shows the project's file tree (pages, CSS, JS, images, fonts) with folders: one .html per page, css/styles.css, js/interactions.js when the project has interactions, and every file the project holds.
   - Files and folders can be created, renamed, moved and deleted. Moving works by drag and drop and by a Move to… command. Names are unique per folder.
2. **Generated files and pages.** Required:
   - css/styles.css and js/interactions.js are generated from the document and keep fixed paths: they cannot be renamed, moved or deleted, neither can a folder that holds one of them, and creating or moving another file to either path is refused, even before js/interactions.js exists.
   - Pages can be moved into folders; a page file is deleted by deleting its page, and a folder that holds a page file cannot be deleted; renaming a page file renames its page and moving it moves the page; a page stores its file name, so a renamed or imported file keeps its exact name (Contact Us.html stays Contact Us.html) while a new page still gets a file name derived from its name (about-us.html); page names are unique within each folder, and pages in different folders may share a name (about/index.html and blog/index.html); the home page's index.html cannot be renamed or moved out of the root.
3. **Safety and history.** Required:
   - Deleting a folder that holds files asks for confirmation.
   - Every operation is one undo step.
4. **Integration.** Required:
   - Clicking a page file or css/styles.css opens it in the Code panel; the tree updates when pages or files change.
   - The tree is stored with the project in IndexedDB and restored after reload.
   - File > Save project and Open project include every file of the tree.
   - The product is new, so there is no earlier saved format to open. The saved format carries a schema version from the first save (project.json in the archive and the IndexedDB record alike), and every future migration is tested on the real loading path: Open project, and the autosaved project and its saved versions when the app loads them.
