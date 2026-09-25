# export-zip — Export the page as a ZIP with its HTML and a separate stylesheet

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

- **Export** in the top bar (`#bE`, wired in `src/app/boot.js:751`).
- **File › Export page HTML** (`index.html:45`, `data-file-action="export"`), which runs the same export.
- No shortcut.

## Result

- Pager downloads **one HTML file**, `page.html` (`boot.js:751-759`: a `text/html` blob clicked through a temporary link, revoked 4 s later; the diagnostics readout says `Exported: page.html`).
- The text comes from `exportHTML` (`src/features/export/index.js:166-173`):
  - `<!DOCTYPE html>`, then `<html lang dir>` from `pageLangOf` and `pageDirOf`, which fall back to `en` and `ltr` when the project never set them (`src/model/tree.js:66-76`);
  - `<meta charset="UTF-8">`, `<meta name="viewport" content="width=device-width,initial-scale=1">`, and `<title>` = the page root's layer name, or "Page";
  - the whole stylesheet inside one `<style>` element: the editor's base rules (`EXPORT_CSS`, `src/model/css.js:78-80`) and the compiled rules of the page;
  - `<body class="canvas-export-host">` wrapping the page root, which is written with its own tag (a `div` by default) and the class `canvas-export-root`.
- Every node is written with its tag (`exportNode`, `export/index.js:101-162`) and a class list made of a generated class shared by every node with the same declarations (`compileClasses`), a key class, a paint class named after the element type, and the author's classes. Text is escaped (`htmlesc`); inline runs go through `inlineToHtml`; a link goes through `safeHref` (`#` when refused).
- A hidden node is written like any other; its generated class carries `display:none!important` (`src/model/css.js:9`).
- Image sources are written as they are; no file is packed with the page.

## Visual feedback

| Stage | What is drawn |
|---|---|
| After Export | The browser's download of `page.html`; the diagnostics readout (a developer panel) reads `Exported: page.html`. The status bar says nothing. |

## Undo and redo

Exporting changes nothing in the document and records nothing in the history.

## Keyboard equivalent

None beyond File › Export page HTML through the menu's keys and the command bar.

## Problems in Pager

1. **One HTML file with the CSS inside a `<style>` element**: the stylesheet cannot be cached, edited or shared on its own. Required: the export is one archive, `site.zip`, written by the one ZIP writer, holding the page's file at its path in the project (`index.html` for the home page) and the stylesheet `css/styles.css`. The HTML links the stylesheet with `<link rel="stylesheet" href="css/styles.css">` (a path relative to the page's folder). No `<style>` element and no `style` attribute anywhere.
2. **The page is wrapped in editor scaffolding** (`<body class="canvas-export-host">`, a root `div.canvas-export-root`, the editor's base rules copied into the page). Required: the page root is the `<body>` itself (the root's tag), carrying only its own classes, and nothing of the editor reaches the files: no `data-*` attribute of the renderer (`data-node`, `data-container`, `data-hidden`), no node id written as an `id`, no editor class, no editor rule, no product name.
3. **Generated classes** (`s-…` shared by equal declarations, key classes, paint classes) make the CSS unreadable and change when unrelated nodes change. Required: an element with styles of its own gets a class derived from its layer name (lower case, words joined by `-`: Hero → `hero`); its author classes are kept as they are; an element with no styles and no author class has no `class` attribute. `css/styles.css` holds one rule per styled element, in document order, one declaration per line indented by two spaces (`  padding-top: 56px;`), a breakpoint's values in an `@media (max-width: …)` block and a state's values under its pseudo-class. The full naming (BEM element classes, name collisions, the Element chip) belongs to export-bem-css.
4. **A hidden element leaks into the page**, hidden only by a generated class. Required: a hidden element is written with the `hidden` attribute, its subtree inside it, so the exported page hides it without any CSS, as the canvas does; no `display: none` rule is written for it.
5. **The head's values are invented**: a page never given a language is declared `lang="en" dir="ltr"`, and the title is the root layer's name ("Page"). Required: `<html>` carries `lang` and `dir` only when the page settings hold them (page-properties); without a title setting, `<title>` is the page's name (the page switcher's name, "Home"). The head holds, in this order: `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, `<title>…</title>`, the stylesheet link.
6. **Nothing tells the person the export happened** except a developer readout. Required: the status bar says the site was exported and under which file name (`status.export.done`).
7. **Text** must survive as text: `&`, `<` and `>` in a text are written as `&amp;`, `&lt;` and `&gt;`, `"` in an attribute value as `&quot;`, and a line break kept in a text (`\n`, text-edit-inline) is written as `<br>`.
8. **The exported page must look like the canvas.** Required: opened in Chrome, every element of the exported page has the same computed styles as on the canvas, apart from editor-only aids (the minimum height of an empty container, the selection chrome); a browser test opens the exported files and compares.
