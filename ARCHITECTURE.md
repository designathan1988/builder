# Architecture

Every concept has one owner module. A second implementation of a concept that has an owner here is a defect; a new concept gets its line here, and its data in the manifest, in the same commit as its code. `manifest:check` rule `owner` fails when the owner of a command in `manifest/commands/*.json` differs from the table "Command owners" below.

Layers: `src/core/` is the document core in plain TypeScript (no React, no DOM); `src/editor/` is the React editor; `src/app/` wires the two; `src/manifest/` reads and checks the contract; `src/generated/` is written by `npm run gen` only; `tools/` runs in Node only.

## Concepts of foundation part 1

Each module below exists by the end of part 1; until a module lands, its line is the plan it follows.

| Concept | Owner | Responsibility | Never |
|---|---|---|---|
| Generated types and registries | `tools/gen/types.ts` | Writes `src/generated/` from the manifest and the catalogues: the id unions (CommandId, DoorId, PropertyId, ElementType, MessageId…), each command's argument types, the value lists the "generated" doors offer. | Hand edits in `src/generated/` (gen:check fails); logic in generated files. |
| Manifest at runtime | `src/manifest/runtime.ts` | Loads the manifest JSON once, parsed by its schemas, and answers lookups: a command, a door, a region's doors, the menus, the properties, the elements. | Re-listing manifest data in code; writing the manifest. |
| Command registry and the "not available yet" marker | `src/core/commands/registry.ts` | The contract of the command table: its type `CommandTable` (a key for every CommandId), `registerHandler`, the `NOT_AVAILABLE_YET` marker, `registerPredicate`, the handler's context and outcome. It holds no entries. | Doors, React, entries. |
| The command table | `src/app/commands.ts` | The one map from every command to its handler or `NOT_AVAILABLE_YET`, and the table of registered predicates; a missing or extra entry is a type error. | Handlers written inline; any other map of commands. |
| Document model | `src/core/document/model.ts` | The document JSON types (pages, the node tree, attributes, classes, styles by breakpoint and state) with ids from the manifest, and the empty project. | DOM, rendering, storage. |
| Validation | `src/core/document/validate.ts` | Whole-tree validation of a document and its selection against the model and the manifest, on every commit. | Repairing or changing a document. |
| Store and dispatch | `src/core/store/store.ts` | The one store: document, selection, history, last message and the editor state; changes only through `dispatch(command)`; deep-freezes every state in development and tests. | Changing state outside dispatch; React. |
| Transactions | `src/core/history/transaction.ts` | Applies JSON patches, records their inverses, drops patches that change nothing; one transaction per dispatch or per gesture, with the selection before and after. | Touching the history stacks. |
| History | `src/core/history/history.ts` | The undo and redo stacks, coalescing, `history.undo` and `history.redo`: undo restores the document and the selection before the command, redo the ones after; no entry for a command that changes nothing. | Storing snapshots of editor state; entries for non-undoable commands. |
| Clock port | `src/core/ports/clock.ts` | The only reader of the time (`Date.now`); tests pass a fixed clock. | Being bypassed: a lint rule forbids `Date.now` and `new Date()` elsewhere. |
| IdGenerator port | `src/core/ports/ids.ts` | The only source of ids (`crypto.randomUUID`); tests pass a counter. | Being bypassed: a lint rule forbids `Math.random` and `crypto.randomUUID` elsewhere. |
| i18n runtime | `src/i18n/index.ts` | `translate(locale, key, params)` and `translator(locale)` over the en (default) and pt-BR catalogues, `formatMessage`, `isLocale`, and `pluralForm` (which of a key's `.one` and `.other` texts a count takes, by `Intl.PluralRules`). It holds no state: the UI language is a preference in the store, and the editor translates for the locale the store holds (`src/editor/text.ts`). | UI text written in code (lint rule `builder/no-literal-ui-string`); a locale kept outside the store. |
| Tokens | `src/ui/tokens.css` | Every colour, type style, spacing, size, radius and shadow, generated from `design/final/tokens.json` by `tools/gen/tokens.ts`. | A literal colour, spacing, size, radius, shadow or font value in any other stylesheet (lint rule `builder-css/use-tokens`) or in a React style object (`builder/use-tokens`), and a `var()` of a custom property the tokens do not define. |
| Icons | `tools/gen/icons.ts` | The one icon library is Lucide (DESIGN.md "Icons"). Writes `manifest/generated/icons.json` (every Lucide name, which rules icon-name and icon-required check the manifest against) and `src/ui/icons.svg` (the sprite of the icons the manifest names: doors, menu anchors, glyphs, elements, keyword icons). | An icon chosen in component code; an inline SVG icon. |
| Lint rules of the contract | `tools/lint/plugin.ts` | The ESLint rules `builder/use-ports`, `builder/no-literal-ui-string`, `builder/use-tokens` and `builder-css/use-tokens` (with `tools/lint/style-values.ts`, the value analysis both token rules share). | Exceptions outside the owners named above. |
| Panel visibility | `src/editor/workspace/panels.ts` | Which sidebar view is shown, and whether the sidebar, the Layers section, the inspector and each dock tab are open: `workspace.setPanelOpen`, `toggleLeftDock`, `toggleInspector`, `collapseDocks`, `toggleDeveloperTools`. | Sizes, positions, the dock's state or the active tab (layout.ts); the inspector's sections (`src/editor/inspector/sections.ts`); document or selection state. |
| Workspace layout | `src/editor/workspace/layout.ts` | The dock's state (collapsed, open, maximised), the active tab of each tab group, splitter sizes and floating panel positions: `workspace.setWorkbenchState`, `setActiveTab`, `resizeSplitter`, `movePanel`, `reset`. Part 1 builds the dock's state. | Which panels are open (panels.ts). |
| Preferences | `src/editor/preferences/preferences.ts` | The UI language and theme, stored and restored after reload. | Document state. |
| Chords | `src/manifest/chord.ts` | How a shortcut door writes its keys: `normaliseChord` reads a chord (modifiers in a fixed order, a letter in upper case, the named keys), for manifest:check and for the keymap alike. | A second chord parser. |
| Keymap | `src/editor/input/keymap.ts` | Runs the shortcut doors of the manifest in their key contexts: reads a key press as a chord, finds its door in the focused context or a context it inherits (`interactions.json`), prevents the browser default of a bound chord and dispatches a built command. | A second key table; keys that are not doors. |
| The editor state | `src/editor/state.ts` | Composes the editor's part of the store state (`EditorUi`) from the parts panels.ts, layout.ts and preferences.ts own. | State of its own; document or selection state. |
| The editor store binding | `src/editor/store.ts` | Creates the store with the command table and the editor state, stores the preferences on every change, and exposes the store to React (`useEditorState` over `useSyncExternalStore`). | Holding state in `useState` or `useRef`. |
| Door rendering | `src/editor/doors/door.tsx` | Draws one door as the control its kind and face (`drawnAs`, `icon`) call for, disabled with "not available yet" when its command has the marker and unavailable when its predicate says so; `current.ts` says whether a door stands for the current state (from the store for built commands, from DESIGN.md's defaults for the others). | Controls that are not doors (except `data-local` ones DESIGN.md lists). |
| Door placement | `src/editor/doors/placement.ts` | The doors and menu buttons of a region, in their order (`layout.json`, `placement`). | Hand-written lists of buttons or menu items. |
| Menus | `src/editor/doors/menu.tsx` | Opens a menu from its button and draws its items, the menu doors in order with their shortcuts. | Item tables written in code. |
| The shell regions | `src/editor/shell/shell.tsx` | The window grid and every region of DESIGN.md, one file each under `src/editor/shell/`: top bar (`top-bar.tsx`), activity bar and sidebar views (`sidebar.tsx`), file tabs, canvas toolbar, canvas frame with breakpoint tabs and rulers (`canvas.tsx`), inspector (`inspector.tsx`), dock (`dock.tsx`), status bar (`status-bar.tsx`); `slots.tsx` draws a region's slots in order; `shell.css` styles them from the tokens only. | Drawing a control a door does not declare. |

## Concepts of foundation part 2 (planned)

| Concept | Owner (planned) | Responsibility |
|---|---|---|
| Canvas iframe | `src/editor/canvas/frame.tsx` | planned: the iframe that shows the rendered page, scaled with CSS `zoom`. |
| Renderer | `src/core/render/render.ts` | planned: the document JSON to the HTML and CSS of the page, the one writer of CSS text from stored values. |
| Coordinates under zoom | `src/editor/canvas/coordinates.ts` | planned: page, frame and screen coordinates at any zoom. |
| Pointer input | `src/editor/input/pointer.ts` | planned: the one owner of pointer gestures, which run the canvas and drag doors as one transaction per gesture. |
| Test suite from the manifest | `tools/runner/scenarios.ts` | planned: one Playwright test per scenario and door, through real input, reading the read-only test port. |
| Read-only test port | `src/editor/test-port.ts` | planned: what tests read: the document, the selection, the history and the export. It never writes, loads, creates or selects anything. |

## Command owners

Every command of the manifest and the module that owns it. "part 1" modules exist; "planned" ones arrive with their features.

| Module | Commands | Status |
|---|---|---|
| `src/core/animation/animation.ts` | `animation.create`, `animation.rename`, `animation.delete`, `animation.addKeyframe`, `animation.moveKeyframe`, `animation.setKeyframeEasing`, `animation.deleteKeyframe`, `animation.setSettings` | planned |
| `src/core/clipboard/clipboard.ts` | `clipboard.copy`, `clipboard.paste`, `clipboard.cut`, `clipboard.copyStyle`, `clipboard.pasteStyle` | planned |
| `src/core/design/classes.ts` | `classes.create`, `classes.apply`, `classes.detach` | planned |
| `src/core/design/colors.ts` | `colors.saveSwatch`, `colors.removeSwatch` | planned |
| `src/core/design/components.ts` | `components.create`, `components.insertInstance`, `components.detach` | planned |
| `src/core/design/tokens.ts` | `tokens.create`, `tokens.update`, `tokens.rename`, `tokens.delete` | planned |
| `src/core/elements/attributes.ts` | `element.setAttribute`, `element.setId`, `element.setClasses`, `element.setCustomAttribute`, `element.removeCustomAttribute` | planned |
| `src/core/elements/embed.ts` | `element.setEmbedMarkup` | planned |
| `src/core/elements/inputs.ts` | `element.setInputType`, `element.setLabelTarget` | planned |
| `src/core/elements/link.ts` | `element.setLink` | planned |
| `src/core/elements/parts.ts` | `parts.toggle`, `parts.add`, `parts.move`, `parts.remove` | planned |
| `src/core/elements/svg.ts` | `element.setSvgMarkup` | planned |
| `src/core/elements/table.ts` | `table.addColumnAfter`, `table.addColumnEnd`, `table.removeColumn`, `table.addRowAfter`, `table.removeRow` | planned |
| `src/core/elements/tag.ts` | `element.setTag` | planned |
| `src/core/events/interactions.ts` | `interactions.add`, `interactions.update`, `interactions.remove` | planned |
| `src/core/export/export.ts` | `project.export` | planned |
| `src/core/files/assets.ts` | `assets.insertImageFile` | planned |
| `src/core/files/files.ts` | `files.createFolder`, `files.createFile`, `files.rename`, `files.move`, `files.delete`, `files.upload`, `files.saveContent` | planned |
| `src/core/geometry/align.ts` | `position.align`, `position.distribute` | planned |
| `src/core/geometry/anchors.ts` | `position.setAnchors` | planned |
| `src/core/geometry/position.ts` | `position.setMode`, `position.move` | planned |
| `src/core/geometry/resize.ts` | `geometry.resize` | planned |
| `src/core/history/history.ts` | `history.undo`, `history.redo` | part 1 |
| `src/core/import/apply-html.ts` | `element.applyHtml` | planned |
| `src/core/import/folder.ts` | `project.openFolder` | planned |
| `src/core/import/import.ts` | `project.importHtml` | planned |
| `src/core/nodes/flags.ts` | `element.toggleLock`, `element.toggleHidden`, `element.setLayerColor` | planned |
| `src/core/nodes/names.ts` | `element.rename` | planned |
| `src/core/page/grid.ts` | `grid.toggleColumns`, `grid.toggleRows`, `grid.toggleDots`, `grid.setSettings` | planned |
| `src/core/page/guides.ts` | `guides.create`, `guides.move`, `guides.delete`, `guides.toggleLock` | planned |
| `src/core/page/settings.ts` | `page.setSetting` | planned |
| `src/core/project/archive.ts` | `project.save`, `project.open` | planned |
| `src/core/project/pages.ts` | `pages.add`, `pages.rename`, `pages.duplicate`, `pages.delete`, `pages.switch` | planned |
| `src/core/project/project.ts` | `project.newBlankPage` | planned |
| `src/core/project/recovery.ts` | `project.restoreVersion` | planned |
| `src/core/project/tab-guard.ts` | `project.takeOverEditing` | planned |
| `src/core/selection/selection.ts` | `selection.select`, `selection.clear`, `selection.add`, `selection.toggle`, `selection.walkNextSibling`, `selection.walkPreviousSibling`, `selection.walkParent`, `selection.walkFirstChild`, `selection.selectAllInContainer`, `selection.marquee` | planned |
| `src/core/structure/duplicate.ts` | `element.duplicate` | planned |
| `src/core/structure/hand.ts` | `hand.take`, `hand.aimNext`, `hand.aimPrevious`, `hand.climb`, `hand.descend`, `hand.drop` | planned |
| `src/core/structure/insert.ts` | `element.insert`, `element.createNaturalChild` | planned |
| `src/core/structure/move.ts` | `element.moveTo`, `element.moveUp`, `element.moveDown`, `element.nestIntoPrevious`, `element.promote` | planned |
| `src/core/structure/remove.ts` | `element.delete` | planned |
| `src/core/structure/wrap.ts` | `element.wrapRow`, `element.wrapColumn`, `element.unwrap` | planned |
| `src/core/style/alignment.ts` | `style.setAlignment` | planned |
| `src/core/style/background-image.ts` | `style.setBackgroundImage` | planned |
| `src/core/style/border.ts` | `style.setBorder`, `style.setRadius` | planned |
| `src/core/style/css-rule.ts` | `style.applyCssRule` | planned |
| `src/core/style/custom.ts` | `style.setCustomDeclarations` | planned |
| `src/core/style/filter.ts` | `style.setFilter` | planned |
| `src/core/style/reset.ts` | `style.reset`, `style.resetAll` | planned |
| `src/core/style/set.ts` | `style.set` | planned |
| `src/core/style/shadows.ts` | `style.setShadows` | planned |
| `src/core/style/spacing.ts` | `style.setSpacing` | planned |
| `src/core/style/transform.ts` | `style.setTransform` | planned |
| `src/core/text/text.ts` | `text.set` | planned |
| `src/editor/canvas/edit-mode.ts` | `canvas.setEditMode` | planned |
| `src/editor/canvas/handles.ts` | `handle.step` | planned |
| `src/editor/canvas/text-edit.ts` | `text.startEdit`, `text.cancelEdit`, `text.insertLineBreak`, `text.toggleBold`, `text.toggleItalic`, `text.editLink`, `text.paste`, `text.selectAll` | planned |
| `src/editor/code-panel/code-panel.ts` | `codePanel.copyPane`, `codePanel.downloadPane` | planned |
| `src/editor/command-bar/command-bar.ts` | `commandBar.open` | planned |
| `src/editor/drag/drag-session.ts` | `drag.levelUp`, `drag.levelDown`, `drag.cancel` | planned |
| `src/editor/explorer/explorer.ts` | `files.open` | planned |
| `src/editor/explorer/file-tabs.ts` | `files.closeTab` | planned |
| `src/editor/focus/focus.ts` | `focus.next`, `focus.previous`, `focus.first`, `focus.last`, `focus.activate`, `focus.nextRegion`, `focus.previousRegion`, `focus.canvas` | planned |
| `src/editor/inspector/number-field.ts` | `field.step`, `field.scrub`, `field.setUnit` | planned |
| `src/editor/inspector/page-properties.ts` | `page.openProperties` | planned |
| `src/editor/inspector/sections.ts` | `inspector.toggleSection`, `inspector.setMode`, `inspector.reveal` | planned |
| `src/editor/inspector/spacing.ts` | `inspector.toggleSpacingLink` | planned |
| `src/editor/inspector/style-target.ts` | `inspector.setStyleTarget` | planned |
| `src/editor/layers/rename.ts` | `layers.startRename` | planned |
| `src/editor/layers/tree.ts` | `layers.setExpanded`, `layers.collapseAll`, `layers.expandAll`, `layers.expandOrFocusChild`, `layers.collapseOrFocusParent`, `layers.setRowDetails` | planned |
| `src/editor/menus/context-menu.ts` | `contextMenu.open` | planned |
| `src/editor/menus/overlays.ts` | `ui.dismiss` | planned |
| `src/editor/palette/palette.ts` | `palette.toggleGroup`, `palette.setDensity` | planned |
| `src/editor/preferences/preferences.ts` | `preferences.setLanguage`, `preferences.setTheme` | part 1 |
| `src/editor/quick-panel/quick-panel.ts` | `quickPanel.setOffset` | planned |
| `src/editor/timeline/playhead.ts` | `timeline.setPlayhead` | planned |
| `src/editor/timeline/preview.ts` | `timeline.play`, `timeline.pause`, `timeline.stop`, `timeline.toggleLoop` | planned |
| `src/editor/view/breakpoints.ts` | `view.setBreakpoint` | planned |
| `src/editor/view/camera.ts` | `view.zoomIn`, `view.zoomOut`, `view.zoomReset`, `view.zoomTo`, `view.zoomFit`, `view.zoomAt`, `view.pan` | planned |
| `src/editor/view/editor-view.ts` | `view.setEditorView` | planned |
| `src/editor/view/overlays.ts` | `view.toggleOutlines`, `view.toggleZones`, `view.toggleRulers`, `view.toggleSmartGuides`, `view.toggleEqualSpacing`, `guides.toggleVisible` | planned |
| `src/editor/view/preview.ts` | `view.enterPreview`, `view.exitPreview` | planned |
| `src/editor/view/snap.ts` | `snap.setEnabled`, `snap.setSettings` | planned |
| `src/editor/view/style-state.ts` | `view.setStyleState` | planned |
| `src/editor/workspace/dialogs.ts` | `workspace.openDialog` | planned |
| `src/editor/workspace/layout.ts` | `workspace.reset`, `workspace.setWorkbenchState`, `workspace.setActiveTab`, `workspace.resizeSplitter`, `workspace.movePanel` | part 1 |
| `src/editor/workspace/panels.ts` | `workspace.setPanelOpen`, `workspace.toggleLeftDock`, `workspace.toggleInspector`, `workspace.collapseDocks`, `workspace.toggleDeveloperTools` | part 1 |
