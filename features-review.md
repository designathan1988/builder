# features.json review

This file reviews all 161 entries of `features.json` before any building starts. It does not change `features.json`; the final decision on every row belongs to the user. Sources: each entry's steps and expected results, and the "Problems in Pager" section of every spec in `spec/behavior/`.

Verdicts:

- **keep**: build as written.
- **change**: build after the entry is edited as the reason says.
- **merge into `<id>`**: the entry's requirements move into that entry.
- **remove**: do not build.
- **user decision**: the user chooses.

No entry is marked remove because it is hard to build.

## Counts

| Verdict | Entries |
|---|---|
| keep | 114 |
| change | 41 |
| merge | 2 |
| remove | 1 |
| user decision | 3 |
| **total** | **161** |

## Rules applied

- **Internal parts of composite elements are not palette items.** These are: table caption, head, body, footer, row and cells; list items, terms and descriptions; options and option groups; media sources and tracks; summary; figure caption; fieldset legend; SVG shapes. They are created by the parent's own controls, by the natural-child command or by content templates.
- **Deprecated or obsolete HTML:** none found. Every element type in the list is current HTML, and inline marks use `strong`, `em` and `a`.
- **Mobile, touch and other browsers:** the editor runs in Chrome desktop only. Flagged: `touch-action` in `props-more`, and the breakpoint entries (user decision). The viewport meta in `export-zip` stays, because exported pages are standard HTML for any browser (CLAUDE.md).
- **Export:** a ZIP that preserves the file tree, with a separate CSS file and BEM classes. Checked every export, import and project-file entry against this rule.
- **Clipboard:** the system clipboard. Checked every clipboard entry.
- **UI language:** i18n with pt-BR as default and en available. No entry switches the UI language, so one is proposed (`ui-language`). Many entries quote English UI strings (status texts, labels). Their tests must set the UI language explicitly or read texts through their i18n keys, since a fresh profile shows pt-BR.
- **Canvas and inspector parity:** every visual property must be editable both on the canvas and in the inspector through the same command.
  - The canvas door is either a direct handle (resize, spacing bands, radius/border/gap handles, shadow handles, absolute drag) or a control of the floating quick panel over the selection.
  - Properties that have only the inspector are flagged: text colour, gradient fill, border colour and style, outline, opacity and blend, filters and clip path, rotation, move and scale, text shadow, and SVG fill and stroke.
  - No visual property is canvas-only.
  - Where both doors exist (margin, padding, size, position, radius, border width, gap, box shadow, background colour, font size), the evaluator must check that they call the same command.

## Review

| id | title | verdict | reason |
|---|---|---|---|
| `editor-shell` | Editor layout: top bar, left dock, canvas, inspector and status bar | keep | The five-region layout every later entry builds on. |
| `canvas-page-iframe` | The page renders from the document JSON inside a zoomed iframe | keep | Core rendering model required by CLAUDE.md (document JSON rendered in a zoomed iframe). |
| `palette-click-insert` | Insert Section, Container, Heading and Paragraph by clicking the Elements panel | keep | Basic insertion; its spec already requires refusal instead of silent wrappers. |
| `select-click` | Select an element by clicking it on the canvas | keep | Basic selection. |
| `layers-tree` | Layers panel shows the document tree and selects in sync with the canvas | keep | Basic navigator, in sync with the canvas. |
| `undo-redo` | Undo and redo every document change | keep | Every command must be undoable. |
| `delete-element` | Delete the selected element with Delete or Backspace | keep | Basic structural command. |
| `drag-reorder-canvas` | Drag an element before or after a sibling on the canvas | keep | Core drag and drop; the spec holds the exact thresholds. |
| `drag-drop-inside` | Drop an element inside a container and move it across parents | keep | Core nesting by drag. |
| `drag-level-keys-escape` | Change the drop level with arrow keys and cancel a drag with Escape | keep | Precise drop level in deep trees; Escape to cancel is standard. |
| `palette-drag-insert` | Drag an element type from the Elements panel to a position on the canvas | keep | Core insertion by drag. |
| `layers-drag` | Reorder and nest by dragging rows in the Layers panel | keep | Standard in every navigator; same result as a canvas drop. |
| `move-up-down` | Move the selection up or down among its siblings with Alt+ArrowUp and Alt+ArrowDown | keep | Keyboard reordering. |
| `wrap-row-column` | Wrap the selection in a Row or a Column with R and C | keep | Wrapping is a user requirement that earlier attempts lost. |
| `context-menu` | Right-click context menu on the canvas and in Layers | change | Absorbs `selection-actions-bar`: the quick panel's More actions opens this same menu, which then also offers Lock, Hide and Take into the hand. |
| `unwrap` | Remove a wrapper and lift its children into its place | keep | Structural command the user asked for. |
| `nest-into-previous` | Nest the selection into its previous sibling | keep | Nesting by command (user requirement). |
| `promote-out` | Move the selection out of its parent with P | keep | Structural command the user asked for. |
| `duplicate` | Duplicate the selection with Ctrl+D | keep | Basic structural command. |
| `clipboard-copy-paste` | Copy and paste elements inside the editor with Ctrl+C and Ctrl+V | change | Pager uses an in-memory clipboard; the user's rule is the system clipboard, so copy and paste read and write it (app JSON format) from this first entry. |
| `keyboard-tree-walk` | Walk the tree with the arrow keys | keep | Keyboard selection. |
| `hand-keyboard-move` | Take the selection into the hand with M and place it with the keyboard | keep | Keyboard alternative to dragging (accessibility). |
| `text-edit-inline` | Edit text in place with double-click or Enter | keep | Basic text editing. |
| `text-inline-formatting` | Bold, italic and links inside text with Ctrl+B, Ctrl+I and Ctrl+K | change | Pasting rich text should keep the supported marks (strong, em, safe links) instead of plain text only; "Ctrl+U does nothing" turns a Pager gap into a requirement and should go. |
| `rename-element` | Rename an element with F2 or inline in Layers | change | The F2 modal "Name for this node" is a Pager quirk; F2 should rename inline in the Layers row, the same edit as the double-click. |
| `multi-select-click` | Select several elements with Shift+click and Ctrl+click | keep | Standard multi-selection. |
| `marquee-select` | Select elements by dragging a marquee on the page | keep | Standard multi-selection. |
| `multi-select-actions` | Delete, move and duplicate several selected elements at once | change | Wrapping several siblings together (one Container, order kept) is expected by professionals; the entry refuses wrap for a multi-selection as Pager does. |
| `select-container-children` | Select every element in the current container with Ctrl+A | keep | Standard Ctrl+A. |
| `lock-element` | Lock an element so it cannot be moved, edited or deleted | keep | Standard. |
| `hide-element` | Hide and show an element | keep | Standard; exported with the hidden attribute. |
| `app-menu` | Application menu: File, Edit, Arrange, View, Help and Theme | change | Drop "Why is it laid out like this?" and "Layout read-out" (see `layout-explanation`); File gains Open folder when the file explorer exists. |
| `autosave-restore` | Autosave to IndexedDB and restore the work after a reload | keep | Work must never be lost. |
| `unsaved-work-guard` | Never lose an edit that is not yet saved | keep | Work must never be lost. |
| `autosave-crash-recovery` | Keep saved versions and restore the work after a crash | keep | Work must never be lost. |
| `autosave-corruption-recovery` | Recover from a corrupted saved project | keep | Work must never be lost. |
| `multi-tab-guard` | Only one tab edits the project at a time | keep | Prevents two tabs overwriting each other. |
| `project-save-json` | Save the project as a JSON file | change | A single project.json cannot hold the file tree's images, fonts and JS files; the saved project must contain the document and every file of the virtual file system (for example one project archive). |
| `project-open-json` | Open a project JSON file | change | Same reason as `project-save-json`: opening restores the document and the whole file tree. |
| `new-blank-page` | Start over with a new blank page | keep | Standard. |
| `inspector-panel` | Inspector shows the selection's identity and collapsible property sections | keep | Base of every property entry. |
| `inspector-number-fields` | Numeric property fields, built with the Size section's Width and Height: typing, units, steppers and scrubbing | keep | Base numeric field (typing, units, scrubbing). |
| `props-display` | Edit display with every keyword | keep | Layout property; not in the canvas-parity list. |
| `props-flex-container` | Flex container controls: direction, wrap, alignment matrix and gap | keep | Flex editing; gap also has canvas bands (`radius-border-gap-handles`). |
| `props-grid-container` | Grid container controls: column and row tracks, gap and auto flow | keep | Grid editing. |
| `props-layout-item` | Child-of-flex and child-of-grid controls (In parent) | keep | Flex and grid child properties. |
| `props-spacing` | Margin and padding with the box model editor | keep | Canvas door exists (`spacing-handles`); both must run the same command. |
| `props-size-overflow` | Size, min/max, box sizing, aspect ratio and overflow | keep | Canvas door exists for width and height (`resize-handles`, quick panel W and H). |
| `props-position` | Position mode, offsets, z-index, float and clear | keep | Canvas door exists for positioned elements (`absolute-free-drag`, `absolute-nudge`). |
| `color-picker` | Colour picker: area, sliders, HSB/RGB/Hex fields, preview, Apply and Cancel | keep | One picker component for every colour field. |
| `color-picker-oklch` | Colour picker: OKLCH and OKLab formats and CSS colour text | keep | Modern CSS colour formats. |
| `color-swatches-eyedropper` | Saved and recent colours and the eyedropper | keep | The EyeDropper API exists in Chrome desktop. |
| `props-typography` | Text properties: font, size, weight, style, spacing, alignment, colour and decoration | change | Text colour has no canvas door (the quick panel's Fill is the background); add a text colour control on the canvas that runs the same command. The font menu must also list project fonts (proposed `custom-fonts`). |
| `props-typography-advanced` | Advanced text properties | keep | Complete text catalogue. |
| `props-background` | Background colour, image, size, position, repeat and more | keep | Background colour has its canvas door in the quick panel's Fill. |
| `gradient-editor` | Gradient editor: linear, radial and conic gradients with stops | change | The gradient fill is inspector-only; the quick panel's Fill must open the same fill editor (solid or gradient) and run the same command. |
| `props-border-outline` | Borders per side, radius per corner and outline | change | Only border width and radius have canvas handles; border colour and style and the outline need a canvas door (a Border control in the quick panel) that runs the same commands. |
| `props-effects-basic` | Opacity, visibility, cursor, pointer events, selection and blend mode | change | Opacity and blend mode are inspector-only; add a canvas door (an Opacity control in the quick panel) that runs the same command. |
| `shadow-editor` | Box shadow and text shadow editor | keep | Box shadow has canvas handles; text-shadow parity is flagged on `shadow-handles`. |
| `props-filters-clip` | Filters, backdrop filter, clip path and mask | change | Filters and clip path are inspector-only; add canvas doors (an Effects control in the quick panel) that run the same commands. |
| `props-transforms` | Move, rotate, scale, skew, origin and 3D transform properties | change | Rotation, Move X/Y and scale are inspector-only; rotation needs the canvas handle (proposed `rotation-handle`) and move/scale a canvas door, all on the one transform command. |
| `props-transition` | Transition and will-change | keep | Standard. |
| `props-more` | Remaining advanced properties | change | Drop touch-action (touch devices only). content acts only on ::before/::after, which the editor cannot target, so it has no effect here. Keep the rest. |
| `props-attributes` | ID, classes, title and custom declarations of an element | keep | Custom attributes and ARIA are proposed separately (`element-attributes-aria`). |
| `inspector-provenance-reset` | Mark set values and reset one property or all of them | keep | Standard. |
| `inspector-property-search` | Search the inspector for a property | keep | Standard. |
| `inspector-advanced-mode` | Switch the inspector between all properties and essentials only | keep | Useful for a large catalogue. |
| `inspector-add-property` | Add a property that is not shown yet | keep | Pairs with essentials mode. |
| `semantic-tag-switch` | Switch an element between equivalent semantic tags | keep | Semantic HTML without rebuilding the element. |
| `quick-panel` | Floating quick panel over the selection | change | It is the canvas door for the visual properties without handles: besides Fill and Size it must offer text colour, border, opacity/effects and rotation, each running the inspector's command and disabled "not available yet" until its entry is built. |
| `multi-select-edit` | Edit a property on several selected elements at once | keep | Standard. |
| `selection-actions-bar` | Action bar for the selection | merge into `context-menu` | A fourth door to commands already in the context menu, the app menu and the command bar; the quick panel's More actions should open the context menu instead of a separate strip. |
| `resize-handles` | Resize an element with its eight handles | keep | Canvas door for size. |
| `spacing-handles` | Edit padding and margin by dragging on the canvas | keep | Canvas door for margin and padding. |
| `radius-border-gap-handles` | Edit radius, border width and gaps by dragging on the canvas | keep | Canvas door for radius, border width and gap. |
| `shadow-handles` | Edit shadow offset and blur by dragging on the canvas | change | Text shadow has no canvas door; the offset and blur handles must also edit text-shadow on text elements. |
| `page-properties` | Page properties: title, language, direction and page styles | keep | Page settings; SEO metadata is proposed separately (`page-seo-meta`). |
| `export-zip` | Export the page as a ZIP with HTML and a separate CSS file | keep | Matches the user's rule: ZIP, separate CSS file, no inline styles. |
| `export-bem-css` | Exported CSS uses readable BEM classes and is deterministic | keep | Matches the user's BEM rule. |
| `elements-structure` | Structure elements: Container, Header, Navigation, Main, Section, Article, Aside, Footer, Card, Link Block | change | Card is a styled div, already a template in `templates-sections`; as its own element type it cannot survive an HTML round trip (see `html-import-roundtrip`). Drop it from the element types. |
| `elements-text` | Text elements: Heading, Paragraph, Link, Blockquote, Preformatted, Divider, Badge | change | Badge is a styled span, which makes it a template rather than an element type; keep the rest. |
| `elements-lists` | List elements: Unordered, Ordered, Definition, List item, Term, Description | change | List item, Term and Description are internal parts, created by the list (which comes with one) and by `Create <li> inside`, not from the palette. |
| `nesting-grammar` | HTML nesting rules for inserting, dragging and pasting | change | Step 1 inserts List item from the palette, which leaves the palette; use a palette click that stays possible and is refused (Paragraph with a List selected). |
| `nesting-grammar-structure` | HTML nesting rules for wrap, unwrap, promote, tag switch and hand | keep | Rules for structural commands. |
| `elements-tables` | Table elements: Table, Caption, Head, Body, Footer, Row, Header cell, Cell | change | Caption, Head, Body, Footer, Row and the cells are internal parts. The palette offers Table only, inserted with a head row and body rows; the table's own controls add caption, head, footer, rows and columns. |
| `table-commands` | Add and remove table rows and columns | keep | The right door for rows and columns. |
| `elements-form-structure` | Form structure elements: Form, Fieldset, Legend, Label, Button, Output | change | Legend is an internal part of Fieldset (its unique first child), created with the Fieldset or by `Create <legend> inside`, not from the palette. |
| `elements-form-inputs` | Input elements: the 14 input types and their attributes | keep | Standard form inputs. |
| `elements-form-inputs-rules` | Per-type input attributes, type switching, label targets and canvas focus | keep | Valid attributes per input type. |
| `elements-form-controls` | Textarea, Select, Option group, Option, Progress and Meter | change | Option group and Option are internal parts of Select, created by the Select's controls and by `Create <option> inside`, not from the palette. |
| `elements-media-images` | Image, Picture, Source, Figure and Caption | change | Source and Caption are internal parts of Picture and Figure, created through their controls and natural child, not from the palette. |
| `elements-media-embeds` | Video, Audio, Track, Embedded frame and Canvas | change | Source and Track are internal parts of Video and Audio, added from the media element's controls, not from the palette. |
| `elements-svg-shapes` | SVG/Icon, Rectangle, Ellipse and Line | change | Shapes exist only inside an SVG: add them from the SVG's controls, not the palette. The SVG also needs pasted or imported markup (icons), and fill and stroke need a canvas door (the quick panel's Fill). |
| `elements-interactive` | Details, Summary and Dialog | change | Summary is an internal part (a Details always has exactly one), not a palette item. |
| `natural-child-command` | Create the natural child inside a container | keep | The door for internal parts. |
| `props-element-specific` | List, table, form and media properties shown only where they apply | keep | Standard. |
| `templates-layout` | Layout templates: Container, Row, Column, Grid | keep | Common layouts ready-made. |
| `templates-content` | Content templates: lists, table, form, select and figure | keep | The right way to insert composites complete. |
| `templates-sections` | Section templates: Card, Hero, Navbar, Sidebar, Gallery | keep | Common sections ready-made. |
| `templates-components` | Component templates: Form group, Button group, Tabs, Accordion, Modal | keep | Common components ready-made. |
| `palette-search-groups` | Search the Elements panel and collapse its groups | change | "N of 95 elements" counts Pager's internal-part tiles; the count and the group contents follow the curated palette. |
| `palette-density` | Elements panel view density | keep | Panel preference. |
| `layers-expand-collapse-all` | Collapse and expand every branch in Layers | keep | Standard. |
| `layers-search` | Search the Layers panel | keep | Standard. |
| `layers-row-columns` | Choose what each Layers row shows | keep | Useful for class and id work. |
| `layers-row-colours` | Colour labels on Layers rows | keep | Organisation aid; never exported. |
| `zoom-keyboard-buttons` | Zoom with the keyboard, the status bar buttons and Fit | keep | Standard. |
| `zoom-wheel-pan` | Ctrl+wheel zoom, wheel scroll and Space-drag pan | keep | Standard. |
| `rulers` | Rulers along the canvas | keep | Standard. |
| `guides-manual` | Create, move and delete guides from the rulers | keep | Standard. |
| `canvas-outlines-zones` | Show element outlines and drop zones on the canvas | keep | Editing aid. |
| `layout-grid-overlay` | Column grid, row grid and dot grid overlays | keep | Editing aid. |
| `workspace-settings-dialog` | Guides & Grids settings dialog | keep | Settings for guides and grids. |
| `absolute-free-drag` | Free positioning of absolute children by dragging | keep | Canvas door for position. |
| `absolute-nudge` | Nudge positioned elements with the arrow keys | keep | Keyboard door for position. |
| `absolute-anchors` | Anchor positioned elements to edges and centres | keep | Positioning that keeps its intent when the parent resizes. |
| `snap-toggle-settings` | Snap on/off and snap settings | keep | Standard. |
| `snap-while-moving` | Snapping while resizing and moving positioned elements | keep | Standard. |
| `smart-guides` | Smart alignment and equal spacing guides | keep | Standard. |
| `breakpoints-switch` | Switch between Desktop, Laptop, Tablet and Phone breakpoints | user decision | The user ruled out a responsive editor, but exported sites may need to adapt to smaller screens; see "User decisions" below. |
| `breakpoint-overrides` | Style overrides per breakpoint, desktop first | user decision | Same decision as `breakpoints-switch`; see "User decisions" below. |
| `state-styles` | Style states: hover, focus, active, disabled, invalid and placeholder shown | keep | Hover, focus and similar states are standard; its Tablet step follows the breakpoint decision. |
| `preview-mode` | Preview the page without editor chrome | keep | Standard; its Phone step follows the breakpoint decision. |
| `theme-switch` | Light, dark and system theme | keep | Standard. |
| `dock-toggles` | Show and hide the docks and panels | keep | Standard. |
| `command-bar` | Command bar with Ctrl+K | keep | Standard for professionals. |
| `command-bar-set-property` | Set a property or jump to it from the command bar | keep | Fast property entry. |
| `layout-explanation` | Explain drops and layout decisions | remove | Pager's engine read-out describes its own drop engine, not something a user needs; the drop label already names the decision. |
| `shortcuts-panel` | Keyboard shortcuts panel generated from the keymap | keep | Standard. |
| `workbench-panel` | Bottom workbench: tabs, collapse, maximise and developer tools | change | Its steps open the Layout read-out tab (removed); use Keyboard shortcuts and the Document tab instead. |
| `panel-resize` | Resize docks and panels with splitters | keep | Standard. |
| `floating-panels` | Float a panel as a window and dock it again | keep | Standard. |
| `panel-combine-tabs` | Combine panels as tabs or stack them | keep | Standard. |
| `workspace-persist-reset` | Workspace layout persists and can be reset | keep | Standard. |
| `status-bar` | Status bar: messages, breadcrumb, size, context, count, zoom and save state | keep | Standard. |
| `keyboard-panel-navigation` | Move between panels and inside them with the keyboard | keep | Accessibility. |
| `layers-keyboard-navigation` | Operate the Layers tree with the keyboard | keep | Accessibility. |
| `clipboard-cut-system` | Cut, and copy and paste through the system clipboard | change | With the system clipboard moved into `clipboard-copy-paste`, this entry keeps Cut and the text/html flavour with its CSS rules. |
| `html-import-structure` | Import an HTML file: tags, text, inline marks and attributes | keep | Importing existing pages is required. |
| `html-import-cleaning` | Import cleaning: scripts, unknown elements, broken nesting and the import report | change | Now that the project holds JavaScript, dropping scripts loses work. Keep them as project JS files (never run on the editing canvas) and list inline handlers in the report. |
| `html-import-styles` | Import CSS: style attributes, style blocks and linked stylesheets | change | A single-file pick cannot read a linked stylesheet; linked CSS must resolve from an imported folder (proposed `explorer-open-folder`). |
| `html-import-media-queries` | Import @media rules as breakpoint overrides | user decision | Exists only if `breakpoint-overrides` stays. |
| `html-import-states` | Import pseudo-class rules as state styles | keep | Pairs with `state-styles`. |
| `html-import-roundtrip` | Exported pages import back unchanged | change | Import the exported ZIP or folder as a whole (pages, CSS and assets), not index.html plus one CSS file. |
| `clipboard-paste-external` | Paste HTML and text copied from outside the app | keep | Already uses the system clipboard. |
| `code-panel-view` | Code panel shows the generated HTML and CSS | change | A read-only view of the generated files conflicts with the required HTML, JS and CSS editing; the panel shows the project's files from the file tree, editable where the code edit entries allow. |
| `code-panel-selection-sync` | Code panel follows the selection | keep | Standard. |
| `code-panel-copy-download` | Copy or download what the Code panel shows | keep | Already uses the system clipboard. |
| `code-panel-edit-css` | Edit an element's CSS in the Code panel | keep | Editing CSS is required; HTML and JS editing are proposed. |
| `timeline-animations` | Timeline panel: create animations for an element | keep | Animation is required. |
| `timeline-keyframes` | Add, edit, move and delete keyframes on the timeline | keep | Animation is required. |
| `timeline-animation-settings` | Animation duration, delay, repeat, direction, fill and trigger | change | The "on load / on hover" trigger duplicates the element events; triggers come from `events-actions` (proposed), which can play an animation. |
| `timeline-preview` | Preview animations by playing and scrubbing the timeline | keep | Animation is required. |
| `export-keyframes` | Export animations as @keyframes | change | Trigger export follows the events: load goes on the base rule; other triggers set a class from the exported JS. |
| `explorer-pages` | File explorer: add, rename, duplicate, delete and switch pages | change | Pages are .html files in the virtual file system and can live in folders; page names map to file paths. |
| `export-multi-page` | Export every page of the project | change | Page files keep their folders from the file tree, and links are relative to that tree rather than to a flat list of files. |
| `explorer-assets` | Upload and manage image assets | change | Assets are ordinary files in the file tree, in any folder (images and fonts), not a fixed Assets folder. |
| `explorer-assets-use` | Use assets in Image elements and drop images onto the canvas | keep | Standard. |
| `export-assets` | Export includes the used assets | change | The export writes the whole file tree (user's rule), so unused files are exported where they sit; "exactly the used files in assets/" follows Pager. |
| `explorer-files-tree` | Explorer shows the files the export will produce | merge into `explorer-file-system` (proposed) | With a virtual file system the Explorer's tree is the export tree; one entry covers both. |
| `shortcuts-e2e-sweep` | Every listed shortcut works in its context | keep | Proves every listed shortcut works. |

## Rows that are not "keep"

| id | verdict | reason |
|---|---|---|
| `context-menu` | change | Absorbs `selection-actions-bar`: the quick panel's More actions opens this same menu, which then also offers Lock, Hide and Take into the hand. |
| `clipboard-copy-paste` | change | Pager uses an in-memory clipboard; the user's rule is the system clipboard, so copy and paste read and write it (app JSON format) from this first entry. |
| `text-inline-formatting` | change | Pasting rich text should keep the supported marks (strong, em, safe links) instead of plain text only; "Ctrl+U does nothing" turns a Pager gap into a requirement and should go. |
| `rename-element` | change | The F2 modal "Name for this node" is a Pager quirk; F2 should rename inline in the Layers row, the same edit as the double-click. |
| `multi-select-actions` | change | Wrapping several siblings together (one Container, order kept) is expected by professionals; the entry refuses wrap for a multi-selection as Pager does. |
| `app-menu` | change | Drop "Why is it laid out like this?" and "Layout read-out" (see `layout-explanation`); File gains Open folder when the file explorer exists. |
| `project-save-json` | change | A single project.json cannot hold the file tree's images, fonts and JS files; the saved project must contain the document and every file of the virtual file system (for example one project archive). |
| `project-open-json` | change | Same reason as `project-save-json`: opening restores the document and the whole file tree. |
| `props-typography` | change | Text colour has no canvas door (the quick panel's Fill is the background); add a text colour control on the canvas that runs the same command. The font menu must also list project fonts (proposed `custom-fonts`). |
| `gradient-editor` | change | The gradient fill is inspector-only; the quick panel's Fill must open the same fill editor (solid or gradient) and run the same command. |
| `props-border-outline` | change | Only border width and radius have canvas handles; border colour and style and the outline need a canvas door (a Border control in the quick panel) that runs the same commands. |
| `props-effects-basic` | change | Opacity and blend mode are inspector-only; add a canvas door (an Opacity control in the quick panel) that runs the same command. |
| `props-filters-clip` | change | Filters and clip path are inspector-only; add canvas doors (an Effects control in the quick panel) that run the same commands. |
| `props-transforms` | change | Rotation, Move X/Y and scale are inspector-only; rotation needs the canvas handle (proposed `rotation-handle`) and move/scale a canvas door, all on the one transform command. |
| `props-more` | change | Drop touch-action (touch devices only). content acts only on ::before/::after, which the editor cannot target, so it has no effect here. Keep the rest. |
| `quick-panel` | change | It is the canvas door for the visual properties without handles: besides Fill and Size it must offer text colour, border, opacity/effects and rotation, each running the inspector's command and disabled "not available yet" until its entry is built. |
| `selection-actions-bar` | merge into `context-menu` | A fourth door to commands already in the context menu, the app menu and the command bar; the quick panel's More actions should open the context menu instead of a separate strip. |
| `shadow-handles` | change | Text shadow has no canvas door; the offset and blur handles must also edit text-shadow on text elements. |
| `elements-structure` | change | Card is a styled div, already a template in `templates-sections`; as its own element type it cannot survive an HTML round trip (see `html-import-roundtrip`). Drop it from the element types. |
| `elements-text` | change | Badge is a styled span, which makes it a template rather than an element type; keep the rest. |
| `elements-lists` | change | List item, Term and Description are internal parts, created by the list (which comes with one) and by `Create <li> inside`, not from the palette. |
| `nesting-grammar` | change | Step 1 inserts List item from the palette, which leaves the palette; use a palette click that stays possible and is refused (Paragraph with a List selected). |
| `elements-tables` | change | Caption, Head, Body, Footer, Row and the cells are internal parts. The palette offers Table only, inserted with a head row and body rows; the table's own controls add caption, head, footer, rows and columns. |
| `elements-form-structure` | change | Legend is an internal part of Fieldset (its unique first child), created with the Fieldset or by `Create <legend> inside`, not from the palette. |
| `elements-form-controls` | change | Option group and Option are internal parts of Select, created by the Select's controls and by `Create <option> inside`, not from the palette. |
| `elements-media-images` | change | Source and Caption are internal parts of Picture and Figure, created through their controls and natural child, not from the palette. |
| `elements-media-embeds` | change | Source and Track are internal parts of Video and Audio, added from the media element's controls, not from the palette. |
| `elements-svg-shapes` | change | Shapes exist only inside an SVG: add them from the SVG's controls, not the palette. The SVG also needs pasted or imported markup (icons), and fill and stroke need a canvas door (the quick panel's Fill). |
| `elements-interactive` | change | Summary is an internal part (a Details always has exactly one), not a palette item. |
| `palette-search-groups` | change | "N of 95 elements" counts Pager's internal-part tiles; the count and the group contents follow the curated palette. |
| `breakpoints-switch` | user decision | The user ruled out a responsive editor, but exported sites may need to adapt to smaller screens; see "User decisions" below. |
| `breakpoint-overrides` | user decision | Same decision as `breakpoints-switch`; see "User decisions" below. |
| `layout-explanation` | remove | Pager's engine read-out describes its own drop engine, not something a user needs; the drop label already names the decision. |
| `workbench-panel` | change | Its steps open the Layout read-out tab (removed); use Keyboard shortcuts and the Document tab instead. |
| `clipboard-cut-system` | change | With the system clipboard moved into `clipboard-copy-paste`, this entry keeps Cut and the text/html flavour with its CSS rules. |
| `html-import-cleaning` | change | Now that the project holds JavaScript, dropping scripts loses work. Keep them as project JS files (never run on the editing canvas) and list inline handlers in the report. |
| `html-import-styles` | change | A single-file pick cannot read a linked stylesheet; linked CSS must resolve from an imported folder (proposed `explorer-open-folder`). |
| `html-import-media-queries` | user decision | Exists only if `breakpoint-overrides` stays. |
| `html-import-roundtrip` | change | Import the exported ZIP or folder as a whole (pages, CSS and assets), not index.html plus one CSS file. |
| `code-panel-view` | change | A read-only view of the generated files conflicts with the required HTML, JS and CSS editing; the panel shows the project's files from the file tree, editable where the code edit entries allow. |
| `timeline-animation-settings` | change | The "on load / on hover" trigger duplicates the element events; triggers come from `events-actions` (proposed), which can play an animation. |
| `export-keyframes` | change | Trigger export follows the events: load goes on the base rule; other triggers set a class from the exported JS. |
| `explorer-pages` | change | Pages are .html files in the virtual file system and can live in folders; page names map to file paths. |
| `export-multi-page` | change | Page files keep their folders from the file tree, and links are relative to that tree rather than to a flat list of files. |
| `explorer-assets` | change | Assets are ordinary files in the file tree, in any folder (images and fonts), not a fixed Assets folder. |
| `export-assets` | change | The export writes the whole file tree (user's rule), so unused files are exported where they sit; "exactly the used files in assets/" follows Pager. |
| `explorer-files-tree` | merge into `explorer-file-system` (proposed) | With a virtual file system the Explorer's tree is the export tree; one entry covers both. |

## User decisions

**`breakpoints-switch` and `breakpoint-overrides`**

- **For keeping them:** exported sites are opened on phones and tablets. Without per-breakpoint overrides, a page can only adapt through fluid units, flex/grid wrapping and `clamp()`, and imported sites lose their `@media` rules.
- **Against them:** the user ruled out a responsive editor. Breakpoints multiply the style model (every property × breakpoint × state), the inspector badges, the import mapping and the tests. Fluid layout covers most adaptation without editing per device.

**`html-import-media-queries`** exists only if `breakpoint-overrides` stays.

If the breakpoints are removed, these entries lose their breakpoint parts (a step or an expected line) but stay otherwise:

- `canvas-page-iframe` (page width named "the Desktop breakpoint")
- `zoom-keyboard-buttons` (Fit refits when the breakpoint width changes)
- `state-styles` (Tablet step)
- `preview-mode` (breakpoint switcher and Phone step)
- `status-bar` (breakpoint shown)
- `html-import-roundtrip` (breakpoint overrides compared)

## Proposed new entries

These are capabilities the user already requires, or that a professional website builder is expected to have, and that `features.json` lacks. Each gives the entry it should follow.

### `ui-language` — UI language: Brazilian Portuguese by default, English available

Place after: `editor-shell`.

Steps:
- Open the app with a fresh profile.
- Switch the UI language to English from the app menu, then back to Português (Brasil).
- Reload.

Expected:
- A fresh profile shows every UI text in pt-BR: menus, panels, tooltips, status bar messages and accessible names.
- Switching the language re-renders every visible text without a reload; the choice is stored in the preferences store and restored after reload.
- A unit test proves that the pt-BR and en catalogues have the same keys with the same placeholders.
- Tests that assert UI text set the language explicitly or read the text through its i18n key.

### `rotation-handle` — Rotate an element with a handle on the canvas

Place after: `props-transforms`.

Steps:
- Select a Container.
- Drag its rotation handle a quarter turn clockwise; repeat with Shift held.
- Type 30 in the inspector's Rotate field.
- Zoom to 200% and rotate again with the handle.

Expected:
- A rotation handle sits outside the selection outline at a fixed screen distance; over it the cursor shows rotation.
- Dragging rotates around the transform-origin and the angle follows the pointer; Shift snaps to 15° steps; the status bar shows the live angle.
- The handle and the Rotate field run the same command and write the rotate part of the one transform value; a whole drag is one undo step.
- The angle does not depend on the zoom; the outline and handles follow the rotated box.

### `hover-measure` — Measure sizes and distances on the canvas

Place after: `smart-guides`.

Steps:
- Hover an element with nothing selected.
- Select a Container, hold Alt and hover a sibling.
- Hold Alt and hover the selection's parent.
- Zoom to 50% and repeat.

Expected:
- Hovering shows the element's size (W × H in CSS px) next to its hover outline.
- With a selection, holding Alt over another element draws distance lines between the nearest edges, each labelled in CSS px; over an ancestor it shows the distances from the selection to the ancestor's inner edges.
- The values are CSS px at any zoom and equal the measured geometry in the iframe.
- Measuring never changes the selection or the document JSON.

### `copy-paste-styles` — Copy and paste styles between elements

Place after: `clipboard-cut-system`.

Steps:
- Select a styled Heading and press Ctrl+Alt+C.
- Select a Paragraph and press Ctrl+Alt+V.
- Press Ctrl+Z.

Expected:
- Copy style puts every style value of the element on the system clipboard in the app format.
- Paste style replaces the target's style values with the copied ones as one undo step; text, children and attributes stay.
- Both commands are in the context menu and the Edit menu with their shortcuts.

### `align-distribute` — Align and distribute positioned elements

Place after: `absolute-anchors`.

Steps:
- Place three absolutely positioned boxes in a positioned Container and select them.
- Run Align left, Align centre and Align top; then Distribute horizontally.
- Select one box and run Align centre.

Expected:
- With several elements selected, align works on the selection's bounds; with one element, on its parent's box.
- Distribute makes the gaps between the elements equal.
- The commands are in the quick panel and the Arrange menu; top and left are written for each element as one undo step, and the measured positions in the iframe match.

### `element-attributes-aria` — Custom attributes and accessibility fields

Place after: `props-attributes`.

Steps:
- Select a Button and add aria-label, aria-expanded and data-state attributes and a role.
- Try to add an onclick attribute and an attribute with an invalid name.
- Export.

Expected:
- Custom attributes (aria-*, data-*, role) are stored in the document JSON and rendered in the iframe and the export; they are the user's own, unlike the editor-generated attributes that the export never writes.
- on* attributes and invalid attribute names are refused with a message (behaviour belongs to the element events).
- Each change is one undo step.

### `page-seo-meta` — Page metadata for search and sharing

Place after: `page-properties`.

Steps:
- Open Page properties and set the description, the canonical URL, the Open Graph title and image, and the favicon.
- Export.

Expected:
- The values are stored in the page settings of the document JSON; image fields pick files from the file tree.
- The exported page head has meta description, link rel=canonical, the og: tags and link rel=icon with paths relative to the page file.

### `custom-fonts` — Use custom font files

Place after: `props-typography`.

Steps:
- Add two .woff2 font files to the project.
- Select a Heading and choose the new font in the font menu.
- Export.

Expected:
- The font menu lists the project fonts above the system stacks, each previewed in its own face.
- The canvas renders the Heading with the font.
- The export writes @font-face rules in the CSS pointing to the font files at their paths in the tree, and the exported page renders with the font.

### `css-variables-tokens` — Design tokens as CSS variables

Place after: `inspector-add-property`.

Steps:
- Open the Variables panel and create a colour, a spacing and a font-size variable.
- Use the colour variable as a Section's background and the spacing variable as its padding.
- Change the colour variable.

Expected:
- Variables are stored in the project; colour, length and font fields offer them next to typed values.
- Every element that uses a variable updates when it changes, as one undo step.
- The export writes the variables in :root and uses var(--name) where they are used.

### `shared-style-classes` — Reusable style classes

Place after: `css-variables-tokens`.

Steps:
- Style a Button and save its styles as the class 'button-primary'.
- Apply the class to two other buttons.
- Change the class's background; override the background on one button only.

Expected:
- A class holds styles shared by every element that uses it; editing the class updates all of them.
- An element's own values override the class and the inspector shows which values come from the class.
- The export writes one rule for the class and element rules only for the overrides.

### `reusable-components` — Reusable components with instances

Place after: `shared-style-classes`.

Steps:
- Turn a Card into a component and place two more instances.
- Edit the component's heading style; override the text of one instance.
- Detach one instance.

Expected:
- Instances follow the component's structure and styles; per-instance overrides of text and attributes are kept.
- Detaching turns an instance into a normal subtree.
- The export writes plain HTML for every instance, with the component's styles written once.

### `embed-html` — Embed custom HTML

Place after: `elements-interactive`.

Steps:
- Insert an Embed and paste third-party widget markup with a script.
- Preview the page.
- Export.

Expected:
- The markup is stored as-is and shown sandboxed on the editing canvas, where its scripts never run.
- Preview runs it.
- The export writes it verbatim at its place; Layers marks it as an embed.

### `link-picker` — Link to pages, anchors, email and phone

Place after: `explorer-pages`.

Steps:
- Select a Link and pick another page as its target.
- Pick an element of the current page as an anchor target.
- Enter an email address and a phone number as targets.
- Rename and move the target page.

Expected:
- The picker offers the pages of the file tree, the elements of a page (giving them an id if they have none), a URL, email (mailto:) and phone (tel:); unsafe URLs are refused.
- Page links are stored as references and exported as relative paths.
- Renaming or moving the target page updates every link to it.

### `events-actions` — Events and actions per element

Place after: `timeline-preview`.

Steps:
- Select a Button, open the Interactions section and add: on click, toggle the class 'is-open' on a Container.
- Add: on hover, show a hidden element; on scroll into view, play the 'fade-in' animation; on page load, scroll to an element; on submit of a Form, hide the form and show a message; on click, open a link in a new tab.
- Preview the page and trigger each event.
- Remove an action and undo.

Expected:
- Triggers are click, hover (enter and leave), scroll into view, page load and form submit; actions are show, hide, toggle class, play animation, scroll to and open link.
- Targets are picked from the page or Layers, never typed ids; combinations that cannot apply (form submit on a non-form) are not offered.
- Interactions are stored per element in the document JSON; each add, edit and remove is one undo step.
- Preview runs them; the editing canvas never does.

### `export-events-js` — Export interactions as standard JavaScript

Place after: `events-actions`.

Steps:
- Build the interactions of events-actions and export.

Expected:
- The ZIP contains a plain JavaScript file (no framework, no inline handlers) linked with `<script defer>` from every page that uses interactions.
- Targets are addressed by their BEM class or user id, never by editor ids or data attributes.
- In the exported page opened in Chrome every trigger performs its action, checked by class, computed style or scroll position.
- Pages without interactions export exactly as before, with no script.

### `explorer-file-system` — File explorer with a virtual file system

Place after: `explorer-pages`.

Steps:
- Open the Explorer.
- Create the folders 'css', 'js' and 'img/icons' and the file 'js/main.js'.
- Rename a folder; drag a file into another folder; delete a folder that holds files, after confirming.
- Undo the delete; reload.

Expected:
- The Explorer shows the project's file tree (pages, CSS, JS, images, fonts) with folders; this tree is exactly what the export writes.
- Files and folders can be created, renamed, moved (drag and drop, and a Move to… command) and deleted; names are unique per folder; links and references to a moved or renamed file are updated.
- Deleting a file in use asks for confirmation and lists where it is used; every operation is one undo step.
- The tree is stored with the project in IndexedDB and restored after reload.

### `explorer-open-folder` — Open a whole folder from disk

Place after: `explorer-file-system`.

Steps:
- Choose File > Open folder and pick a folder with index.html, about/index.html, css/site.css, js/app.js and img/logo.png.
- Confirm replacing the project.
- Export.

Expected:
- The folder is read with Chrome's directory picker and every file lands at the same path in the virtual file system.
- HTML pages go through the HTML importer with their linked CSS resolved from the folder; CSS, JS, images and fonts are kept as files.
- The import report lists what was converted, kept as-is or dropped.
- The export right after reproduces the same folder structure.

### `export-file-tree` — Export the file tree as a ZIP

Place after: `explorer-file-system`.

Steps:
- Create folders and files in the Explorer, including a page inside a folder and an image used by it, and export.

Expected:
- The ZIP holds exactly the Explorer's tree: every folder and file at its path, pages generated from the document, CSS in separate files with BEM classes.
- Relative links between pages and to files are computed from their paths.
- Two exports without changes are byte-identical.

### `code-panel-edit-html` — Edit HTML in the Code panel

Place after: `code-panel-edit-css`.

Steps:
- Select a Section and open the HTML tab.
- Edit its markup: change a text, add a paragraph, change an attribute; apply.
- Type markup that breaks the nesting rules (an li outside a list) and apply; type unparsable markup and apply.

Expected:
- Applying parses the markup with the HTML importer's rules and replaces the element's subtree in the document JSON as one undo step; the canvas, Layers and the inspector update.
- Unchanged nodes keep their ids, names and styles.
- Markup that breaks the nesting rules or cannot be parsed is refused with the line and the reason, and the document JSON is unchanged.

### `code-panel-edit-js` — Edit JavaScript files in the Code panel

Place after: `code-panel-edit-html`.

Steps:
- Create js/main.js in the Explorer, open it in the Code panel, type code and save.
- Type a syntax error and save.
- Link the script to the page in Page properties and open Preview.

Expected:
- JS files open with line numbers and syntax colouring; saving writes the file in the file tree as one undo step.
- Syntax errors are shown with the line and the reason.
- Preview runs the linked scripts and reloads after each save; the editing canvas never runs them.
- The export writes the files unchanged and links them from their pages.

### `accessibility-checks` — Accessibility and structure checks

Place after: `status-bar`.

Steps:
- Build a page with an image without alt, a skipped heading level, low-contrast text and a link without text.
- Open the Checks panel and click each issue.

Expected:
- Each issue is listed with its rule, the element and a suggested fix; clicking it selects the element on the canvas and in Layers.
- The list updates after every command.
- Checks never block editing or export.
