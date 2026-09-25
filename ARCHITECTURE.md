# Architecture

Every concept has one owner module. A second implementation of a concept that has an owner here is a defect; a new concept gets its line here, and its data in the manifest, in the same commit as its code. `manifest:check` rule `owner` fails when the owner of a command in `manifest/commands/*.json` differs from the table "Command owners" below.

Layers: `src/core/` is the document core in plain TypeScript (no React, no DOM); `src/editor/` is the React editor; `src/app/` wires the two; `src/manifest/` reads and checks the contract; `src/generated/` is written by `npm run gen` only; `tools/` runs in Node only.

## Concepts of foundation part 1

Each module below exists by the end of part 1; until a module lands, its line is the plan it follows.

| Concept | Owner | Responsibility | Never |
|---|---|---|---|
| Generated types and registries | `tools/gen/types.ts` | Writes `src/generated/` from the manifest and the catalogues: the id unions (CommandId, DoorId, PropertyId, ElementType, MessageId…), each command's argument types, the value lists the "generated" doors offer. | Hand edits in `src/generated/` (gen:check fails); logic in generated files. |
| Manifest at runtime | `src/manifest/runtime.ts` | Loads the manifest JSON once, parsed by its schemas, and answers lookups: a command, a door, a region's doors, the menus, the properties, the elements. | Re-listing manifest data in code; writing the manifest. |
| Command registry and the "not available yet" marker | `src/core/commands/registry.ts` | The contract of the command table: its type `CommandTable` (a key for every CommandId), `registerHandler` (with the handler, optionally the command owner's `current`: whether a door with given arguments stands for the state the store holds, which `src/editor/doors/current.ts` asks), the `NOT_AVAILABLE_YET` marker, `registerPredicate`, the handler's context and outcome. It holds no entries. | Doors, React, entries. |
| The command table | `src/app/commands.ts` | The one map from every command to its handler or `NOT_AVAILABLE_YET`, and the table of registered predicates; a missing or extra entry is a type error. | Handlers written inline; any other map of commands. |
| Document model | `src/core/document/model.ts` | The document JSON types (pages, the node tree, attributes, classes, styles by breakpoint and state) with ids from the manifest, and the empty project. | DOM, rendering, storage. |
| Validation | `src/core/document/validate.ts` | Whole-tree validation of a document and its selection against the model and the manifest, on every commit. | Repairing or changing a document. |
| Store and dispatch | `src/core/store/store.ts` | The one store: document, selection, history, last message and the editor state; changes only through `dispatch(command)`; deep-freezes every state in development and tests. When a change moves the selection (any command, undo, redo), the editor state follows it through the editor's `followSelection` option (Layers unfolds a branch that hides a selected node, `src/editor/layers/tree.ts`). | Changing state outside dispatch; React. |
| Transactions | `src/core/history/transaction.ts` | Applies JSON patches, records their inverses, drops patches that change nothing; one transaction per dispatch or per gesture, with the selection before and after. | Touching the history stacks. |
| History | `src/core/history/history.ts` | The undo and redo stacks, coalescing, `history.undo` and `history.redo`: undo restores the document and the selection before the command, redo the ones after; no entry for a command that changes nothing. | Storing snapshots of editor state; entries for non-undoable commands. |
| Clock port | `src/core/ports/clock.ts` | The only reader of the time (`Date.now`); tests pass a fixed clock. | Being bypassed: a lint rule forbids `Date.now` and `new Date()` elsewhere. |
| IdGenerator port | `src/core/ports/ids.ts` | The only source of ids (`crypto.randomUUID`); tests pass a counter. | Being bypassed: a lint rule forbids `Math.random` and `crypto.randomUUID` elsewhere. |
| i18n runtime | `src/i18n/index.ts` | `translate(locale, key, params)` and `translator(locale)` over the en (default) and pt-BR catalogues, `formatMessage`, `isLocale`, and `pluralForm` (which of a key's `.one` and `.other` texts a count takes, by `Intl.PluralRules`). It holds no state: the UI language is a preference in the store, and the editor translates for the locale the store holds (`src/editor/text.ts`). | UI text written in code (lint rule `builder/no-literal-ui-string`); a locale kept outside the store. |
| Tokens | `src/ui/tokens.css` | Every colour, type style, spacing, size, radius and shadow, generated from `design/final/tokens.json` by `tools/gen/tokens.ts`, which fails when an on-colour or a text colour reads below 4.5:1 on its background. | A literal colour, spacing, size, radius, shadow or font value in any other stylesheet (lint rule `builder-css/use-tokens`) or in a React style object (`builder/use-tokens`), and a `var()` of a custom property the tokens do not define. |
| Icons | `tools/gen/icons.ts` | The one icon library is Lucide (DESIGN.md "Icons"). Writes `manifest/generated/icons.json` (every Lucide name, which rules icon-name and icon-required check the manifest against) and `src/ui/icons.svg` (the sprite of the icons the manifest names: doors, menu anchors, glyphs, elements, keyword icons). | An icon chosen in component code; an inline SVG icon. |
| Lint rules of the contract | `tools/lint/plugin.ts` | The ESLint rules `builder/use-ports`, `builder/no-literal-ui-string`, `builder/use-tokens` and `builder-css/use-tokens` (with `tools/lint/style-values.ts`, the value analysis both token rules share), and the owners of the canvas: `builder/pointer-owner` (pointer, mouse and drag listeners and props only in `src/editor/input/pointer.ts`; a control's onClick is allowed), `builder/gesture-owner` (`store.gesture()` only in the pointer owner, never in a handler) and `builder/frame-owner` (only the renderer writes the canvas iframe's DOM and CSS: `contentDocument`, `contentWindow` and `frames` are reached only by the canvas frame and the coordinates module, which write no DOM or stylesheet, and no other module imports the coordinates functions that hand out the page's elements), `builder/keyboard-owner` (keydown, keyup and keypress listeners and onKeyDown, onKeyUp and onKeyPress props only in the keymap) and `builder/no-manifest-id` (no string that is a CommandId, a DoorId or a PropertyId of `src/generated/ids.ts` written by hand, outside `src/generated/`, the manifest's reader and checker, the command table, the id a handler or predicate registers, a type, and the tests: code reads a command, a door or a property from the manifest's data). | Exceptions outside the owners named above. |
| Panel visibility | `src/editor/workspace/panels.ts` | Which sidebar view is shown, and whether the sidebar, the Layers section, the inspector and each dock tab are open: `workspace.setPanelOpen`, `toggleLeftDock`, `toggleInspector`, `collapseDocks`, `toggleDeveloperTools`. What a panel is (its name, its place, whether it is open at the first start) it reads from `panels` of `layout.json`. `opensEmptyPanel` says whether a door's arguments only open a panel the shell draws no body for (panel bodies). | Sizes, positions, the dock's state or the active tab (layout.ts); the inspector's sections (`src/editor/inspector/sections.ts`); document or selection state. |
| Workspace layout | `src/editor/workspace/layout.ts` | The dock's state (collapsed, open, maximised), the active tab of each tab group, splitter sizes and floating panel positions: `workspace.setWorkbenchState`, `setActiveTab`, `resizeSplitter`, `movePanel`, `reset`. Part 1 builds the dock's state and its active tab. | Which panels are open (panels.ts). |
| Preferences | `src/editor/preferences/preferences.ts` | The UI language and theme, stored and restored after reload. | Document state. |
| Scenario data | `src/manifest/scenario.ts` | The scenario contract's grammar and data: a node path is the node names from the fixture's root, a field follows `/@`; resolving a path to one node, applying a scenario's document diff (node values without ids), the empty project of a fresh profile, and matching the document the test port reads against the expectation. Fixtures are `manifest/features/fixtures/<id>.json`, validated by manifest:check (rule fixture) and loaded only through File › Open. | A second path grammar; a fixture loaded any way but the door. |
| Chords | `src/manifest/chord.ts` | How a shortcut door writes its keys: `normaliseChord` reads a chord (modifiers in a fixed order, a letter in upper case, the named keys), for manifest:check and for the keymap alike. | A second chord parser. |
| Keymap | `src/editor/input/keymap.ts` | The only module that handles keys (lint rule `builder/keyboard-owner`). Runs the shortcut doors of the manifest in their key contexts: reads a key press as a chord, finds its door in the focused context or a context it inherits (`interactions.json`; the page body, where the focus rests after a press on the canvas, is the canvas context), prevents the browser default of a bound chord, and dispatches the door only when it runs by the shortcut rule (`src/editor/input/shortcut-rule.ts`, DESIGN.md "Build order": its command is built and its feature introduces the command or has all its commands built), which the door census and the scenario runner import as it is. A shortcut whose command the focused control's door also runs (a palette tile under Enter) acts on what that control stands for (its `data-args`), and does nothing while that control is disabled. | A second key table; keys that are not doors; a copy of the shortcut rule. |
| The editor state | `src/editor/state.ts` | Composes the editor's part of the store state (`EditorUi`) from the parts panels.ts, layout.ts, preferences.ts, focus.ts, overlays.ts and layers/tree.ts own. | State of its own; document or selection state. |
| Layers folding | `src/editor/layers/tree.ts` | Which branches of the Layers tree are folded (`ui.layers`, in memory only, never an undo step): `layers.setExpanded`; `revealSelection` unfolds every folded branch that hides a selected node when the selection changes. The rows themselves are drawn by `src/editor/shell/sidebar.tsx`. | Document or selection state; saving the folds. |
| The editor store binding | `src/editor/store.ts` | Creates the store with the command table and the editor state, stores the preferences on every change, and exposes the store to React (`useEditorState` over `useSyncExternalStore`). | Holding state in `useState` or `useRef`. |
| Door rendering | `src/editor/doors/door.tsx` | Draws one door as the control its kind and face (`drawnAs`, `icon`) call for, disabled with "not available yet" when its command has the marker, or when the item it stands for arrives with a feature not built yet (a palette entry's `feature`, `isFeatureBuilt`), and unavailable when its predicate says so; `current.ts` says whether a door stands for the current state the store holds, by asking the `current` its command's owner registered; a door whose command is not built stands for none. | Controls that are not doors (except `data-local` ones DESIGN.md lists). |
| Door placement | `src/editor/doors/placement.ts` | The doors and menu buttons of a region, in their order (`layout.json`, `placement`). | Hand-written lists of buttons or menu items. |
| Menus | `src/editor/doors/menu.tsx` | Opens a menu from its button and draws its items, the menu doors in order with their shortcuts, its submenus (shown by CSS while hovered, focused or opened) and, under an open menu, the backdrop door `ui.dismiss#overlay-backdrop`; a menu closes when a dismissal newer than its opening arrives. It has no key or pointer listener: its keys are the doors of the "menu" key context. | Item tables written in code; key or pointer listeners. |
| Keyboard focus | `src/editor/focus/focus.ts` | `focus.next`, `focus.previous`, `focus.first`, `focus.last` and `focus.activate`: the handler records the request in the editor state (`ui.focus`); the owner's installer moves the DOM focus among the items of the region that names the focused key context (its own focusable controls, not those of a region nested in it), or runs the focused item. | Moving the focus from a handler; a region's items listed by hand. |
| Overlays | `src/editor/menus/overlays.ts` | `ui.dismiss`: counts the dismissals in the editor state (`ui.overlays`); an open menu closes when one arrives. | Which menu is open (the menu's own state). |
| The shell regions | `src/editor/shell/shell.tsx` | The window grid and every region of DESIGN.md, one file each under `src/editor/shell/`: top bar (`top-bar.tsx`), activity bar and sidebar views (`sidebar.tsx`), file tabs, canvas toolbar, canvas frame with breakpoint tabs and rulers (`canvas.tsx`), inspector (`inspector.tsx`), dock (`dock.tsx`), status bar (`status-bar.tsx`); `slots.tsx` draws a region's slots in order; `shell.css` styles them from the tokens only. | Drawing a control a door does not declare. |
| Panel bodies | `src/editor/shell/bodies.ts` | Whether a panel has its content: the shell draws a body for it. Read from the tables the bodies are drawn from (`SIDEBAR_VIEWS` in `sidebar.tsx`, `DOCK_TABS` in `dock.tsx`; a section follows its view; the inspector column, the canvas tools and the workbench are the shell's own frame) and handed to the doors by `shell.tsx` (`PanelBodies`): a door whose only effect is to open a panel without a body is not available yet, and the panel says so. | A status of a panel written by hand; a body drawn from outside its table. |

## Concepts of foundation part 2

| Concept | Owner | Responsibility |
|---|---|---|
| Canvas iframe | `src/editor/canvas/frame.tsx` | A same-origin iframe (srcdoc, sandbox without scripts) that only renders: no event handler, no pointer event (`pointer-events: none`); an overlay above it receives every pointer input. Scaled with the standard CSS `zoom`; the renderer mounts the document into it once and then applies each change the store publishes (`subscribeDocument`). |
| Renderer | `src/core/render/render.ts` | The document JSON to the HTML and CSS of the page, the one writer of CSS text from stored values: every element carries `data-node`, every node's rules sit in its own `style[data-node-style]`, breakpoints are max-width media queries, states pseudo-classes. Editor-only, never in the document nor an export: a container below the page root carries `data-container`, and the editor's `style[data-editor-style]` gives an empty one the minimum height of `canvas.emptyContainerMinHeight`. It applies a change's patches to the elements they touch and keeps every other element as it is; it never re-renders the whole page for a change. |
| Coordinates under zoom | `src/editor/canvas/coordinates.ts` | Page, frame and screen coordinates at any zoom (the frame's `currentCSSZoom`, its border and padding, the page's scroll); the element under a screen point and an element's box on the screen, which it hands to the rest of the editor only as a node (`nodeAt`: the node under a point, the page root where no element is) and a node's screen box (`nodeBox`). It only reads the page. |
| Project file | `src/core/project/archive.ts` | File › Open (`project.open`): reads a project document (the fixtures' format) through the browser's file chooser (`useDoor` asks for a command's required `file` argument), refuses one the model rejects or of a newer version, and replaces the document (outcome `load`: selection and history start empty). |
| Pointer input | `src/editor/input/pointer.ts` | The one owner of pointer, mouse and drag input on the canvas (the overlay and the stage around the page). Each press is one gesture of an explicit state machine (idle, pressed, dragging; `drag.threshold` from interactions.json turns a press into a drag); the press's door is found by its data (a canvas click's target, button, count and modifier) and runs, with every door of the gesture, through one transaction the owner opens with `store.gesture()` at the press and commits at the release, or cancels when the browser takes the pointer away: one gesture, one undo step. While a gesture is open the keys are read in the drag key context and run through it. It publishes the hovered node for the canvas chrome, and `modifierOf`, the one reading of the key a click holds, which a panel control drawn for several doors of one gesture (a Layers row: click, Shift+click, Ctrl+click) uses to run the door of that key. |
| Canvas chrome | `src/editor/canvas/chrome.tsx` | What the editor draws over the page, on the canvas overlay, never a pointer target: the outline of every selected node, the primary's label (its name and its exported tag, so the page root reads `body`) placed by the label rule (DESIGN.md "Canvas": above, else inside the top-left corner, else below, never over page text or a replaced element, whose boxes `contentBoxes` of the coordinates module gives); with several selected, the dashed outline of their union and, in place of the name, one label counting them (`canvas.selectedCount`) placed by the same rule on the union; and the thinner outline of the node pointer.ts says is hovered. Boxes come from `nodeBox`, measured each animation frame while something is drawn. | Writing the page; taking pointer events; selection state of its own. |
| Scenario runner | `tools/runner/scenarios.ts` | One Playwright test per scenario and per door (`tests/e2e/scenarios.spec.ts`), for every feature whose commands and scenario doors are built: fixture through File › Open, steps through doors with the real mouse and keyboard, end terminals read through the test port, the frame and the editor. `status.ts` prints each feature's derived status; `tooth.ts` (`npm run e2e:tooth`) reruns each feature with its handlers (and the availability predicates its commands name, held true), or its `toothProof` module, made no-ops by `tooth-plugin.ts` (a Vite plugin active only then) and requires every test to fail. |
| Read-only test port | `src/editor/test-port.ts` | What tests read, in development only (`window.__builderTestPort`, frozen): copies of the document and the selection, the history's undo and redo steps, and the export (null until project-export). It never writes, loads, creates or selects anything. |
| Content model | `src/core/elements/content-model.ts` | Which element may sit inside which, from the permitted content of `manifest/generated/html-elements.json` (loaded by the manifest's runtime, carried by `ModelRules.contentModel`). Slice 1 (palette-click-insert): a parent whose permitted content is a closed list of elements accepts only those (`status.refused.onlyAccepts`); nesting-grammar brings the category rules, required parents and the rest. |

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
| `src/core/project/archive.ts` | `project.save`, `project.open` | part 2: `project.open` (a project document); `project.save` planned |
| `src/core/project/pages.ts` | `pages.add`, `pages.rename`, `pages.duplicate`, `pages.delete`, `pages.switch` | planned |
| `src/core/project/project.ts` | `project.newBlankPage` | planned |
| `src/core/project/recovery.ts` | `project.restoreVersion` | planned |
| `src/core/project/tab-guard.ts` | `project.takeOverEditing` | planned |
| `src/core/selection/selection.ts` | `selection.select`, `selection.clear`, `selection.add`, `selection.toggle`, `selection.walkNextSibling`, `selection.walkPreviousSibling`, `selection.walkParent`, `selection.walkFirstChild`, `selection.selectAllInContainer`, `selection.marquee` | slice 1: `selection.select`, `selection.clear` (predicate `hasSelection`); keyboard-tree-walk: the four `selection.walk*` (same predicate); multi-select-click: `selection.add`, `selection.toggle` (the selection keeps the order the nodes were selected in, the primary first); the others planned |
| `src/core/structure/duplicate.ts` | `element.duplicate` | planned |
| `src/core/structure/hand.ts` | `hand.take`, `hand.aimNext`, `hand.aimPrevious`, `hand.climb`, `hand.descend`, `hand.drop` | planned |
| `src/core/structure/insert.ts` | `element.insert`, `element.createNaturalChild` | slice 1: `element.insert` (palette-click-insert: placed by the selection, named in the person's language through the handler context's `words`, refused where the content model refuses it); `element.createNaturalChild` planned |
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
| `src/editor/focus/focus.ts` | `focus.next`, `focus.previous`, `focus.first`, `focus.last`, `focus.activate`, `focus.nextRegion`, `focus.previousRegion`, `focus.canvas` | slice 1: `focus.next`, `focus.previous`, `focus.first`, `focus.last`, `focus.activate` (their menu shortcuts run; the others wait for their features); the rest planned |
| `src/editor/inspector/number-field.ts` | `field.step`, `field.scrub`, `field.setUnit` | planned |
| `src/editor/inspector/page-properties.ts` | `page.openProperties` | planned |
| `src/editor/inspector/sections.ts` | `inspector.toggleSection`, `inspector.setMode`, `inspector.reveal` | planned |
| `src/editor/inspector/spacing.ts` | `inspector.toggleSpacingLink` | planned |
| `src/editor/inspector/style-target.ts` | `inspector.setStyleTarget` | planned |
| `src/editor/layers/rename.ts` | `layers.startRename` | planned |
| `src/editor/layers/tree.ts` | `layers.setExpanded`, `layers.collapseAll`, `layers.expandAll`, `layers.expandOrFocusChild`, `layers.collapseOrFocusParent`, `layers.setRowDetails` | slice 1: `layers.setExpanded` (the others planned) |
| `src/editor/menus/context-menu.ts` | `contextMenu.open` | planned |
| `src/editor/menus/overlays.ts` | `ui.dismiss` | slice 1 (Escape in a menu and the backdrop run; the command bar's and the dialog's doors wait for their features) |
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
