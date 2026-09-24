# Progress

Handoff notes between sessions. Newest entry first.

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
