# Progress

Handoff notes between sessions. Newest entry first.

## 2026-09-24 — Run: scenario contract, visual pass, foundation part 2, group 02

Why: part 1 is verified by the auditor at 380745b. This run goes by checkpoints in one session: each step committed, pushed and reviewed as it lands. The auditor writes the scenarios and fixtures of groups 01 and 02 under `manifest/features/` in the same folder and branch; the builder never edits them and commits only its own files with `git commit --only`.

Done:
0. The scenario contract (schema, manifest:check, loader, tests and plants; the auditor writes the data):
   - Fixtures are data: `manifest/features/fixtures/<id>.json`, each a project document of `src/core/document/model.ts`. The loader reads them with the manifest; rule `fixture` validates each with `validateDocument` and fails on a `setup.fixture` without a file. `empty` is a fresh profile's empty project, built with the names of the scenario's locale (Home/Page, Início/Página), and has no file. A fixture reaches the app only through File › Open (`project.open`, built in part 2 as runner infrastructure).
   - Steps: a scenario has `steps` (door, args, target, drop, action), run in order after the fixture loads; exactly one is the action step, and `doors` lists the alternative doors for it, each a door of the action step's command (rule `step`, which also checks every argument against the command's declared arguments: palette entries, enum values, node paths, properties…). Door references in steps are checked like the scenario's doors (rule `door-unknown-command`). Rule `door-coverage`: once a feature has scenarios, every door whose feature it is runs in one of them.
   - Paths: `src/manifest/scenario.ts` owns the grammar. A node path is the node names from the fixture's root (`/Page/Section`), each naming exactly one node; a field follows `/@` (`/Page/Section/@styles/desktop/base/padding-top`). A node value in `expect.document` omits id and its children array gives their order; a new node appears through its parent's value or `@children`. Rule `document-path` resolves setup paths in the fixture, applies the diff (refusing a node value with an id, an unknown field, a removed root, a key that is not there), validates the result against the model, resolves every expectation after the diff and every step path in the fixture or the result.
   - Editor terminals: `expect.editor` (regions of layout.json measured alone or against another region, and computed styles of regions) and `expect.persistence.preferences` beside `document`; rule `scenario-terminal` counts both; unknown regions fail `unknown-reference`.
   - Tooth proof without commands: optional `toothProof` on a feature names the module the tooth proof replaces with a no-op; rule `tooth-proof` requires it of a feature with scenarios and no commands, refuses it on a feature with commands, and requires the module to be one ARCHITECTURE.md names.
   - `status.placed` ("Placed {element} in {parent}, position {position} of {count}." / "{element} colocado em {parent}, posição {position} de {count}.") is in both catalogues.
   - Plants (each fails on its own rule only): `fixture-file-missing`, `fixture-breaks-model`, `setup-path-not-in-fixture`, `expect-path-removed-by-diff`, `diff-path-unresolved`, `diff-node-value-with-id`, `step-target-unresolved`, `step-argument-unknown`, `two-action-steps`, `door-in-no-scenario`, `editor-terminal-without-measure`, `persistence-of-nothing`, `editor-region-unknown`, `tooth-proof-without-module`, `tooth-proof-module-unknown`; the older scenario plants now build on two planted delete-element scenarios that together run all three of its doors. Positive tests: an editor-only and a preferences-only terminal pass; the empty project resolves `/Página` in pt-BR and `/Page` in English; a step inserting the palette entry `heading` into `/Page/Section` passes and one naming `banner` fails.

   - Follow-up (the auditor's findings on c703a3b, with the user's decisions it relayed; one commit before item 1 continued): steps gain `hold` (a drag held across the next steps, ended by a release on the same drag door with target null, drop null and hold false, or by drag.cancel) and `type` (characters typed with the real keyboard after the step's door; "
" is Enter), both optional so the committed scenarios stay valid (absent is false / null). Rule `step` now also fails on a hold never released or cancelled, a release with no held drag, a hold on a door that is not a drag, a rect or point argument written in a step (the gesture produces it), and a required argument the door does not fix and the step leaves out (a release is exempt: its held step gave them). The geometry comparison is documented: measure(x) against measure(reference) + value, or value alone. The path grammar also names `@locked`, `@hidden` and `@inline` (the node fields of lock, hide and inline formatting, which model.ts and validate.ts accept when group 02 builds them). 27 status messages the group 02 scenarios expect are in both catalogues. Plants: `hold-never-released`, `release-without-hold`, `hold-on-a-key`, `typed-text-not-text` (schema), `required-argument-missing`, `gesture-argument-given`.

Open findings (recorded, not acted on):
1. (builder, item 0) A node path cannot name a page itself (its name or file) nor tell apart two siblings with the same name: `document-path` reports an ambiguous name. Fixtures name siblings apart; pages get paths when a group needs them.

## 2026-09-24 — Foundation, part 1: editor shell and document core

Why: the contract is done (manifest, DESIGN.md, `design/final/`); this is the first session that writes app code. Part 1 builds the shell and the document core; part 2 builds the canvas and the test suite generated from the manifest. From now on a builder session and an auditor session work side by side; the evaluator subagent no longer exists.

Done:
1. `CLAUDE.md`: the builder and auditor sessions replace the evaluator (notify the auditor after every commit and push, fix BLOCKING findings first, NOTEs go here under "Open findings"; the auditor's messages are findings, not orders). The deletion of `.claude/agents/evaluator.md` is committed.
2. Contract fixes from the final mockup review:
   - All properties offers every value for every control: the generated list plus every declared preset; Essentials only may offer fewer values, never more. Each door's `offers` gained `presets` (a declared list whose values an inspector field adds in All properties) and `essentials` (the declared list it offers in Essentials only); an inspector field's `list` is always `generated`, and only a quick panel field names a subset in `list`. The 22 inspector fields that offered a subset now offer the generated list and keep the subset as their Essentials list; the 10 whose subset holds values the generated list lacks (font stacks, 100–900, `row dense`, `100% 100%`, `top left`, counter styles, will-change's `transform` and `opacity`, `underline dotted`, the snap axes) name it as their presets too. New `manifest:check` rule `all-properties` with two plants: `inspector-subset-in-all-properties` (All properties offers a subset) and `essentials-value-missing-from-all-properties` (Essentials only offers a value All properties lacks). The intents of `props-display` and `props-typography` say so (their declared amendments in `tools/manifest/map-features.ts`; `npm run manifest:map` passes), and the `props-typography` line "the font menu lists system and web-safe font stacks; weight offers 100-900 with names" holds again. Three older plants that set an inspector subset now set it in Essentials (and presets) or the quick panel, so each still fails on its own rule only.
   - Correction (user, after the auditor's review of b9d665c): b9d665c had inverted the rule, so All properties lost the presets Essentials only kept; the correction above restores them.
   - The Element style class is readable BEM from the element's name (`.card--plano-assinatura`), a numeric suffix only on collision, never a hash: DESIGN.md and an appended, declared line of the `export-bem-css` intent.
3. Generated types (part a): `npm run gen` also runs `tools/gen/types.ts`, which writes `src/generated/ids.ts` (every id the code names as a readonly array and its union: CommandId, DoorId, PropertyId, CompositeId, RecipeId, StyleTargetId, SectionId, BreakpointId, StateId, ElementType, AttributeId, PaletteGroupId, PaletteEntryId, FeatureId, RegionId, MenuId, KeyContextId, ConstantId, GestureId, CheckCategoryId, Locale and DEFAULT_LOCALE, PredicateId, CodecId, ActionId, MessageId from the English catalogue), `src/generated/commands.ts` (each command's arguments, typed from its manifest args) and `src/generated/value-lists.ts` (the keywords and units every "generated" list offers, computed with `generatedOffer`/`generatedUnits`, so the editor never ships css-compat.json). `gen:check` covers `src/generated/`, and fails on a file there that the generator does not write. `tools/gen/types.ts` reads the manifest through `tools/manifest/load.ts`.
   Registry (part b): `src/core/commands/registry.ts` is the contract: `CommandTable<Ui>` has a key for every generated CommandId; an entry is a handler made with `registerHandler('<id>', …)` (typed with the command's generated arguments) or `NOT_AVAILABLE_YET`; `registerPredicate` for availability predicates. `src/app/commands.ts` is the one table (218 entries, `satisfies CommandTable`), with the predicate table. `src/app/commands.typecheck.ts` proves with expect-error lines that a table missing `history.undo`, one with an unknown command, and one with `history.redo`'s handler under `history.undo` are type errors. Deleting `'history.redo'` from the real table makes `npm run typecheck` fail (TS1360 "Property "history.redo" is missing … does not satisfy the expected type 'CommandTable<never>'", exit 2).
4. The document core, plain TypeScript (no React):
   - Ports: `src/core/ports/clock.ts` (`Clock`, `systemClock`, `manualClock` for tests) and `src/core/ports/ids.ts` (`IdGenerator`, `randomIds`, `sequentialIds`). ESLint rule `builder/use-ports` (`tools/lint/plugin.ts`) fails on `Date.now`, `new Date()`, `Date()`, `Math.random` and `randomUUID` anywhere in `src/` except those two files; a planted file with all four failed `npm run verify:fast` at lint (4 errors, exit 1) and was removed.
   - `src/core/document/model.ts`: the document JSON (pages with a node tree; each node its element type, name, tag, attributes, classes, styles by breakpoint and state, text, children), typed with the generated ids; the empty project; `locate` (a node's page, parent, index and JSON path).
   - `src/core/document/validate.ts`: whole-tree validation against the model and the manifest (unique ids, element types and their tags, text versus children by the element's content, attributes that exist and apply, class names, breakpoints, states and edited properties, page files, the selection). The HTML content model stays with `src/core/elements/content-model.ts` (planned).
   - `src/core/history/transaction.ts`: JSON patches (add, remove, replace) applied without changing the input (only the containers on the path are copied, and a key such as `__proto__` is an ordinary property), with their inverses; a patch that changes nothing is dropped.
   - `src/core/history/history.ts`: the undo and redo stacks, coalescing by key within the manifest constant, `undo`/`redo` (document and selection from before, or after, the command), the handlers of `history.undo` and `history.redo` and the predicates `canUndo`, `canRedo`. New catalogue keys `status.undone` "Undone" / "Desfeito" and `status.redone` "Redone" / "Refeito" (spec undo-redo, Problems 2).
   - `src/core/store/store.ts`: `createStore` with `dispatch`, `gesture()` (one transaction and one entry per gesture; cancel restores) and `subscribe`. Dispatch checks the availability predicate, runs the handler, applies its patches, validates the whole tree (an invalid state throws `InvalidStateError` and is never committed), records an entry only when an undoable command changed the document, throws when a command the manifest declares not undoable changes it, and deep-freezes every committed state when `freeze` is on. Building a store fails when a built command's predicate is not registered.
   - `references.json`: the handlers `history.undo`, `history.redo` and the predicates `always`, `canUndo`, `canRedo` are registered.
   - Tests (Vitest and fast-check): `transaction.test.ts` (unit, and a property over random JSON trees and valid patches: the input never changes and the inverses restore it exactly), `validate.test.ts` (each rule catches its defect), `store.test.ts` (unit: marker, refusal, transaction contents, undo and redo selection, no entry without change, redo emptied, invalid state, non-undoable change, deep freeze, coalescing within `history.nudgeBurstWindow`, gestures, cancel, predicates, subscribers; and a property over random sequences of inserts, renames, deletes, selections, no-op commands, undos and redos against an oracle of every state along the history). The test handlers stand in for real command ids so the manifest's history declarations apply; they live in the test file, so manifest:check never counts them as registered.
Door icons (the user's request before item 5): the manifest names every icon the shell draws, from one library.
   - The library is Lucide (`lucide-static` 1.48.0, ISC, dev dependency), registered in DESIGN.md "Icons". design/final's own sprite (123 symbols, drawn in Lucide's style) lacks 40 of the 61 element icons and Bold and Italic, so it cannot serve the whole editor; each of its symbols maps to the Lucide icon of the same drawing (the table is in DESIGN.md).
   - Schema: every door has `icon` (a Lucide name or null); toolbar and panel-control doors have `drawnAs` (icon-button, button, segment, tab, item, field, toggle, area, disclosure); menu anchors in `layout.json` have `drawnAs` and `icon`; `layout.json` has `glyphs` (dropdown, submenu, expanded, collapsed, checked, folder, sizeVariable) and `panels` (each panel's icon, for its dock tab and palette entry); every property has `icons` (keyword → icon; Direction and Text align are drawn as icon buttons); element icons in `elements.json` are Lucide names. The sprite carries Lucide's licence (ISC, and MIT for the Feather-derived icons) in its `<metadata>`.
   - The data: a one-off script measured every door design/final draws in its 12 states and 2 views with Playwright on Chrome (174 doors: element, classes, icons, text) and took each drawn door's icon and drawing from there; a menu, context-menu, palette or quick panel item the mockup does not draw takes the icon the mockup draws for the same command with the same arguments; the other toolbar and panel controls (dialogs, the preview bar, the parts editors, the Explorer's row actions) take the icon the mockup uses for the same act. 200 doors show an icon; 137 icons are named in all.
   - `npm run gen` (`tools/gen/icons.ts`) writes `manifest/generated/icons.json` (the 1854 Lucide names, with the package version in its header, so gen:check names a version bump) and `src/ui/icons.svg` (the sprite of the 137 named icons). gen:check covers both.
   - New `manifest:check` rules: `icon-name` (plant `icon-not-in-library`) and `icon-required` (plants `toolbar-door-without-icon` and `panel-button-without-icon`); icon-required also refuses an icon on a key, a gesture or a disclosure, a panel without an icon, and an offered keyword without its icon on a keyword-buttons field drawn with icons.
   - Before this commit the auditor warned (pre-commit, measured on design/final's markup) that: some drawn icons had no data (quick panel More actions and Effects, the dock tabs, Explorer folders, the size variable, the radius editor, gradient add, interaction scope, the palette's open-panel entries); the disclosure caret had two owners (door icons and the glyphs); text-only controls had gained icons; Make child of previous layer used the submenu's chevron; the scratch scripts must not be committed; the sprite lacked the licence notice. All are resolved in this commit as described in DESIGN.md "Icons" (the scratch scripts are deleted).
6. i18n runtime and the lint rules for tokens and UI text (built by a helper agent the user authorized, in its own git worktree; reviewed, adjusted and committed by the builder):
   - `src/i18n/index.ts`: `translate(locale, key, params)`, `translator(locale)`, `formatMessage` (throws on a placeholder without a value), `isLocale`; both catalogues typed by the keys of en.json; no fallback (a missing text throws, naming the key and the locale). The helper's version also kept an active locale in the module with listeners; the builder removed it, because the UI language is a preference in the store and a second holder of it would be state outside the store. `src/i18n/en.ts` is deleted.
   - Lint (`tools/lint/plugin.ts`, `tools/lint/style-values.ts`, `eslint.config.js`): `builder-css/use-tokens` for every stylesheet under src/ except the generated tokens.css (literal colours; px/rem/em lengths in spacing, inset, sizes, radius and shadows; literal font values; a `var()` of a custom property neither tokens.css nor the stylesheet defines), `builder/use-tokens` for React style objects (the same, including bare numbers React writes in px), `builder/no-literal-ui-string` (JSX text with a letter or digit, literal text in a JSX expression, and literal title, aria-label, aria-description, aria-roledescription, aria-placeholder, aria-valuetext, placeholder, alt, label). The JS/TS rule sets are scoped to script files so the CSS language can run; `--print-config` showed no existing rule changed. 58 RuleTester cases in `tools/lint/plugin.test.ts`.
   - Planted violations run on the main tree before the commit, each failing `npm run verify:fast` at lint with exit 1, then removed: `src/ui/planted-literal.css` (4 errors: `#ff0000`, `12px` padding, `14px` font-size, `var(--not-a-token)`) and `src/ui/planted-ui-string.tsx` (3 errors: literal title, literal inline colour, literal JSX text).
   - `src/editor/app.css` (the interim page, replaced by the shell in item 5) now reads tokens, and `src/main.tsx` loads `src/ui/tokens.css`. `@eslint/core` and `@typescript-eslint/utils`, whose types the plugin imports, are declared dev dependencies. ESLint ignores `.claude/` (agents' worktrees).
8. `ARCHITECTURE.md`: the owner, responsibility and "never" of every concept of part 1; the part 2 concepts (canvas iframe, renderer, coordinates under zoom, pointer input, test suite from the manifest) as planned with their future paths; the table "Command owners" with the owner module of all 218 commands (88 modules, 4 of them built in part 1). New `manifest:check` rule `owner` (reads ARCHITECTURE.md through `tools/manifest/load.ts`): a command's owner in the manifest must be the module the table names for it, every command has exactly one row, and every command in the table exists; plant `owner-differs-from-architecture`.
7. Test speed: `loadManifest` reads the generated files once and deep-freezes them; `planted()` copies only the hand-written files and shares the generated ones; a plant that changes generated data copies only the objects on its path (`ownGenerated` in `tools/manifest/plants.ts`); `checkManifest` parses a frozen file once (a WeakMap in `src/manifest/check.ts`). The manifest tests went from 20 s to 6 s; a test locks the sharing.
5. The editor shell in React (`src/editor/`), from DESIGN.md and `design/final/`, tokens only (`src/editor/shell/shell.css`; lint passes), every text from the catalogues:
   - Regions: top bar (the product mark from `src/config/product.ts`, the five menus, page switcher, Commands, undo and redo, Preview, Export), activity bar and the Explorer (Pages, Files, Layers), Insert and Styles views, file tabs, canvas toolbar (Canvas/Split/Code, tools, zoom), rulers, breakpoint tabs, the empty frame at the zoom that fits it, the inspector (tabs, "Nothing selected", Apply a class, state and breakpoint, legend, Essentials only / All properties, search, every section and field of the style tab), the dock strip (Timeline and Checks) and the status bar (message, breakpoint, element count, zoom, language). `src/editor/app.css` is deleted.
   - Every button, menu item, shortcut, field and handle comes from a door of the manifest, placed by `src/editor/doors/placement.ts` in the regions and order of `layout.json`, drawn by `src/editor/doors/door.tsx` as its `drawnAs` with its `icon` from the sprite; menus by `src/editor/doors/menu.tsx`; keys by `src/editor/input/keymap.ts` (the shortcut doors in their key contexts, and the browser default of every bound chord prevented). A door whose command is `NOT_AVAILABLE_YET` is disabled with "not available yet" (in its title and in menus), whatever its predicate says; a built door whose predicate does not hold is disabled with its own reason (`disabledReasonKey`: undo and redo say "Nothing to undo" and "Nothing to redo"). Checked on the running app with a scratch script (not committed) that opened every menu and submenu: 317 doors drawn, 26 enabled, all of them doors of the seven built UI commands; every door of a command not built says "not available yet"; the only built doors disabled are undo and redo (empty history).
   - Built commands, each a `registerHandler` in its owner module and registered in `references.json`: `workspace.setPanelOpen`, `toggleLeftDock` (Ctrl+B), `toggleInspector` (Ctrl+Alt+B), `collapseDocks` (Ctrl+\, restores exactly what was open) in `src/editor/workspace/panels.ts`; `workspace.setWorkbenchState` in `layout.ts`; `preferences.setLanguage` and `setTheme` in `src/editor/preferences/preferences.ts` (stored in localStorage, restored after reload, a stored value that is not a manifest locale or theme ignored); undo and redo from the core. Each change of a panel says so in the status bar (spec dock-toggles, Problems 1). The editor state (`src/editor/state.ts`) lives in the one store; `src/editor/store.ts` binds it to React with `useSyncExternalStore`. The only `useState` are a menu's own open state and two layout measures, the stage size and the zoom that fits the frame (the camera comes with the canvas); every `useRef` holds a DOM element.
   - `manifest:check` read a registration only without type arguments, so `registerHandler<'id', EditorUi>('id', …)` passed as unregistered. The regex now accepts type arguments (`registrationsIn` in `tools/manifest/load.ts`, with a test). Chords had two parsers (the checker's and the keymap's); `src/manifest/chord.ts` is now the one owner. Plural texts: `pluralForm(locale, count)` in `src/i18n/index.ts` chooses a key's `.one` or `.other` text (`status.elementCount.one` "1 element").
   - Tests: `src/editor/workspace/workspace.test.ts` (panels, dock, preferences and their storage), `src/editor/input/keymap.test.ts` (key presses as chords, context inheritance: a field keeps its keys and text editing's Ctrl+B is Bold), and `tests/e2e/shell.spec.ts` on Chrome with the real keyboard and mouse: Ctrl+B and Ctrl+Alt+B give their columns to the canvas and take them back (geometry), Ctrl+\ collapses and restores exactly (geometry), View › Workbench opens the dock under the canvas (geometry), View › Theme › Dark repaints (computed style) and holds after reload (storage), the language menu switches to Portuguese and holds after reload (storage, `lang`, the View menu reads "Exibir").
   - Differences from `design/final/shots/1440-01-default.png` that wait for their features: no document content, selection, file tree, file tabs beyond the page, save state, checks count or selection breadcrumb; the inspector shows its fields empty with nothing selected; no door of a command not built yet looks selected (the Canvas segment, the Desktop frame tab, the Style tab, All properties), because no store holds that state yet.
   - After the auditor's review of 048f4a5 (three BLOCKING findings, fixed in the next commit): (1) `src/editor/doors/current.ts` no longer shows a current state for commands not built (the Canvas view, the base breakpoint, the Style tab, two columns, All properties were values written in code); `useDoor` asks it only for a built command. (2) `preferences.ts` reads the themes from `preferences.setTheme`'s arguments in the manifest instead of re-listing them. (3) Each panel's name, place (`sidebar`, `section` with the sidebar view it belongs to in `in`, `inspector`, `canvas-toolbar`, `workbench`, `dock`) and whether it is open at the first start are now data in `panels` of `layout.json`, beside its icon; `panels.ts` and `layout.ts` read them (no SIDEBAR_VIEWS, DOCK_TABS, PANEL_LABELS or initial tabs in code), the dock's active tab moved to `layout.ts` (the owner of active tabs), and the shell names panels through `panelName`. New `manifest:check` rule `panel` (every panel of `workspace.setPanelOpen` declared and nothing else; one sidebar view open at the first start; a section, and only a section, names its sidebar view), with the plants `panel-missing-from-layout` and `two-sidebar-views-open`. The auditor's NOTE 4 is fixed too: the inspector's fields take their disabled state from the door (`useDoor`'s availability), so they turn on when `style.set` is built. `.claude/launch.json` starts the dev server for the browser pane with `autoPort` (the port comes from `PORT`).

Open findings (recorded, not acted on):
1. (auditor, afd1f5a, NOTE) The 2026-09-24 "features.json converted" entry below still says `.claude/agents/evaluator.md` describes the workflow; that file is deleted.
2. (auditor, afd1f5a, NOTE) `manifest/features/04-inspector.json` (the `color-picker` intent) says "evaluator checks the diff"; there is no evaluator any more. Intent lines change only as declared amendments.
3. (auditor, afd1f5a, NOTE) CLAUDE.md asks for raw outputs (tooth proof, tests) without saying where they go: the auditor gets a hash and reads `git show`, so those outputs never reach it, and nothing replaces the evaluator's own runs of verify:fast, e2e and the browser check. Either send the raw outputs with each notification or record them where the commit carries them.
4. All properties now offers the whole generated list, including values the old subsets left out with a reason: display's table-internal values, break-before/after `all`, `region`, `avoid-region` (the reason says they act on CSS Regions, which no browser implements, though css-compat.json keeps them), text-decoration's colour keywords and `spelling-error`/`grammar-error`, font-variant's full list. If some values should leave All properties, the browser data (css-compat.json) must say so, not a menu subset.
5. (auditor, b9d665c, NOTE) All properties offered less than Essentials only (font stacks, 100–900, the background-size, transform-origin and will-change presets), and the `props-typography` intent line "the font menu lists system and web-safe font stacks; weight offers 100-900 with names" could not be met. Fixed by the user's correction (presets in All properties).
6. (auditor, b9d665c, NOTE) A property with a value set also shows in Essentials only (`inspector-advanced-mode` intent); nothing says what that field offers when the value was set in All properties and is outside its Essentials list (for example `display: table-cell`).
7. (auditor, b9d665c, NOTE) "verify:fast exit 0 (83 tests)" was a summary, not raw output, and manifest:check on the real manifest was not shown; the auditor could not rerun at b9d665c because the tree had staged changes. From now on every message to the auditor carries the raw last 30 lines of every command it claims, for that commit (user's instruction), and unfinished work is stashed before a commit so the tree is clean.
8. (auditor, 1404fdd, NOTE) `parseFile` in `src/manifest/check.ts` cached by the parsed object alone, not by the pair of schema and object; a frozen object parsed with a second schema would get the first schema's result. Fixed with item 8: the cache is keyed by schema, then object.
9. (auditor, 3b01215, NOTE) ARCHITECTURE.md says the manifest names the icon of each door with a control, but no door schema has an icon field; if the shell picks door icons in code, those doors are not generated from the manifest. It becomes BLOCKING if icons are drawn before the data exists. Plan: the door icons become manifest data before the shell draws any.
10. (auditor, 3b01215, NOTE) panels.ts claimed "sections" and open dock tabs while the table gives setActiveTab, resizeSplitter, movePanel and reset to layout.ts; the active tab, sizes and positions had no concept line, and "sections" overlapped `src/editor/inspector/sections.ts`. Fixed in ARCHITECTURE.md: panels.ts owns visibility, layout.ts owns the dock state, active tabs, sizes and positions.
11. (auditor, 3b01215, NOTE) registry.ts and `src/app/commands.ts` both read as per-command maps. Fixed in ARCHITECTURE.md: registry.ts is the contract and holds no entries; `src/app/commands.ts` is the one map.
12. (auditor, 3b01215, NOTE) The read-only test port had no owner line. Added as planned for part 2 (`src/editor/test-port.ts`).
13. (auditor, 6391196, NOTE) gen:check caught only a changed or untracked file in `src/generated/`: a committed hand-made file passed. Fixed: gen:check fails on any file there that the generator does not write (planted `src/generated/extra.ts`: "✗ src/generated/extra.ts is not written by npm run gen", exit 1).
14. (auditor, 6391196, NOTE) `tools/gen/types.ts` had its own reader of the manifest beside `tools/manifest/load.ts`. Fixed: it reads through `loadManifest`.
15. (auditor, 6391196, NOTE) ARCHITECTURE.md named the union "DoorRef"; the generated type is `DoorId`. Fixed.
17. (auditor, 9cbe45e, NOTE) A nudge burst merges across a command that records no entry (selection.select of the same node, a zoom, a refused command), because only the last history entry is compared; spec/behavior/absolute-nudge.md requires "no other command in between". Fixed: the store merges only when the previous dispatch recorded the same coalescing key; any other dispatch in between, even one that records nothing or is not available yet, starts a new entry (test "never merges moves when another command came in between").
18. (auditor, 9cbe45e, NOTE) consumers.json names history.ts as the reader of history.coalesce and history.transaction, but the store reads coalesce and nothing reads transaction: a per-dispatch command dispatched inside a gesture is folded into the gesture's entry and nothing refuses it. Fixed: the store reads history.transaction and throws when an undoable per-dispatch command runs inside a gesture; consumers.json names src/core/store/store.ts as the reader of both fields.
19. (auditor, 9cbe45e, NOTE) model.ts hard-codes the page root's tag "body" and validate.ts the root type "page"; the tag is manifest data (elements.json). Fixed: `rulesFromManifest` takes the root from elements.json (the element whose tag is body, its id and tag) and `createEmptyDocument` builds the root from it.
20. (auditor, 9cbe45e, NOTE) builder/use-ports misses performance.now(), crypto.getRandomValues() and destructured reads (const { now } = Date). Fixed after item 6 landed: the rule catches performance.now, crypto.getRandomValues, computed members (Math['random']) and destructuring from Date, performance, Math and crypto; 19 RuleTester cases; a planted file with the three new reads failed verify:fast at lint with exit 1.
22. (auditor, 4627366, NOTE) builder/no-literal-ui-string runs only on src/**/*.tsx, so UI text written in a plain .ts module (a message, a label table, a string handed to the DOM) passes. Either extend the rule to the UI text sinks of .ts files or keep UI-producing code in .tsx and say so in ARCHITECTURE.md.
21. (auditor, 5ef6fcf, NOTE) The message for 5ef6fcf carried three lines of the verify:fast tail and "the 26 lines above are unchanged", which the auditor cannot check. Every message now carries the full last 30 lines of every command it claims.
23. (builder, item 5) DESIGN.md "Build order" says that before `explorer-pages` the Explorer view shows only Layers; the part 1 brief asks for the shell of `design/final/` with every door drawn. The shell follows the brief: the Pages and Files sections are drawn and their doors are disabled with "not available yet". The user decides whether they stay hidden until `explorer-pages`.
24. (builder, item 5) CLAUDE.md and DESIGN.md disable a door until its *feature* is built; feature status comes only from the runner, which part 2 builds. Part 1 therefore decides per command, as the brief says (enabled only when its command is built). Doors of features not built yet whose command is built are enabled: the activity bar's Insert (`palette-click-insert`), View › Elements, Variables, Timeline, Checks and Help › Keyboard shortcuts open their panel, which says "not available yet" or is empty. When the runner lands, the door's availability should read the feature status.
25. (auditor, 048f4a5, NOTE) How a control is drawn is partly decided in code instead of data: `inspector.tsx`'s ACTION regex makes a field an action button from its control id, and `door.tsx` `isToggle` names two command ids although `drawnAs` has `toggle`.
26. (auditor, 048f4a5, NOTE) `src/editor/shell/canvas.tsx` RULER_STEP = 200 is a design constant in code; the constants belong in interactions.json.
27. (auditor, 048f4a5, NOTE) `inspector.tsx` BoxModel names margin-top … padding-left and the composites margin and padding in code to place the sides of the box model.
28. (auditor, 048f4a5, NOTE 4, fixed) The inspector's fields were drawn disabled unconditionally, not from the door's built and available state; fixed with the BLOCKING findings.
29. (auditor, 380745b, NOTE) design/final draws `classes.apply#inspector-class-add` with the text "+ Class" (key `inspector.addClass`) and the tooltip "Apply a class", but the shell's button reads "Apply a class". A control's short face text must be door data, not chosen in code.
30. (auditor, 380745b, OK) The auditor verified part 1 on the clean tree at 380745b: verify:fast exit 0 (231 tests), e2e 6/6 exit 0, and at 1440 × 900 every region measures as DESIGN.md says (top bar 40, activity bar 40, sidebar 224, inspector 288, file tabs 34, canvas toolbar 36, ruler 20, frame tabs 28, dock strip 28, status bar 24; canvas area 888 wide, frame 24 px from the ruler); only built commands' doors are enabled.
16. Items 3 and 4 were committed as 6391196 (generated types) and the next commit (registry, command table and the core): the registry's handler contract uses the store's types, so it could not land before the core.

## 2026-09-24 — Final interface: DESIGN.md, the combined mockup, every door placed

Why: the user chose direction A "classic refined" combined with direction C "studio" (only B's canvas behaviour kept) and corrected the UI language rule: everything on disk is English and the UI language is switchable, so English is the source and default UI language. This session turned the choice into the interface contract and placed every door of the manifest, so the builder never invents where a control lives. No app code.

Done:
- UI language: English is the default everywhere it is declared: `CLAUDE.md`, `manifest/environment.json` (`default: en`, available `en`, `pt-BR`), the `ui-language` intent (title, one step and one expected line, declared amendments in `tools/manifest/map-features.ts`, which now accepts title amendments; `npm run manifest:map` passes), and `spec/behavior/shortcuts-panel.md`.
- `DESIGN.md`: the regions and what each holds in order, the placement rule of every door kind, menu anchors, the canvas (breakpoints belong to the page, states to the element, views, overlays, the label rule, the quick panel, the refined requirement 7), the inspector (tabs, selector bar, legend, Essentials / All, search, sections, the Element export rule), generated versus user files, file tabs and code, the dock, the keyboard model, the glossary in both languages, the UI language rule, density and tokens.
- `manifest/layout.json` (schema `layoutFileSchema`): 51 regions (fixed, overlays, menus, and component regions for the parts of repeated controls) and the button of each of the 12 menus, with its label key and anchors. Every door now has a placement: 630 placed in regions, 228 keys and pointer gestures with `none`. `manifest:check` prints the count per region.
- `manifest/checks.json` (new): the categories of the Checks tab (accessibility, links, SEO, export), each with its label and the feature that brings it. `properties.json` breakpoints gained `base` (the first, and only it; the list is the cascade order).
- New `manifest:check` rules, each with a planted fixture that fails on that rule alone (`tools/manifest/plants.ts`, locked by `tools/manifest/check.test.ts`):
  - `placement`: a door still unplaced, a key or gesture given a place, an unknown region, a menu item outside its menu, a menu without an anchor, two controls in one position of a region (plant `door-unplaced`);
  - `state-placement`: a control that chooses a style state on the canvas frame or the canvas toolbar, or its menu opening from there (plant `state-door-on-canvas-toolbar`);
  - `label-term`: one label, in either language, naming two CSS properties, or a glossary concept whose property is labelled other than its term (plant `label-names-two-properties`, pt-BR "Preenchimento" for gap).
  Three older plants that reused another property's label now plant a label of their own, so each still fails on its own rule only.
- `src/i18n/glossary.json`: 10 concepts (margin, padding, gap, background, fill, stroke, border, radius, outline, opacity) with their term in both languages. Labels changed to one term per concept: pt-BR Padding (was Preenchimento), Gap (was Espaçamento), Fundo for background-color, Preenchimento for the SVG fill only, Tamanho base for flex-basis (Base was also bottom); English Background (was Background colour), Text direction, Text columns, Column balancing (column-fill), Gradient. The palette's export command reads "Export project (ZIP)" (key `command.exportPage` kept, because intents cite it).
- Doors (resolved findings and the chosen interface):
  - `commandBar.open`: Ctrl+Shift+K in the global and the text-editing contexts (text editing does not inherit global keys; there Ctrl+K stays the link), and the top bar search button.
  - `view.setBreakpoint`: the four top-bar doors are now the breakpoint tabs on the frame (`toolbar-breakpoint-tabs-*`).
  - `view.setEditorView` (new, introduced by `code-panel-view`): Canvas / Split / Code on the canvas toolbar; View > Code moved here (Split). `workspace.setPanelOpen` no longer has the panel `code`.
  - File tabs: `pages.switch#file-tab`, `files.open#file-tab`, and `files.closeTab` (new, introduced by `explorer-file-system`). Top bar page switcher `pages.switch#toolbar-top-bar-page-switcher`.
  - `interactions.update#inspector-interaction-scope`: whether an interaction applies to this element or to its class.
  - The inspector's tabs Style, Settings, Interactions (`workspace.setActiveTab#inspector-tab-*`).
  - The activity bar: Explorer, Insert, Styles (`workspace.setPanelOpen#toolbar-activity-bar-*`); the Layers toggle is the Layers section header; snap and the canvas-tools toggle moved to the canvas toolbar.
  - The floating text toolbar: Bold, Italic, Link (`toolbar-text-toolbar-*`).
  - The top bar has no page properties any more (`page.openProperties#toolbar-top-bar-page` removed; the inspector header and the palette open them), as the brief lists the top bar.
  - Quick panel: Background (`background-color`) and Fill (SVG `fill` only) are two fields; font, weight, line height, letter spacing, text align, skew X and skew Y are new quick panel fields (`quick-panel` lists `style.setTransform`).
  - No door placed a state control on the canvas frame or the canvas toolbar (they were all unplaced or in `menu:style-state`), so none was removed; `state-placement` now keeps it so.
- Build order: `workspace.setPanelOpen` is introduced by `editor-shell` (the activity bar's Insert and Explorer arrive with `palette-click-insert` and `layers-tree`), `workspace.setActiveTab` by `inspector-panel` (the Settings tab holds the content and attribute fields).
- `design/final/`:
  - `index.html`: the combined interface in English, 12 states (default, hover, selection, drag, multi, breakpoint, state, text, interaction, palette, menu, context), the Split view, light and dark, English and pt-BR read from the real catalogues. Every control carries `data-door` or `data-menu` inside its `data-region`. `canvas.css`: the overlays.
  - `tokens.json` (DTCG, light and dark). `npm run gen` builds `src/ui/tokens.css` from it with Style Dictionary 5.5.5 (`tools/gen/tokens.ts`); `gen:check` covers the file. The mockup reads that CSS, so editing the tokens changes the mockup.
  - `shots/`: `1440-01-default.png` … `1440-12-context.png`, `1440-13-split.png`, `1440-01-default-pt-BR.png`, `1440-01-default-dark.png`, `1920-01-default.png`.
  - `npm run design:shots` (`tools/design/shots.ts`) writes the shots and checks each one: clipped or overflowing text, targets under 24 px not spaced per WCAG 2.2 2.5.8 (a small target nested in another counts), console errors, canvas labels (and the handle's number field) over page content, every drawn door in the region the manifest places it in and in its order there, every drawn control a door, a menu button or a `data-local` control, and inline English equal to the en catalogue. 16 screenshots, 0 findings. The canvas area is 888 px wide at 1440 in the default view (direction A had 888) and 1368 px at 1920.
- Tokens gained the type styles micro (10/14) and overline (11/16, letter spacing), so badges, ruler numbers and sidebar headers stay on the type scale; `tools/gen/tokens.ts` also writes letter spacing.
- i18n: about 115 new keys in both catalogues (menus, regions, canvas labels, selector bar, legend, status messages, palette, checks categories, interactions).

Decisions taken here (change them in DESIGN.md and the manifest if the user disagrees):
- The default sidebar view is Explorer (Pages, Files, Layers); Insert shows the element grid in two columns at this width.
- Theme and Language are submenus of View; Language also opens from the status bar; the Zoom menu opens from the canvas toolbar and the status bar.
- The Tablet state selects the plans heading, not the lead paragraph: the sample page sets its paragraphs' margins to 0, so the lead has no free space for a label.
- The state drawn is `.btn:hover` (3 elements) to show that only the elements with the class are drawn in the state.
- The number field of a handle follows the label rule; the selection shot edits the bottom padding so the field sits below the card over no content, with its hint on the same line.

Review: the evaluator's first answer was NEEDS_WORK with 19 findings (menus offering commands that cannot apply, two specs contradicting corrections 10 and 2, a menu button sharing a slot with a tab, the section order and missing sections, drawn controls without a door, three small nested targets and the check that let them through, the number field over content, literals outside the tokens, a hard-coded :hover in a message, the file tree, drawing order, check categories and the base breakpoint without manifest data, page properties in the top bar, tokens in Styles, "Preenchimento" outside SVG fill, four contradictions in DESIGN.md, the Insert counts, menu separators). Each was fixed in the manifest, DESIGN.md, the catalogues, the checks or the mockup, or is recorded below.

Open findings (recorded, not acted on):
1. Intent lines that still describe the old layout. They are guidance only, but the scenario session reads them; the user decides whether to amend them: `editor-shell` expected 1 and 4 (a left dock with the Elements panel above Layers; now the activity bar and Explorer); `breakpoints-switch` step 0 ("in the top bar"; now the frame tabs); `snap-toggle-settings` step 0 and expected 0 ("in the top bar"; now the canvas toolbar); `dock-toggles` step 2 and expected 2 (top bar toggles; now the activity bar and the Layers header); `state-styles` expected 0 ("a canvas badge reads 'Editing Hover'"; now only the selected element's label shows the state); `context-menu` expected 1 (disabled and "not available yet" items; now the context menu shows only what applies); `code-panel-view` expected 0 and 3 (a workbench tab that floats; now the Split and Code views); `explorer-pages` expected 0 (a tab next to Elements, Elements the default); `quick-panel` step 1 and expected 0–1 ("Fill" for the background; now Background, and Fill is the SVG fill); `events-actions` expected 2 ("stored per element"; now an interaction applies to the element or to its class); `app-menu` step 0 ("from the logo button"; now a menubar) and expected 1 (Theme and Language as menus; now View submenus); `status-bar` expected 0 (the status bar shows the state; the brief's status bar has no state); `page-properties` step 0 ("Click Page in the top bar"; page properties now open from the inspector header and the palette).
5. Two specs contradict the contract and were not edited (their "Problems in Pager" corrections are requirements for the scenario session): `spec/behavior/context-menu.md` Problems 2 and 5 require disabled and "not available yet" items in the context menu (correction 10: the context menu shows only what applies); `spec/behavior/quick-panel.md` Problem 6 calls the box background "Fill" (correction 2: Fill is the SVG fill only).
6. `manifest/checks.json` names the Links, SEO and Export categories and the features that bring them (`link-picker`, `page-seo-meta`, `export-file-tree`), but no intent or spec says which checks those categories run; the scenario sessions of those features must define them.
7. `design:shots` checks the order of the drawn doors and the regions, not whether a menu's disabled items are the right ones (Move up and Make child of previous layer disabled for a first child): that stays with the scenarios of `app-menu` and `context-menu`.

The evaluator's second (final) answer rechecked the 19 findings: 15 fixed or recorded, 4 still reported. Per the brief they are recorded here:
8. (finding 5) DESIGN.md still named the palette scopes "Elements @" and "Pages and files /", which no command-bar door backs. Corrected after the review, not re-reviewed: DESIGN.md now names the scopes of the mockup and the catalogues (All, Commands >, Insert +, Panels /, Properties #).
9. (finding 6) On the Hero and Planos Layers rows the caret and the colour dot hit areas overlap by 2 px (negative margins against the row gap in `design/final/index.html`), leaving the caret 22 × 24 usable; `tools/design/shots.ts` tests spacing only for targets under 23.5 px, so an overlapped 24 px target passes. Not fixed (mockup only); the real Layers row must give each part its own 24 px.
10. (finding 8) A few literals remain in the mockup: radii 1px (handles), 22px and 24px (drop and pick outlines), and line heights 21px, 22px and 16px (number input, box core, badge). Not fixed (mockup only); the build uses only token values.
11. (finding 16) The pt-BR `feature.timelineAnimationSettings` read "… estado fora da animação da animação" after the replacement. Corrected after the review, not re-reviewed.
2. Class-scoped interactions need a data decision in the `events-actions` spec: where an interaction whose scope is the class is stored and how the export writes it. The door carries the scope inside `changes`.
3. `ARCHITECTURE.md` does not exist yet; it must confirm the owners of the new concepts: the editor view (`src/editor/view/editor-view.ts`), open file tabs (`src/editor/explorer/file-tabs.ts`), the interaction scope (`src/core/events/interactions.ts`), placement and menu anchors (`src/editor/doors/placement.ts`).
4. The inspector's Settings tab is described in DESIGN.md but drawn in none of the 12 states.

Fragile / worth knowing:
- `gen:check` compares against the git index: `src/ui/tokens.css` and every regenerated file must be staged before `verify:fast` passes.
- `npm run design:shots` serves the repository over a local HTTP server (the page fetches the catalogues) and needs the installed Chrome. Opened from disk, the page stays in English.
- The layout of the mockup's inspector is illustrative: the sample page's CSS (`.site p { margin: 0 }`) ignores some values the inspector shows.

Next:
1. The user reviews DESIGN.md, `design/final/` and the open findings (intent amendments first).
2. `ARCHITECTURE.md`, then the scenario runner and the scenario session for `01-foundation`.

## 2026-09-24 — Interface mockups: three directions to choose from

Why: every earlier attempt left the interface for last and ended generic and cluttered. The user picks a direction before anything is built. This session wrote static HTML and CSS only: no app code, no manifest change.

Done:
- `design/a-classic-refined`, `design/b-pen`, `design/c-studio`, each with:
  - `index.html`: the full editor with every command group placed. 12 drawn states, switched by a small inline script (`#state=<id>&theme=light|dark`): the brief's 10, plus `menu` (an app menu open) and `context` (the context menu) so those command groups are visible.
  - `tokens.json` (DTCG 2025.10): type scale, spacing, sizes, radii, elevation, colours for light and dark.
  - `tokens.css`: the same values as custom properties, read by the page.
  - `shots/`: `1440-NN-<state>.png` for the 12 states, plus `1920-01-default.png`.
- `design/shared/site.css` is the sample page (Aurora Café), drawn at real pixels and scaled with CSS `zoom`, as the editor's iframe will be. `design/shared/canvas.css` holds the canvas overlays: selection, handles, spacing bands, measurement, drop line, ghost, caret and interaction target.
- `design/OPTIONS.md`: the comparison table against requirements 1–13, who each direction suits and its main risk.
- Every screenshot was checked with Playwright on the installed Chrome for text overflowing its box, targets under 24 px not spaced per WCAG 2.5.8, and console errors: 0 findings in 39 screenshots. `npm run verify:fast` still passes.

Fragile / worth knowing:
- `tokens.css` and each page's inline CSS were written from the values in `tokens.json`. Editing `tokens.json` alone does not change a mockup.
- Canvas overlays live inside the zoomed page and cancel the zoom with `zoom: var(--iz)` (1 / page zoom). Lengths inside them are screen pixels; spacing bands stay in page pixels. The same approach may serve the real canvas overlay.

Open findings (recorded, not acted on):
1. Requirement 10 names Ctrl+Shift+K as the palette fallback. `commandBar.open` has only `Ctrl+K` and `menu:file`. Inside text editing, Ctrl+K is `text.editLink`, so the fallback is the only palette shortcut there.
2. The mockups place controls that have no door yet:
   - breakpoint and state pickers in the inspector selector bar (all three);
   - breakpoint tabs on the frame (B) and the breakpoint ruler (C). `view.setBreakpoint` has only `toolbar:top-bar` and `toolbar:preview-bar`; `view.setStyleState` has only `menu:style-state`;
   - B's quick-insert row (`element.insert` has only `panel-control:elements/tile`);
   - C's Canvas / Split / Code switch (the manifest's code panel is a toggled panel, not a split view).
   The chosen direction's doors must be added to the manifest with DESIGN.md.
3. Requirement 7 asks for a canvas door for every visual property. The manifest's canvas doors cover resize, spacing, gap, border width, radius, shadow, rotation, anchors and move. The quick panel adds size, fill, gradient, text colour, font size, opacity, border, effects, move, rotate and scale. Line height, letter spacing, font family and weight, filters, skew, grid tracks and the rest have no canvas door.
4. Requirement 9 names four dock tools (timeline, code, accessibility, problems). The manifest has the panels `timeline`, `code`, `checks` (Verificações) and `workbench`, and no problems panel. The mockups draw Acessibilidade and Problemas as two tabs.
5. Text formatting (bold, italic, link) has only shortcut doors. The mockups show them as key hints in the text-editing mode chip.
6. `view.enterPreview` (Ctrl+P) and `element.duplicate` (Ctrl+D) override Chrome's Print and Bookmark. Chrome does not reserve them (a page can prevent the default), so requirement 11 holds; flagged in case they should be avoided too.

Next:
1. The user picks a direction, or a mix, from `design/OPTIONS.md`.
2. `DESIGN.md` from the chosen mockup: every door placed, and the missing doors from the open findings added to the manifest.
3. `ARCHITECTURE.md`, then the scenario runner and the scenario session for `01-foundation`.

## 2026-09-24 — Property model fix: browser support from BCD, implemented properties, recipes, fallback allowlist

Why: a67fcde stored longhands no browser implements (box-shadow-*, text-align-all, max-lines, block-ellipsis, continue), which forced render and export to rebuild the shorthand: a second writer of the same property. The rule now is to store the finest-grained property browsers implement, and which ones they implement is generated from MDN's browser-compat-data (BCD), not measured or remembered. This session changed data, the generator and the validator only; there is still no app code.

Done:
- `@mdn/browser-compat-data` 8.1.2 (dev dependency). `npm run gen` also writes `manifest/generated/css-compat.json` (`tools/gen/compat.ts`, 6.7 MB, one line per property). It records the version of the current stable Chrome (153), Firefox (156) and Safari (27) that added each item, or false with the reason. It covers:
  - the 821 generated CSS properties;
  - their 26 790 keywords, each with its support inside every function it appears in (`inFunctions`);
  - their 2 667 functions;
  - the syntax forms BCD tracks (`forms`);
  - the 41 general-purpose functions CSS Values defines (`valueFunctions`: calc(), min(), max(), clamp(), round()…), which CSSTree matches wherever their result type fits, so no property's syntax names them;
  - the 65 units of the generated unit lists (`units`).
  The method is the comment at the top of `tools/gen/compat.ts`. In short:
  - Supported means an unprefixed statement for the current release, with no flag, not preview, not removed and not a partial implementation.
  - `-webkit-x` is looked up as the prefixed form of BCD `x`, and its keywords follow the prefixed property. BCD's value entries under `x` describe the standard property.
  - Own entries:
    - A keyword's: its key; a description that is nothing but its name in `<code>` ("AccentColor and AccentColorText"; `oblique-angle` is not `oblique`'s); or "`jump-` keywords".
    - A function's: `name_function`, or a description starting with `<code>name()</code>`. So `css.types.image`, the `<image>` type, is not `image()`.
  - A function is looked up in each context it is met in: under the scope that reaches a scoped function; else under a type on its path (never under its own entry); else under the property, its longhands (grid's `minmax()` is under grid-template-columns) and css.types (`linear()` is `linear-function`).
    - A function BCD tracks nowhere is a legacy alias when its official grammar is another function's once renamed (`rgba()` of `rgb()`).
    - Otherwise it has no support (`image()`, `device-cmyk()`).
  - A keyword is looked up under the property and its longhands. Otherwise it is decided in each context the syntax has it in. Every path that reaches it is recorded (`syntaxMentions` works out each type once and composes it into every path):
    - under the css.types entry of a type on the way (`color: mark` → `css.types.color.system-color.mark`, Safari false);
    - inside a function but through a type BCD tracks (`red` in `linear-gradient()`, through `<color>`): decided by that type, as outside functions. The function is checked as a function;
    - in a function's own grammar: the function's subfeature that names it (`display-p3-linear` → Chrome 144 / Firefox 146 / Safari 26.2), or the one BCD's convention ties to it (`relative_syntax` is `from`: in `rgb()` Chrome 122 / Firefox 128 / Safari 18). Else the function's support when MDN's syntax names the keyword inside that function. Else no support;
    - outside functions: a type that lists none of its values stands for them when MDN names the keyword.
  - A keyword outside functions that no context decides inherits its property's support only when both syntaxes name it. It gets no support when it is prefixed, when only MDN names it (`fill: context-fill`), when MDN lists it as non-standard (`overflow-x: overlay`), or when MDN does not name it.
  - `units` come from the css.types entry of their list. The type's own entry stands for the units BCD does not list separately (px, cm, s, ms, %). hz, khz, db and st have no support.
  - `forms` records the syntax forms BCD tracks as subfeatures, with the value shape each stands for: two- or three-value syntax, multiple keywords, several layers, negative values.
- Webref defines some functions only in scoped versions (`for`): `rect()` of `<basic-shape>` and of `clip`; `type()` of `image-set()`, `attr()` and `@function`. CSSTree has no scopes and matches a `<name()>` reference only by the function's own name. So the generator writes each scoped version inline into the syntaxes its scope reaches (`inlineScopedFunctions` in `tools/gen/generate.ts`; css-properties.json records them in `scopedFunctions`):
  - `clip-path: rect(0 10px 10px 0)` is official syntax;
  - its BCD entry is `css.types.basic-shape.rect`;
  - `type()` inside `image-set()` takes `image-set()`'s entry, since BCD lists nothing for it there.
- CSSTree's parser turns `url(…)` into a url token that only CSSTree's own `<url>` definition matches. So the official lexer keeps that definition, plus webref's `<src()>`, and `url("a.png")` is matched by the official syntax.
- `CSSTree` builds the official lexer as a fork of its MDN data. `src/manifest/css.ts` now counts a match as a browser-syntax match when it goes through a property or type webref does not define (`-webkit-box-orient`, `rect()`). It also reports what the value is made of: the keywords, the custom identifiers, and the longhands it sets.
- Rule `browser-support`:
  - Every edited property must be supported by all three browsers.
  - So must every keyword, function and unit of every value the manifest offers or writes, and every syntax form such a value takes. Each must also be one css-compat.json lists. A keyword inside a function is checked with its support in that function (`src/manifest/css.ts` reads the function from CSSTree's match tree). That covers subsets, fixed door values, element defaults, coupling effects, recipe values and structure keywords such as `inset`. So `width: fit-content(10px)` and `text-overflow: clip ellipsis` fail.
  - A custom identifier is checked when BCD tracks it.
  - A legacy alias whose standard name every browser supports is refused.
- `generated` as a door's list means the generated keywords and units all three support. `generatedOffer()` and `generatedUnits()` in `src/manifest/check.ts` are the one definition for properties, composites and recipes, for the UI to reuse. Today no offered unit is left out. It leaves out 288 generated keywords, such as `block-start` for object-position, `hairline`, `stretch`, `balance`, `match-parent`, `preserve-spaces`, `chain` and the system colours Mark, MarkText and ButtonBorder.
- Rule `shorthand-write`:
  - A shorthand is edited through its longhands (a composite) when all three browsers implement every one of them.
  - When a browser lacks one, the manifest declares the choice: a composite that `omits` it with the reason (`columns`, `font-variant`), or the shorthand stored whole in `storedWhole` with the reason (`box-shadow`, `text-align`, `vertical-align`).
  - A shorthand stored whole has none of its longhands edited as well.
  - A composite's offered or written values may not set a longhand it omits. The check looks for a referenced `<'column-height'>` or a keyword only the omitted longhand has.
- Replaced (what was edited → what is edited now):
  - `box-shadow-color`, `box-shadow-offset`, `box-shadow-blur`, `box-shadow-spread`, `box-shadow-position` (no BCD entry, no browser) → `box-shadow`, stored whole. Its value type is `shadow-list`: typed layers with color, offsetX, offsetY, blur, spread, inset and hidden.
  - `text-shadow` → value type `text-shadow-list` (color, offsetX, offsetY, blur, hidden).
  - `text-align-all` (no BCD entry) + `text-align-last` → `text-align`, stored whole. `text-align-last` is not edited, so text-align keeps one writer.
  - `alignment-baseline`, `baseline-shift`, `baseline-source` → `vertical-align`, stored whole, with the CSS 2 menu. Safari lacks baseline-source, and BCD shows the CSS Inline 3 vertical-align values only in Firefox.
  - `max-lines`, `block-ellipsis`, `continue` (Chrome and Firefox: none; Safari: preview) → the `line-clamp` recipe.
  - `user-select` (Safari: only prefixed) → the `user-select` recipe: `-webkit-user-select` and `user-select`.
  - `column-height` (Chrome only) → omitted by the `columns` composite.
  - `font-variant-emoji` (Safari preview) → omitted by the `font-variant` composite.
  - `overscroll-behavior-x`, `overscroll-behavior-y` and their composite (Safari: partial implementation) → not edited.
  - `font-stretch` was already the edited name (`font-width` lacks Chrome).
- Structured value types (`properties.json` `structures`, rule `structured-value`):
  - The document stores typed fields, and the codec is the only writer of the CSS.
  - The checker serialises a sample layer (and a two-layer list) from the fields and matches it against the property's official syntax.
  - A length field names the unit list it offers (`units: length`).
  - A door names the typed fields it edits in `adapter.fields`: the X field `offsetX`, the light pad and the offset handle `offsetX, offsetY`, the blur handle `blur`. The shadow doors offer no list.
  - A structured value is written only by a command with a json argument. It is never written as CSS text: not as a subset, an element default, a coupling effect or a fixed door value.
  - The four shadow-pad arrow keys used to declare no writes; they now write box-shadow or text-shadow (`offsetX` or `offsetY`).
- Compatibility recipes (`properties.json` `recipes`, rule `recipe`):
  - One door writes every declaration in one command and one undo step.
  - `source` names the spec section, and the BCD entry of the declaration that carries the door's value.
  - For each browser, every group (a property and its prefixed forms) needs a declaration that browser supports. Its value's keywords must be supported too, or vouched for by the allowlist.
  - Line clamp writes `display: -webkit-box`, `-webkit-box-orient: vertical`, `-webkit-line-clamp: N`, `overflow-x: hidden` and `overflow-y: hidden`. Its sources are CSS Overflow 4 §5.1.1 Legacy compatibility (`#webkit-line-clamp`) and BCD `css.properties.line-clamp` (the `-webkit-` prefix since Chrome 6, Firefox 68 and Safari 5).
  - The overflow is written as its two longhands. Every browser implements them and both are edited properties, so storing the `overflow` shorthand would be a second writer.
  - A recipe that also writes edited properties declares how it shares them (`shared`):
    - its fields show the recipe while it is set, so the Display menu never has to show `-webkit-box`;
    - a door that writes one of them clears the recipe in the same command and undo step;
    - clearing the recipe restores the values it replaced.
  - The props-typography-advanced intent says so.
  - A recipe never declares the shorthand of edited longhands (`overflow`, `padding`), nor a longhand of a shorthand stored whole.
  - Rule `vendor-prefix` (case-insensitive) rejects a prefix in any other string or key of the hand-written manifest. The only exceptions are the recipes, their doors' `writes` and their allowlist entries.
- Lexer fallback allowlist (`properties.json` `syntaxFallbacks`, rule `syntax-fallback`):
  - Entries: `fill` and `stroke` (every value), and, for the line-clamp recipe only, `display: -webkit-box` and `-webkit-box-orient: vertical`. Each has its reason.
  - Only a recipe-scoped entry vouches for its value where BCD does not track it, and only inside that recipe. A global entry lets the syntax through, never a value no browser supports.
  - Any other browser-syntax-only value fails, recipe values included. So does an entry that nothing needs.
- Planted fixtures, each failing on its own rule and locked by `tools/manifest/check.test.ts` (47 in all):
  - `edited-property-unsupported` → browser-support
  - `offered-keyword-unsupported` → browser-support
  - `offered-type-keyword-unsupported` → browser-support
  - `global-allowlist-cannot-vouch` → browser-support
  - `written-function-unsupported` → browser-support
  - `written-untracked-function` → browser-support
  - `offered-unit-unsupported` → browser-support
  - `written-form-unsupported` → browser-support
  - `recipe-writes-shorthand-of-edited-longhands` → recipe
  - `prefix-outside-recipe` → vendor-prefix
  - `fallback-outside-allowlist` → syntax-fallback
  - `recipe-misses-browsers` → recipe
  - `recipe-source-not-its-value` → recipe
  - `handle-edits-unknown-field` → structured-value
  - `structured-default-as-css-text` → structured-value
  - `composite-subset-sets-omitted-longhand` → composite
  - `buttons-with-no-supported-keyword` → value-set
  - `shorthand-whose-longhands-browsers-implement` → shorthand-write
  - `stored-shorthand-and-its-longhand` → shorthand-write
  - Unit tests also pin the compat facts, the filtered lists, and the review's mutations that break several rules:
    - `overflow-x: overlay` or `display: -moz-box` in a recipe;
    - `-WEBKIT-box`;
    - a recipe that writes `padding`;
    - a coupling that writes box-shadow text;
    - `calc()`, `max()`, `clamp()`, `color-mix()`, `rgb(from red 255 0 0)`, colours inside gradients and `url("a.png")` accepted;
    - `image()`, `contrast-color(red tbd-fg)`, `color(rec2100-pq …)`, `fill: context-fill`, `shape(from 0 0, …)` and a unit a browser lacks refused.
- Doors, consumers, i18n and intents followed:
  - `inspector-webkit-line-clamp` is now `inspector-line-clamp`, and `inspector-overscroll-behavior` is deleted.
  - Every adapter has `fields`, and every inspector field has `recipe`.
  - The 18 unused `property.*` keys are removed, and `property.webkitLineClamp` is now `property.lineClamp`.
  - Five intent lines are amended and declared in `tools/manifest/map-features.ts`: shadow-editor, props-more, props-typography, props-typography-advanced and props-effects-basic.
  - The behaviour specs needed no change: they describe Pager, and none names a removed property.
  - The summary of `manifest:check` prints the allowlist, the recipes' sources and the shorthands stored whole, with their reasons.

What webref (@webref/css 8.7.5) says about line clamp:
- It defines `-webkit-line-clamp`: CSS Overflow 4, `#propdef--webkit-line-clamp`, syntax `none | <integer [1,∞]>`, a shorthand of max-lines, block-ellipsis and continue. It also defines `line-clamp`.
- It lists `-webkit-box-orient` from the Compatibility Standard, with no syntax.
- It does not define the display value `-webkit-box`, anywhere. Neither the display syntax nor `<display-legacy>` (inline-block | inline-table | inline-flex | inline-grid) has it, and BCD has no entry for it either.
- The spec text (§5.1.1) says the legacy clamp "only takes effect if the specified value of the display property is -webkit-box or -webkit-inline-box and the value of the -webkit-box-orient property is vertical".
- So the recipe's `display: -webkit-box` and `-webkit-box-orient: vertical` are browser-syntax values that the allowlist names for this recipe only, with the spec section as their evidence.

Decisions taken here (change them in the manifest if the user disagrees):
- **Partial implementations count as unsupported.** BCD says a partial implementation "deviates from the specification in a way that may cause compatibility problems". For that reason overscroll-behavior is not edited (the props-more intent no longer lists it), and `background-clip: text` is not offered.
- **user-select became a recipe instead of being dropped**, so "user-select none" in props-effects-basic keeps working in Safari.
- **vertical-align is stored whole** (the reason is in `storedWhole`). The alternative was a composite of alignment-baseline and baseline-shift that omits baseline-source.
- **shape() values are refused for lack of data.** BCD records `shape()` in all three browsers but none of its keywords (from, line, to, close…), and MDN's syntax does not know `shape()`. The only other evidence is webref's draft grammar, and that same grammar gives `contrast-color()` the placeholders `tbd-fg`/`tbd-bg`, which no browser ships. No data tells the two apart, so keywords inside a function need BCD or MDN to name them there. The editor offers no `shape()`.
- **Keyword support needs a rule where BCD is silent.** A keyword BCD does not track inherits its property's support only when MDN's browser syntax names it. That catches draft-only keywords such as `hairline`, `stretch` and `justify-all`. But BCD and MDN still both let `all`, `region` and `avoid-region` through for the break-* properties, so those menus declare subsets with the reason.
- The font menu drops the ui-serif, ui-sans-serif and ui-monospace stacks, which only Safari supports.

Open questions for the user: none from this session.

Fragile / worth knowing:
- A BCD version bump changes css-compat.json, including which release counts as "current". `gen:check` names the package that moved; review the diff, since edited properties can become valid or invalid.
- `gen:check` compares against the git index, so a new generated file must be staged (`git add manifest/generated/`) before `verify:fast` passes.
- css-compat.json is 6.7 MB (one line per property, keywords with their contexts inline); the unit tests clone it for every plant, so `npm run unit` takes about 15 s.
- BCD subfeatures that are neither a value, a function nor one of the six form shapes are not checked. Examples: `side-relative_values`, `shorthand_values`, `url_positioning_syntax`, `writing-mode_relative_values`. `FORM_SHAPES` in `tools/gen/compat.ts` is the place to add one.

Next:
1. `DESIGN.md` (places every door) and `ARCHITECTURE.md` (confirms every command owner and the reader modules named in `consumers.json`, including `src/core/style/structures.ts` and `recipes.ts`).
2. The scenario runner, then the scenario session for `01-foundation`.

## 2026-09-24 — Property model: generated web data, longhands, composites, couplings, history

Why: hand-copied CSS/HTML tables are how Pager ended up with two unit lists for gap; editors break on shorthand versus longhand and on values re-parsed as strings; undo bugs come from interactions that forget to mark a history step. This session changed data and the validator only; there is still no app code.

Done:
- `npm run gen` (`tools/gen/generate.ts`) writes `manifest/generated/css-properties.json` (821 properties, 169 of them shorthands with their expanded longhands, 578 type and function syntaxes; per property the keywords and units CSSTree's lexer accepts alone) from @webref/css 8.7.5 and css-tree 3.2.1, and `manifest/generated/html-elements.json` (145 elements: void, text-only, categories, permitted content/descendants/order/parent, required ancestors/content, attribute enums) from html-validate 11.16.0. Each has a `$generated` header naming its sources. Never edit them. `npm run gen:check` regenerates and fails when git sees a change or an untracked generated file; it is the first step of `verify:fast`.
- `src/manifest/css.ts` builds the lexer (CSSTree forked with the webref syntaxes); generator and checker use the same construction.
- `properties.json` is the editor layer: 189 edited longhands (id = CSS longhand name, label, section/group, control type, value type from the closed list, codec id, `appliesTo` predicate id, doors, declared subsets with reasons), 30 composites (shorthand, longhands, `omits` with reason, codec, doors) and 9 coupling rules (trigger, condition predicate, effect action, feature; closed lists in `schema.ts`). No keyword or unit list is written by hand; a door's `offers.list` is `generated` or a subset id.
- Every command has `history`: undoable or not (110 of 216 are), coalescing (`none`, or same target and property within an interactions constant: only `position.move`, `history.nudgeBurstWindow`), undo restores the selection from before the command, one transaction per gesture for commands with pointer-gesture doors, no entry when nothing changes.
- `references.json`: 327 planned ids (216 handlers = command ids, 43 predicates, 64 codecs, 4 actions). Code will register them with `registerHandler|Predicate|Action|Codec('<id>', …)`; `tools/manifest/load.ts` scans `src/` for those calls. `consumers.json`: every one of the 295 schema fields (enumerated from the zod schemas by `src/manifest/fields.ts`) with its planned reader module (intent and spec: `CLAUDE.md`, read by scenario authors).
- `elements.json` keeps editor data only (tag, namespace, alternative tags, label, icon, palette, how the content is edited, natural child, longhand default styles, default text). The content model comes from the generated HTML data.
- `manifest:check` rules added: `no-logic` (runs first, before the schema), `css-syntax`, `shorthand-write`, `composite`, `door-writes`, `individual-transform`, `coupling`, `history`, `reference`, `consumer`, `html-model`. Each has a planted fixture that fails on that rule alone (`npm run manifest:check -- --list-plants`, `-- --plant <id>`), locked by `tools/manifest/check.test.ts`.
- Intents and specs that still described shorthand writes, one composed transform value or translate-centred anchors were amended (14 intent lines, declared in `tools/manifest/map-features.ts`; `npm run manifest:map` passes; specs rotation-handle, radius-border-gap-handles, spacing-handles).

Decisions taken here (change them in the manifest if the user disagrees):
- Measured in the installed Chrome 153: it implements none of `text-align-all`, `max-lines`, `block-ellipsis`, `continue`, `font-width` and the five `box-shadow-*` longhands. The document still stores the official longhands; rendering and export write a composite as its shorthand whenever all its longhands are set (CSSOM serialisation). `font-stretch` stays the edited name (webref: legacy alias of `font-width`, and the `font` shorthand's longhand).
- The official grammar is incomplete: the Fill and Stroke 3 draft's `<paint>` has no `<color>`. The checker accepts a value the official syntax rejects when CSSTree's bundled MDN (browser) syntax accepts it, and lists every such value in its summary (today 2: the SVG shape defaults `fill: #dbe7ff`, `stroke: #2b5fe3`).
- translate, rotate and scale are edited as their own properties by `style.set` (inspector Move X/Y, Rotate, Scale; quick panel; rotation handle). `style.setTransform` keeps skew only. Anchoring to the centre no longer writes translate: it writes left/right 0, auto side margins and a fit-content size (measured centred in Chrome 153).
- `all` is no longer edited (it is the shorthand of every property). Summary and Legend have no natural child: HTML permits only phrasing and headings there, not a Paragraph.
- Composites are written by the command their fields already used (`style.set` accepts a composite id as its `property`; `style.setSpacing`, `setBorder`, `setRadius`, `setShadows`, `setBackgroundImage`, `setAlignment`). The `background` composite omits `background-color` (Pager's gradient erased it). `inset` has no door yet (command bar and CSS import).
- Declared subsets (menus smaller than the official list, each with its reason): display, gap, grid-auto-flow, scroll-snap-type, float, clear, background-size, background-position, font-family stacks, font-weight, font-style, text-decoration, vertical-align, font-variant, list-style-type, will-change, transform-origin.

Open questions for the user:
- Line clamp: Chrome clamps only with `display: -webkit-box`, `-webkit-box-orient: vertical` and overflow hidden (measured), and the official display syntax rejects `-webkit-box`. No coupling rule sets them yet, so `props-typography-advanced` ("Line clamp 2 limits the measured paragraph height to two lines") cannot pass as the data stands.
- html-validate marks `td`/`th` as flow content, so the generated content model alone allows a cell outside a row, and a label's one-control limit is an html-validate rule (`multiple-labeled-controls`), not element metadata. The placement predicate must cover both.

Fragile / worth knowing:
- The generated files must be added to git before `verify:fast` passes. A version bump of @webref/css, css-tree or html-validate regenerates them; review the diff, since keyword lists and syntaxes change with the specs.
- Planted fixtures clone the manifest including the generated files; the checker caches one lexer per generated object.

Next:
1. `DESIGN.md` (places every door) and `ARCHITECTURE.md` (confirms every command owner and the reader modules named in `consumers.json`).
2. The scenario runner, then the scenario session for `01-foundation`.

## 2026-09-24 — features.json converted into the manifest

Why: `.cache/investigation-report.md` (sections 6 and 7) found that every divergence of the previous attempts sat in a concept reached through hand-registered doors, and that hand-written status and prose outcomes were satisfied literally. The work is now driven by data.

Done:
- `manifest/` is the single contract, validated by `npm run manifest:check` (part of `verify:fast`). Schema: `src/manifest/schema.ts` (zod 4, runtime dependency; types derived with `z.infer`). Rules: `src/manifest/check.ts` (pure, reusable by the app). Loader, CLI, planted fixtures and mapping check: `tools/manifest/`.
  - `environment.json`: Chrome channel, viewports 1440×900 and 1920×1080, locales pt-BR (default) and en, zoom 50/100/200, reduced motion.
  - `elements.json`: 61 element types (data from Pager's element and grammar tables; no Card, no Badge; internal parts not in the palette; SVG shapes only inside an SVG; an invalid placement is refused, never wrapped), 51 attributes (non-CSS fields, including page settings), 74 palette entries in 8 groups.
  - `properties.json`: 162 CSS properties with value type, keywords, units (the complete list where Pager's two tables disagreed), section, group, `appliesTo` predicate, essentials flag and the one command that writes each; 10 inspector sections; breakpoints (1440/1180/834/390); 7 style states.
  - `interactions.json`: 24 key contexts (with inheritance), 121 named constants with unit and source spec, 35 gestures with one meaning per modifier.
  - `commands/*.json`: 216 commands in 18 domain files, 834 doors. Each command has owner (planned module path), args schema, availability (predicate id and refusal key), refusal keys, optional confirmation, and its doors. Each door has kind, the feature that makes it work, label and disabled-reason keys, placement (`none` for keys and gestures, menu/context-menu orders from the features, `unplaced` otherwise until DESIGN.md) and adapter data (selection normalisation, offered value set as a declared subset of the catalogue with a reason, properties written).
  - `features/NN-group.json`: the 179 capabilities in 20 groups, same order as features.json, each with title key, commands needed, `dependsOn`, spec, `intent` (old title, steps and expected text, guidance only) and `scenarios: []`. The scenario schema is defined (setup, doors, document diff, selection, history, render/persistence/export terminals, refusals; no "exists"/"visible" assertion).
- `src/i18n/locales/pt-BR.json` and `en.json`: 1135 keys, same keys and placeholders in both. `src/i18n/en.ts` reads the JSON; `t()` still returns English, pt-BR wiring is feature `ui-language`.
- The three points the review left open are resolved in the intents and specs: no older saved format exists (schema version from the first save, migrations tested on the real loading path; `autosave-restore`, `explorer-file-system`); while resizing Alt resizes from the centre and Ctrl suspends snapping, and Ctrl is the snap switch in every snapping gesture (`snap-while-moving`, specs `resize-handles`, `snap-while-moving`, `absolute-free-drag`, `spacing-handles`); an opened folder's linked stylesheets are parsed into the document and the .css files stay as unlinked files (`explorer-open-folder`).
- `features.json` deleted after `npm run manifest:map` proved 179/179 ids map to exactly one feature in order and 1202/1206 lines are verbatim (the 4 others are the declared amendments above). The script still runs, reading features.json from git (`ffecbb5`). Spec citations of features.json now say "manifest feature".
- CLAUDE.md and `.claude/agents/evaluator.md` describe the manifest workflow: scenario session then build session per group, build sessions never edit scenarios, status only from the runner, doors only from the manifest, read-only test port.

Decisions taken here (change them in the manifest if the user disagrees):
- Door kinds beyond the brief's list, needed for doors that are neither menus nor drags: `canvas-click`, `canvas-wheel`, `panel-control`, `panel-drag`.
- New bindings where specs asked for one without naming it: Nest into previous = Alt+ArrowRight (canvas); hand "aim at the previous position" = Shift+ArrowDown / Shift+ArrowRight; `history.nudgeBurstWindow` = 1000 ms; one dock-edge zone (80 px) and one tabs/stack split (upper 45 %) for every panel.
- Not edited as properties: `touch-action`, `content`, the `background` shorthand, standalone `rotate`/`scale` (the transform command owns them). `translate` is owned by the anchors command.
- Opening a dropdown menu is not a command; its items are doors. Widget-local state (a slider value before Apply, text being typed) is not a command.

Fragile / worth knowing:
- The manifest was authored with a throwaway generator; from now on edit the JSON directly and keep `npm run manifest:check` green. Door ids are unique per command and referenced by scenarios as `<command>#<door>`.
- `manifest:check` validates structure and cross-references, not product sense. Door placements are `unplaced` until DESIGN.md; owners are planned paths until ARCHITECTURE.md confirms them.
- Every feature is "missing": there is no runner yet. Nothing may write a status.

Next:
1. Write `DESIGN.md` (places every door) and `ARCHITECTURE.md` (confirms every command owner).
2. Build the scenario runner: generates a Playwright test per scenario × door, real input on Chrome, read-only test port, parity across doors, negative control, commit-stamped status.
3. Scenario session for group `01-foundation`, then its build session.

## 2026-09-24 — features.json written

Done:
- `features.json` has 161 entries ordered by dependency, all `"passes": false`. Build them strictly top to bottom. An independent reviewer checked the order three times for forward references, oversized entries, contradictions and tests that later entries would break.
- Found by running Pager and using it in Chrome: served from a copy at `.cache/pager-run` (`node tools/serve.mjs . 8125` inside that folder). Nothing was written inside `reference/`.
- The first entries are the editor layout and structural editing (select, layers, undo/redo, delete, drag reorder/inside, drag level keys, palette drag, layers drag, move up/down, wrap, context menu, unwrap, nest, promote, duplicate, copy/paste, keyboard walk, hand mode).
- Entries for what Pager lacks: `unsaved-work-guard`, `autosave-crash-recovery`, `autosave-corruption-recovery`, `multi-tab-guard`, `clipboard-cut-system`, `clipboard-paste-external`, `keyboard-panel-navigation`, `layers-keyboard-navigation`, `html-import-*`, `code-panel-*`, `timeline-*`, `export-keyframes`, `explorer-*`, `export-multi-page`, `export-assets`.
- `.gitignore` now ignores `.cache/` and `.playwright-mcp/` (the Playwright MCP tool writes snapshots there).

Worth knowing for the work ahead:
- Menus and the context menu arrive before most of their commands. Items for unbuilt features are shown disabled with 'not available yet' (CLAUDE.md rule). Which features are built must come from ONE feature registry, and tests compare the UI with that registry, never with a fixed list, or they break when later features land (tests may never be edited).
- Tests of early entries assert "at least these, in this order", never "only these", for menus and inspector sections.
- The canvas reserves 20 px bands for rulers from the first entry; the bottom workbench dock is closed by default.
- `shortcuts-e2e-sweep` is deliberately last: each keymap row carries its own sweep case.
- Tests need to read the document JSON. Plan a read-only test accessor (or read the IndexedDB record) in the first feature and use it everywhere.
- Pager facts worth copying as behaviour (not code): desktop-first breakpoints 1440/1180/834/390; states Base, Hover, Focus, Active, Disabled, Invalid, Placeholder shown; 95 palette entries = 74 element types + 21 templates.

Next:
- Take `editor-shell`, the first feature with `"passes": false`.

## 2026-09-24 — Project initialized

Done:
- npm project with Vite 8, React 19, TypeScript 6 (strict), Vitest 5, Playwright 1.63 (`channel: 'chrome'`), ESLint 10.
- Scripts: `dev`, `build`, `typecheck`, `lint`, `unit`, `e2e`, `verify:fast` (typecheck + lint + unit).
- `src/config/product.ts` holds the product name. `index.html` has an empty `<title>`; a Vite plugin in `vite.config.ts` fills it from `product.ts`.
- `src/i18n/` has `t(key, params)` and `formatMessage`. All UI text goes through `t`.
- ESLint forbids React imports inside `src/core/**`.
- `tests/e2e/smoke.spec.ts` opens the app in Chrome and checks the page title and the heading.

How to run:
- Dev server: `PORT` is required (`$env:PORT=5300; npm run dev` in PowerShell). Without it Vite exits with an error. 5173 is used by another app on this machine.
- `npm run e2e` starts its own dev server on `E2E_PORT` (default 5310) and never reuses a running server.

Fragile / worth knowing:
- `reference/` has its own HTML entries. `vite.config.ts` restricts `optimizeDeps.entries` to `index.html` and does not watch `reference/`. Without that, Vite's dependency scan crawls Brickflow and complains about missing packages.
