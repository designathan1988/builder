# Design

The single interface contract. It says what every region of the window holds, where every door of the manifest is drawn and in which order, how the canvas behaves, and which tokens the interface uses. The builder never invents where a control lives: if a control is not placed by this document and by the manifest, stop and ask.

The interface has the look of direction C "studio" and the structure of direction A "classic refined". C gives the look: dark by default, its colours and teal accent, small radii, the code font, IDE-compact rows and the coloured status bar. A gives the structure (top bar, inspector, element grid, rulers, breakpoint warning, region sizes) and its visual inspector controls (the alignment matrix, the box model, segmented keyword buttons, value fields), laid out in C's compact rows. C also gives the activity bar, the explorer, the file tabs and Canvas / Split / Code; Canvas stays the default view. Only B's canvas behaviour is kept (number field on a handle, hover measurement, drop indicator).

Sources, in this order of authority:

| What | Where |
|---|---|
| Regions and menu anchors | `manifest/layout.json` (schema `layoutFileSchema` in `src/manifest/schema.ts`) |
| The breakpoints in cascade order, the first the base | `breakpoints` of `manifest/properties.json` (`base: true` on the first and only there) |
| The categories of the Checks tab | `manifest/checks.json` |
| The region and order of every door | `placement` of each door in `manifest/commands/*.json` |
| The visual source | `design/final/index.html` (12 states, the Split view, dark (a fresh profile's theme) and light, English and pt-BR) and its screenshots in `design/final/shots/` |
| Design tokens | `design/final/tokens.json` (DTCG), built by `npm run gen` into `src/ui/tokens.css` |
| One term per concept | `src/i18n/glossary.json` |
| Icons | Lucide, the one icon library (see "Icons"); each icon named in the manifest |

The older mockups in `design/a-classic-refined`, `design/b-pen`, `design/c-studio` and `design/OPTIONS.md` are history: where they differ from `design/final/`, `design/final/` wins.

Checks that hold this contract (both are part of the evidence of every session that touches the interface):

- `npm run manifest:check`, rules `placement` (every door with a control has a region of `layout.json`, keys and gestures have none, a menu's items are in `menu:<menu>`, context-menu items in `context-menu`, palette entries in `command-palette`, quick panel fields in `quick-panel`, inspector fields in an inspector region, every menu has an anchor, two controls never share a region's order), `state-placement` (no control that chooses a style state is drawn on the canvas frame or the canvas toolbar, and no menu of such controls opens from them) `label-term` (one label, in either language, never names two CSS properties, and each glossary term is the label of its property) `all-properties` (in All properties every inspector field offers every value the browser data allows plus its presets; Essentials only never offers a value All properties lacks), `icon-name` (every icon the manifest names is a Lucide icon) and `icon-required` (every toolbar door, icon button and icon-button menu anchor names its icon; a key or a gesture names none). The summary prints the number of doors placed in each region.
- `npm run design:shots` renders `design/final/index.html` in the installed Chrome and fails on clipped or overflowing text (English and pt-BR), a pointer target under 24 px that is not spaced as WCAG 2.2 criterion 2.5.8 allows, a console error, a canvas label over page content, a control drawn in a region other than the one the manifest places it in or out of its order there, a control drawn with no door, and a text whose inline English is not its i18n key's English. Every control of the mockup carries `data-door="<command>#<door>"`, `data-menu` for a menu's button, or `data-local` for a control that is not a command, and sits inside `data-region="<region>"`.

## The window

```
┌──────────────────────────────── top bar ─────────────────────────────────┐
│act│ sidebar  │ file tabs                                   │ inspector    │
│ivi│ Explorer │ canvas toolbar                              │ Style        │
│ty │ Insert   │ ruler ┌ breakpoint tabs ┐                   │ Settings     │
│   │ Styles   │   ┆   │ frame (the page, zoomed)            │ Interactions │
│bar│          │       └──────────────────  [code pane]      │              │
│   │          │ dock strip: Timeline · Checks (collapsed)   │              │
├───┴──────────┴─────────────────── status bar ──────────────┴──────────────┤
```

Sizes come from the tokens: top bar 40, activity bar 40, sidebar 224, inspector 288, file tabs 34, canvas toolbar 36, rulers 20, frame tabs 28, dock strip 28 (open dock 212), status bar 24, code pane 400. In the default Canvas view the canvas area (file tabs, canvas toolbar, rulers and stage) is 888 px wide at 1440 × 900, the width it had in direction A, and 1368 px at 1920 × 1080. The sidebar, the inspector and the dock are fixed, resizable with their splitters and collapsible (Ctrl+B, Ctrl+Alt+B, Ctrl+\\); nothing floats except menus, the palette, popovers, the quick panel and the text toolbar.

Theme: a fresh profile opens in Dark: the default theme is data, `theme.default` of `manifest/environment.json`, beside the default locale. View > Theme offers Light, Dark and System; System follows the system setting (`prefers-color-scheme`). The choice is stored with the preferences and survives a reload. Light and dark are both complete token sets.

## Regions

Every region below is an id of `manifest/layout.json`. "Order" is the `order` of the placement: 1 is first (leftmost in a row, topmost in a column). Component regions are the parts of a control that repeats wherever it is drawn.

### Fixed regions

| Region | Area | What it holds, in order |
|---|---|---|
| `top-bar` | top | 1–5 the menu buttons File, Edit, Arrange, View, Help (anchors of the application menus) · 6 page switcher (the current page and its file name; its list switches the page) · 7 command palette search (Ctrl+K) · 8 Undo · 9 Redo · 10 Preview · 11 Export project (ZIP). The save state ("Saved") sits before Preview and is not a control. Separators stand before 6 and 10 (`breaks` of the region in `layout.json`, where any region can declare the orders before which it draws a separator). Breakpoints and page properties are never in the top bar (page properties open from the inspector header and the palette). |
| `preview-bar` | top (preview mode only) | 1–4 breakpoints Desktop, Laptop, Tablet, Phone · 5 Exit preview · 6 Export. It replaces the top bar while previewing; docks, selection, guides and handles are hidden. |
| `activity-bar` | left | 1 Explorer · 2 Insert · 3 Styles. Each shows its view in the sidebar; the active one is marked with the accent bar. |
| `explorer-pages` | left, Explorer view | 1 Add a page (section header) · 2 page row (opens the page) · 3 page name field · 4 Duplicate · 5 Delete. |
| `explorer-files` | left, Explorer view | 1 New file · 2 New folder · 3 Upload (section header) · 4 file row (opens the file in a file tab) · 5 file name field · 6 Move to… · 7 Delete. |
| `explorer-layers` | left, Explorer view | 1 the Layers section header (shows or hides the Layers section) · 2 Expand every branch · 3 Collapse every branch · 4 the button of the menu "What each row shows". Then the tree, whose rows are the `layers-row` component. |
| `insert` | left, Insert view | The search field (typing filters; not a command) · 1–4 density: List, Two columns, Three columns, Icon grid · 5 group header · 6 element tile · 7 component tile. Two columns is the default in this sidebar width. The tiles of each group lie in the `palette-tiles` component, a grid of as many columns as the density says. |
| `styles` | left, Styles view | The classes, a read-only list (each class with the number of elements it styles and its states; a class is edited through the selector bar) · the variables, which are the project's design tokens, grouped by type (Colours, Sizes, Fonts): 1 New variable · 2 variable name field · 3 variable value field · 4 Delete the variable. |
| `file-tabs` | centre | Each tab is its name then its close button: 1 page tab (switches the page) · 2 Close the file tab · 3 file tab (shows a code file in the Code view). |
| `canvas-toolbar` | centre | 1–3 the view switch Canvas / Split / Code · 4 Canvas tools (shows or hides 5–9) · 5 Outlines · 6 Zones · 7 Column grid · 8 Row grid · 9 Dot grid · 10 Snap · 11 the button of the Snap options menu · 12 the zoom button (opens the Zoom menu). The key hint of the current gesture (Alt measuring, drag keys, text keys, picking) is text at the right, not a control. No state control is ever here (`state-placement`). |
| `canvas-frame` | centre | The breakpoint tabs attached to the top of the frame: 1 Desktop · 2 Laptop · 3 Tablet · 4 Phone, along the cascade from the base breakpoint (Desktop, 1440, marked "base"). No state control is ever here. |
| `quick-panel` | centre, floating | The quick panel's fields, in this order: 1 Tag · 2 More actions · 3 Edit on canvas · 4 W · 5 H · 6–11 Align left, centre, right, top, middle, bottom · 12–13 Distribute horizontally, vertically · 14 Background · 15 Fill (SVG) · 16 Gradient · 17 Border · 18 Opacity · 19 Effects (filter) · 20 Text colour · 21 Font · 22 Size · 23 Font weight · 24 Line height · 25 Letter spacing · 26 Text align · 27 Move X · 28 Rotate · 29 Scale · 30 Skew X · 31 Skew Y. A field shows only when its property applies to the selection. |
| `text-toolbar` | centre, floating | While editing text: 1 Bold · 2 Italic · 3 Link. Link (and Ctrl+K) opens the link prompt under the toolbar: the "Link address" field, filled with the address of the link the selection is in and selected (typing there is not a command, `data-local`), Enter applies it, an empty address removes the link, a refused address shows its refusal under the field and the prompt stays; the backdrop (`overlay`) closes it and the focus goes back to the text. |
| `code-view` | centre | The code pane of the Split and Code views: 1 Copy this pane · 2 Download this pane · 3 a code line (clicking selects its element) · 4 Apply the HTML · 5 Apply the CSS · 6 Save the file. Its HTML / CSS / JS tabs are the `tab-strip` component. |
| `inspector-header` | right | 1 Style · 2 Settings · 3 Interactions (the inspector's tabs) · 4 Page properties · 5 the button of the Element actions menu (Lock, Hide, Reset every value). |
| `inspector-selector-bar` | right, Style tab only | The selected element's icon, name and tag (not controls) · 1 the target chips: Element, then each class (choosing one makes it the style target) · 2 the × of a class chip (removes the class from the element) · 3 + Class · 4 Save the styles as a class · 5 the state picker (the button of the State menu). Below the chips, the count of elements the target reaches (".card affects 3 elements"), and the active breakpoint, read-only, beside the state picker. |
| `inspector-style` | right, Style tab | The value-origin legend (not a control) · 1 Essentials only · 2 All properties · 3 Add a property's item (reveals the field) · 4 the section header (collapses a section) · then every style field, from order 5 on, by section, group and property (see "Inspector"); the alignment matrix follows direction and wrap, and the margin box is drawn around the padding box. |
| `inspector-settings` | right, Settings tab | The manifest's General, Link, Image, Accessibility, SEO and Attributes sections, each with a short description, in that order. A section appears when it has a field applicable to the selected element; Attributes also holds custom attributes and parts editors. Each field is a door of its attribute in `elements.json`; the section membership is `settingsSections` there. |
| `inspector-interactions` | right, Interactions tab | 1 Add an interaction · then each interaction card: 2 Remove the interaction (in its header) · 3 Applies to (this element or its class) · 4 Trigger · 5 Action · 6 Options. The Target field starts picking (not a command); the target is picked on the canvas or on a Layers row. |
| `dock-strip` | bottom | The dock's tabs (Timeline, Checks, and Keyboard shortcuts and Document when they are opened; the `tab-strip` component) · a one-line preview of the first check when the dock is collapsed (not a control) · 1 Show or hide the workbench · 2 Maximize · 3 Close a tab. |
| `dock-timeline` | bottom | Left, the animations: 1 New animation · 2 animation name field · 3 Delete the animation · 4–10 the settings Duration, Delay, Repeat, Direction, Fill mode, Timing function, Play state. Right, the timeline: 11 Play · 12 Pause · 13 Stop · 14 Loop · 15 the time ruler (moves the playhead) · 16 Add keyframe · 17 keyframe easing · 18 Delete the keyframe. |
| `dock-checks` | bottom | 1 an issue row (selects its element). Issues are grouped by the categories of `manifest/checks.json`: Accessibility, Links, SEO, Export, each arriving with the feature that produces its checks. |
| `status-bar` | bottom | The last message (an `aria-live` region) · 1 the breadcrumb of the selection (each ancestor selects it) · the size W × H · the breakpoint · the element count · 2 Zoom out · 3 the zoom value (opens the Zoom menu) · 4 Zoom in · 5 Fit · 6 the language (opens the Language menu) · the save state. |

### Overlays

| Region | What it holds |
|---|---|
| `command-palette` | Ctrl+K or Ctrl+Shift+K. Every command-bar door, commands first, then insert, open panel, set property and edit property entries, each group in the order of the command files. Scopes (filters, not commands): All, Commands `>`, Insert `+`, Panels `/`, Properties `#`, one per kind of command-bar entry. Only commands that apply to the selection are offered. The export command is "Export project (ZIP)", because the export is the whole file tree. |
| `context-menu` | Opened by a secondary click on the canvas or on a Layers row, or by More actions of the quick panel. Its items keep the manifest order, and it shows only the commands that apply to the selection: no disabled item, and no "not available yet" item (on the first child of a container, Move up and Make child of previous layer are left out; on an element with no natural child, Create … inside is left out). |
| `menu:<menu>` | The items of each menu, in their order. Application menus (File, Edit, Arrange, View, Help, and View's submenus Theme and Language) show every item: an item that cannot apply now is disabled, and an item whose feature is not built yet is disabled with "not available yet". These are the only places where "not available yet" items appear in a menu. Menus have no separators or group labels: the manifest declares none. |
| `color-picker`, `link-picker`, `asset-picker` | Popovers opened from a field; their controls in the listed order. |
| `guides-grids-dialog`, `snap-settings-dialog`, `recovery-dialog`, `tab-guard` | Dialogs; their controls in the listed order. |
| `toast` | Undo on the toast that follows a delete. |
| `overlay` | The backdrop that closes a menu or popover. |

### Component regions

| Region | Where it repeats | Parts, in order |
|---|---|---|
| `field` | every number or length field (inspector, quick panel) | 1 unit menu · 2 step up · 3 step down · 4 reset this value |
| `layers-row` | every Layers row | 1 click (select) · 2 Shift+click (add) · 3 Ctrl+click (toggle) · 4 caret · 5 colour dot · 6 name (double-click renames) · 7 name field · 8 Hide · 9 Lock (8 and 9 appear on the row under the pointer, so a selected row keeps its whole name; the row of a hidden element is dimmed and keeps its Hide shown, pressed; the row of a locked element keeps its Lock shown, pressed) · 10 pick as the interaction target · 11 secondary click (context menu). Beside the name, the details "What each row shows" chooses (HTML tag, #id, .classes, attributes), in the `layers-row-details` component, drawn only on a row that has one of them. |
| `tab-strip` | the dock's tabs and the code view's HTML / CSS / JS tabs | 1 a tab |
| `panel-header` | every closable panel | 1 Close the panel |
| `dialog` | every dialog | 1 Close |

### Menu buttons (`layout.json` `menus`)

| Menu | Opens from |
|---|---|
| File, Edit, Arrange, View, Help | `top-bar` 1–5 |
| Theme | View, item 17 |
| Language | View, item 18, and `status-bar` 6 |
| Element actions | `inspector-header` 5 |
| Zoom | `canvas-toolbar` 12 and `status-bar` 3 |
| Snap options | `canvas-toolbar` 11 |
| State | `inspector-selector-bar` 5 (the state picker) |
| What each row shows | `explorer-layers` 4 |

## Placement rule for every door kind

| Door kind | Placement |
|---|---|
| `shortcut`, `canvas-click`, `canvas-drag`, `canvas-wheel`, `canvas-handle`, `layers-drag`, `panel-drag` | `none`: a key or a pointer gesture has no control of its own. Handles are drawn on the selection (see "Canvas"). |
| `menu` | `menu:<menu>`, in the order the features gave the items. |
| `context-menu` | `context-menu`, in the order the features gave the items, but Delete, the destructive item, always last. |
| `command-bar` | `command-palette`, commands first, then insert, open panel, set property, edit property. |
| `quick-panel` | `quick-panel`, in the order of the table above. |
| `inspector-field` | A style property, composite or recipe: `inspector-style`, ordered by section, then group, then the order of the property (properties, then composites, then recipes) in `properties.json`, then the door's order in its command. Editor controls: the alignment matrix follows direction and wrap in Flex, the spacing link opens Margin and padding (margin before padding), the anchor control opens Anchors; custom declarations close the tab. An attribute, or the text of a text element: `inspector-settings`. |
| `toolbar` | The region of its toolbar: `top-bar`, `preview-bar`, `status-bar`, `activity-bar`, `canvas-toolbar`, `text-toolbar`; `breakpoint-tabs` → `canvas-frame`; `layers-header` → `explorer-layers`; `workbench-strip` → `dock-strip`. |
| `panel-control` | By its panel: `inspector` → the inspector region that holds it (header, selector bar, style, settings, interactions) or `field`; `explorer` → `explorer-pages` or `explorer-files`; `layers` → `layers-row`; `elements` → `insert`; `variables` → `styles`; `file-tabs` → `file-tabs`; `canvas-tools` → `canvas-toolbar`; `code-panel` → `code-view`; `timeline` → `dock-timeline`; `checks` → `dock-checks`; `workbench` → `dock-strip`; `tab-strip` → `tab-strip`; `status-bar` → `status-bar`; `guides-grids`, `snap-settings`, `recovery-dialog`, `tab-guard`, `color-picker`, `link-picker`, `asset-picker`, `toast`, `overlay`, `dialog`, `panel-header` → the region of the same name. |

What is not a command, and so not a door (`data-local` in the mockup): opening a menu, a popover or the quick panel (its chip); typing in a search field (the Insert search, the property search) before choosing a result; typing an address in the link prompt before Enter answers it; the palette's scope filters; starting to pick an interaction's target (the pick itself is a door); scrolling a panel. Read-only displays are not controls: the active breakpoint in the selector bar, the save state, sizes, counts, the class list of the Styles view, the check preview, key hints.

Build order. A door is shown disabled with "not available yet" until its feature is built, except in the context menu, which leaves it out. A disabled control is drawn clearly disabled (muted and at half opacity), never looking like one that works; the quick panel's bar leaves out an action that cannot act now, and a field draws its Reset only while there is a value to reset (the user's real-use audit, item 1.4). A shortcut has no drawing to show that: it runs when its command is built and its door's feature is the feature that introduces the command or already has all its commands built (`FEATURE_COMMANDS`); otherwise its chord stays reserved and does nothing (the rule is `src/editor/input/shortcut-rule.ts`, which the keymap and the door census both use). Drawn doors keep the rule they follow today: enabled once their command is built. A control that stands for an item a feature brings (an Insert tile and its palette entry's feature) is enabled only once that feature is registered as built in the feature table (`src/app/features.ts`), so a template of a feature still to come never inserts a bare element. The activity bar's Insert and Explorer buttons arrive with `palette-click-insert` and `layers-tree`, so `workspace.setPanelOpen` is introduced by `editor-shell`; the inspector's Style and Settings tabs arrive with `inspector-panel`, so `workspace.setActiveTab` is introduced there; the Interactions tab arrives with `events-actions`. The Explorer view draws Pages, Files and Layers from the start: until `explorer-pages` and the file features are built, the doors of Pages and Files are drawn disabled with "not available yet".

Face text. A control shows its door's label, or, when the drawing shows a shorter text, the door's face label (`faceLabelKey` in the manifest): "+ Class" for Apply a class, "Add" for Add an interaction. The label stays the control's accessible name and tooltip. A control that stands for an item (a palette entry, a section, a panel, an element) shows the item's name.

## Canvas

On the canvas only, never exported: a text element whose text is empty keeps a minimum height (canvas.emptyTextMinHeight) and a dashed outline in its own colour (spec text-edit-inline, Problems in Pager 4; the audit's A3.38).

The page renders inside an iframe scaled with CSS `zoom`. The frame sits 24 px from the left ruler; rulers (the `rulers` component, the top band) show page pixels, highlight the primary selection's extent (the `ruler-selection` component) and mark the pointer's place. Outlines draw a dashed box around every element (the first, the page's, is the `canvas-outlines` component); Zones tint every container's padding and hatch an empty container's content as a drop area (the first band is the `canvas-zones` component). Both are drawn over the page, never in it. The layout grids (column, row and dot, `Ctrl+'` and the canvas tools) are translucent bands and dots over the page, in the chrome too; their first column, first row and dots are the `grid-columns`, `grid-rows` and `grid-dots` components.

**Breakpoints belong to the page.** A breakpoint is the viewport width. Its tabs are attached to the top of the frame, ordered along the cascade from the base breakpoint, as `properties.json` lists them (desktop-first: Desktop 1440 "base", Laptop 1180, Tablet 834, Phone 390). When a breakpoint other than the base is active, the frame gets the breakpoint outline (`--color-mode-breakpoint`) and a band under the tabs reads "Tablet · 834 px — edits apply to Tablet" (`canvas.breakpointWarning`). The inspector shows the active breakpoint read-only, and values that come from another breakpoint wear the breakpoint origin colour.

**States belong to the element.** A state is part of the element's class selector (`.card:hover` applies to every element with `.card`). The state picker lives only in the inspector's selector bar. While a state other than Base is active:

- only the selected element's canvas label shows it ("Assinar agora · :hover", `canvas.elementState`, in the state colour);
- only the elements that have the target class are drawn in that state;
- the selector bar says how far the edit reaches (".btn:hover affects 3 elements", `inspector.affects.*`);
- no frame colour, band or toolbar control shows the state.

**Views.** Canvas (the default), Split (the canvas and the code pane side by side, the selection's lines highlighted and scrolled into view; clicking a line selects its element) and Code (the code pane alone). The View menu's item Split (`view.setEditorView`) switches to Split.

**Overlays and states drawn** (`design/final/shots/1440-NN-<state>.png`):

| State | What the canvas shows |
|---|---|
| default | The selection outline, its name label and size chip, and the quick panel chip beside it. |
| hover | The hover outline and size of the element under the pointer; with Alt held, the distance to the selection (`--color-canvas-measure`). |
| selection | Resize handles (8), radius handles (4), the rotation zone outside the top-right corner, padding, margin and gap bands; pressing a spacing handle opens the number field with its hint "Drag or type · Shift step 10 · Alt opposite side · Ctrl no snapping" (`canvas.handleHint`) on that handle's side of the element, following the label rule (the shot edits the bottom padding: the field sits below the card, over no content); the size chip hides while it is open. |
| drag | Dragging an element that is not selected selects it first; dragging an element that is part of the selection drags the whole selection. The inspector, Layers and the breadcrumb show what is being dragged. The ghost is a compact chip (a small thumbnail and the element name) beside the cursor; the drop indicator and the drop container outline are never under it; where the drop lands is read in two dimensions from the real boxes (the line the pointer is on, then its place along it as shown: a grid by its auto-flow, a flex by its direction, reverse included, inline children along the line), and the insertion line stands between the neighbours shown side by side (spec drag-reorder-canvas, Problems in Pager 5); the drop label reads "Drop in Grade de cartões · position 2 of 3". Arrow keys change the level (the key hint in the canvas toolbar). Dragging an Insert tile onto the page is a creation drag: its ghost is the element's icon and name, its label and the status bar read "Insert Paragraph · position 2 of 4 in Hero" ("Insert Container · into Actions" into an empty container), a parent that refuses the element is drawn refused with the refusal and no line, and off the page the status bar reads "Outside the page — release to cancel."; the selection keeps its solid outline. |
| multi | Each selected element outlined, the union dashed, one label "3 elements selected · 1248 × 390"; the inspector shows Mixed where values differ. |
| breakpoint | As above; the quick panel is open on the side with the most free space. |
| state | As above. |
| text | The text outline, the caret and the text selection; the floating text toolbar (Bold, Italic, Link) and the label "Editing text · Título principal" above the element, in free space. Ctrl+B, Ctrl+I, Ctrl+K do the same. |
| interaction | The target being picked, dashed in the target colour with its label; the matching Layers row marked; the dock open on the Timeline. The editing canvas never runs interactions. |

**Label rule** (selection name, "N elements selected", drop target, text editing, state, and the number field of a handle). The selection's label (a name, or "N elements selected") always sits above its element, whatever the element, never inside it (the user's decision, 2026-09-25); at the top of the canvas it stays above, held inside the canvas. Every other label never covers page content: it sits above its element when the space above is free; otherwise inside the element's top-left corner when that corner is free; otherwise below the element. When the name label moves below, the size joins it. A label hides while the pointer is over it. `npm run design:shots` fails when a label intersects page text or an image.

**Quick panel.** A small panel near the selection, collapsed to a chip (24 × 24) by default. Its fields may offer a declared subset of a property's values (the font stacks, the named weights), as Essentials only may. It exists to give typography, filters and skew a canvas door. It never covers the selection or the content directly above it; it goes to the side of the selection with the most free space (the page margin, or the canvas outside the frame). While text is edited, the text toolbar replaces it.

**Canvas doors (requirement 7, refined).** Geometric properties are edited with direct handles on the selection: size (resize handles), padding, margin, gap, radius, border width, shadow (offset and blur), rotation, position (move, anchors) and grid tracks. Typography (font, size, weight, line height, letter spacing, alignment, colour), filters (Effects) and skew get their canvas door as fields in the quick panel. Every such field runs the same command as the inspector field and writes the same document JSON.

## Inspector

Three tabs: Style, Settings, Interactions.

**Style tab**, top to bottom:

1. **Selector bar** (only in this tab): the element's icon, name and tag; the target chips — **Element** first, then each class; + Class; Save the styles as a class; the count of elements the target reaches; the state picker; the active breakpoint, read-only.
2. **Value-origin legend**: Here (this target, breakpoint and state), Other breakpoint, Other state, Inherited, Default. Every field and its label wear the origin colour of their value. A field's value is the value the document holds at this target, breakpoint and state, as written (a composite as its shorthand); with none there the field is empty and its muted placeholder shows the effective value (another breakpoint's or state's, else inherited or the default) and where it comes from. Nothing a field shows depends on the canvas zoom (spec inspector-provenance-reset, Problems in Pager 4).
3. **Essentials only / All properties** (`inspector.setMode`), remembered once chosen. **Add a property** (+) lists the properties that apply to the selection and that the tab does not draw yet; its filter takes the focus when it opens, Enter chooses the first listed, and the chosen property is drawn in its section with the focus in its field (`inspector.reveal`; spec inspector-add-property). **All properties offers every value for every control**: every value the browser data allows, the generated keywords and units Chrome, Firefox and Safari all support (`list: "generated"`: all four flex directions, every text-align value, every justify and align value including space-between, space-around and space-evenly, every flex-wrap value), plus every preset the manifest declares for the field (`offers.presets`: the font stacks, the named weights 100 to 900, the background-size, background-position, transform-origin and will-change presets, and any other). **Essentials only may offer fewer values, never more**: its list (`offers.essentials`, declared with its reason in `properties.json`) is always a subset of All properties' list. The quick panel may offer a declared subset (`offers.list`). A value the browsers do not act on is never offered: a keyword every browser parses but none implements (the Fragmentation values `region` and `avoid-region`, `blink`), and a keyword or unit the installed Chrome's own parser refuses (`break-before` and `break-after` `all`, `display: run-in`, a percentage in `columns`). `manifest/css-exclusions.json` names each with its evidence, `npm run gen` takes it out of every generated list, and `manifest:check` rule `exclusion` refuses it in any declared list. `tests/e2e/css-support.spec.ts` checks every keyword, value and unit any door offers with `CSS.supports` in the installed Chrome: the browser is the truth, not the compatibility data. `manifest:check` rule `all-properties` fails on an inspector field whose All properties list is a subset, and on an Essentials only value that All properties lacks for the same door.
4. **Find a property** (`inspector.search`, order 211, drawn above the sections): typing filters every section to the fields whose label or CSS name matches, a section with none not drawn, a collapsed one drawn open for the search; no match says so; emptying the field brings the sections back as they were (spec inspector-property-search).
5. **Sections**, always all eight and always in this order: Layout (display, direction and wrap, the alignment matrix, gap, grid, in parent, columns, scrolling, table), Space (the box model: margin outside, padding inside), Size, Position, Paint, Border, Text (with the text shadow: its layered editor and its CSS text field), Effects. Inside a section the fields follow the placement order of the manifest. A section is open until the user collapses it; the collapsed state is remembered per section, and a collapsed section shows a summary of its values (Position: static · z auto). The shots show sections as a user left them.

Every property field shows the CSS property name in its tooltip (`padding-top`, `background-color`). A field's unit menu, step buttons and reset are the `field` component. A value the field's command refuses is said beside the field too, the field in the error outline, in a short text, and the field shows the value it had (spec inspector-number-fields, Problems in Pager 3).

**The Element chip** styles only this element. The export writes those styles as a readable BEM class derived from the element's name, on that element only: an element of class `.card` named "Plano assinatura" gets `.card--plano-assinatura`, and an element with no class gets its own block or element class from its name (`.hero__title`). A numeric suffix is added only when two elements would get the same class (`.card--plano-assinatura-2`); the class is never a hash. Never a `style` attribute and never an `#id` selector, because the export has no inline styles.

**Settings tab**: General holds identity, content and type; Link holds address and new-tab behaviour; Image holds source and alternative text; Accessibility holds semantic fields; SEO holds page metadata; Attributes holds remaining HTML attributes, custom attributes and parts editors. Sections with no applicable field stay hidden. The link's three visible sections are General, Link and Attributes. The **HTML tag** field keeps a typed equivalent tag on Enter or blur, with browser suggestions. A button with no stored type shows the default `submit` in muted text. A field refusal appears beside that field. A custom-attribute draft is discarded when selection changes; a reserved name says which dedicated field owns it. A type or tag change previews the attributes it will remove and asks before discarding them. Inline text with marks is signalled at the Text field. A page's body title is called Tooltip, separate from Page title. The Styles class rows have Rename and Delete controls, and Delete shows how many elements use the class before confirmation.

**Interactions tab**: no selector bar. The element's name and tag, Add, then each interaction with its trigger, action, target and options, and **Applies to**: this element, or every element with its class ("Every element with .btn (3)").

## Files, tabs and code

The Explorer separates what the document generates from the user's own files:

- Each page's HTML, the generated stylesheet `css/styles.css` and, when the project has interactions, `js/interactions.js` carry a "generated" badge (`files.generated`). They cannot be deleted (a page file goes with its page). Editing a page's HTML or the stylesheet in the code view becomes commands on the document (`element.applyHtml`, `style.applyCssRule`): the document JSON is the source of truth. `js/interactions.js` opens read-only; interactions are edited in the Interactions tab.
- The user's files (images, fonts, JS, an imported CSS file no page links any more) are ordinary files: rename, move, delete, and edit and save in the code view (`files.saveContent`).

File tabs list the open pages and code files. A page tab shows the page on the canvas; a code file tab shows the file in the Code view.

The project is a file tree and the export is that same tree as a ZIP.

## Dock and status bar

The bottom dock is collapsed to its strip by default. Its tabs are **Timeline** and **Checks**; Keyboard shortcuts (Help) and Document (developer tools) open there as tabs when asked. Checks is one list with the categories Accessibility, Links, SEO and Export; the collapsed strip previews the first issue. Checks never block editing or export.

The status bar shows the last message, the selection path, the size, the breakpoint, the element count, the zoom, the language and the save state. A refusal's message goes with the next action, which shows its own message or none (an error never stays after it); every preference change (the theme, the language, a view switch, the Elements view, what each Layers row shows, the inspector's mode) says what it set, "Theme: Dark.", "Outlines: on."; folding a section, a group or a branch is not a preference change and says nothing; a message longer than the bar is cut with an ellipsis and read whole in its tooltip, and the bar's other items keep their size. It is the one coloured bar of the window (direction C): `--color-status-bar` with `--color-on-status-bar` for its text and icons.

## Keyboard model

The keymap is the shortcut doors of the manifest; there is no other list. Key contexts (`interactions.json`) decide which binding wins: text editing, menus, the palette, dialogs and fields do not inherit the global keys.

- **Ctrl+K** opens the command palette; inside text editing it is the link shortcut. **Ctrl+Shift+K** opens the palette in the global context (and so on the canvas, in Layers and in the panels that inherit it) and while editing text; menus, dialogs, fields and the palette itself keep their own keys.
- **Ctrl+D** duplicates and **Ctrl+P** previews: the Figma and Webflow conventions. Chrome does not reserve them; the page prevents their defaults.
- **Ctrl+B** hides and shows the left sidebar, and is Bold while editing text; **Ctrl+Alt+B** the inspector; **Ctrl+\\** every dock.
- Undo **Ctrl+Z**, redo **Ctrl+Shift+Z** or **Ctrl+Y**; copy, cut, paste; **Ctrl+Alt+C / V** copy and paste style.
- On the canvas: arrows walk the tree, **Enter** edits text, **F2** renames, **Delete** deletes, **Alt+↑ / ↓** move, **Alt+→** nests, **P** promotes, **R / C** wrap in a row or a column, **M** takes into the hand, **Esc** clears the selection.
- With something in the hand, the canvas's keys are the hand's: **↓ / →** aim at the next position, **Shift+↓ / →** at the previous one, **↑** climbs a receiver level, **←** descends, **Enter** places, **Esc** drops. The canvas draws the aim as a drag's drop indicator.
- In the inspector's text field (its own context, which inherits the field's): **Enter** keeps the text, **Shift+Enter** breaks the line, **Esc** puts back the text the document holds.
- In a field of the page's settings (Page title, Page language, Text direction): **Enter** keeps the value, as leaving the field does; the field keeps the field context's keys, and Enter submits the field's own form, so no shortcut is bound.
- In a number field of the inspector (its own context, which inherits the field's): **Enter** keeps the value, **Esc** puts back the value the document holds, **↑ / ↓** step by 1 (**Shift** 10, **Alt** 0.1), **Page Up / Page Down** by 10; Delete, Backspace, letters and Ctrl+Z edit the field's text only. Dragging the field's label scrubs it (1 step per 2 px, Shift ×10, Alt ×0.1; Esc cancels).
- Held keys have one meaning per gesture: **Shift** steps by 10 (or constrains), **Alt** measures or acts on the opposite side (resizes from the centre), **Ctrl** suspends snapping, **Space** pans.
- **F6 / Shift+F6** move focus between regions; every control is reachable with Tab and shows the focus ring (`--color-focus`).

## Glossary

One term per concept, in each language (`src/i18n/glossary.json`). `manifest:check` rule `label-term` fails when one label, in either language, names two different CSS properties, or when a concept's property is labelled other than its term.

| Concept | CSS property | English | pt-BR | Note |
|---|---|---|---|---|
| margin | `margin` | Margin | Margem | Never "Espaço", which names the Space section. |
| padding | `padding` | Padding | Padding | pt-BR keeps the CSS word: "Preenchimento" is the SVG fill. |
| gap | `gap` | Gap | Gap | Never "Espaçamento". |
| background | `background-color` | Background | Fundo | Its gradient and image layers are "Background layers" / "Camadas de fundo". |
| fill | `fill` | Fill | Preenchimento | SVG fill only: a box has a Background, never a Fill. |
| stroke | `stroke` | Stroke | Traço | SVG only; a box has a Border. |
| border | `border` | Border | Borda | |
| radius | `border-radius` | Radius | Raio | |
| outline | `outline` | Outline | Contorno | |
| opacity | `opacity` | Opacity | Opacidade | |

The quick panel follows the same terms: Background writes `background-color`, Fill writes the SVG `fill`, Gradient writes `background-image`.

## UI language

Everything on disk (code, file names, commits, this document) is in English. The UI language is switchable: English (`src/i18n/locales/en.json`) is the source catalogue and the default; Brazilian Portuguese (`pt-BR.json`) is a translation with the same keys and placeholders, chosen in View > Language or from the status bar. All UI text goes through i18n keys; `design:shots` renders the default state in pt-BR, where the longer labels are, and fails on any clipped text. The sample site content (the Aurora café) and the names users give to elements are user content and are never translated.

## Icons

**The editor has one icon library: [Lucide](https://lucide.dev)** (`lucide-static`, ISC license, the version `manifest/generated/icons.json` records). No component draws an icon of its own choice: every icon on screen is named by the manifest.

| What shows an icon | Where its name is |
|---|---|
| A door's control: every toolbar button (top bar, activity bar, canvas toolbar, frame tabs, text toolbar, preview bar, dock strip, status bar), every panel control drawn as an icon button, menu, context-menu and palette items that show one, quick panel buttons | `icon` of the door in `manifest/commands/*.json` |
| A button that opens a menu | `icon` of its anchor in `manifest/layout.json` |
| A panel: its dock tab (Timeline, Checks, Keyboard shortcuts, Document) and its palette entry ("Open …") | `panels` of `manifest/layout.json`, one per panel of `workspace.setPanelOpen`, which also holds the panel's name, its place (a sidebar view, a section of one, the inspector, the canvas tools, the workbench or a dock tab) and whether it is open at the first start |
| An element (Layers rows, the Insert grid, the breadcrumb, the selector bar) and a page (its root element, `page`) | `icon` of the element type in `manifest/elements.json` |
| A keyword of a keyword-buttons field drawn as icon buttons (Direction, Text align) | `icons` of the property in `manifest/properties.json`, one for every keyword its doors offer |
| The marks every control or item of a kind draws: a dropdown's arrow, a submenu's arrow, the expanded and the collapsed disclosure, a checked item, a folder of the Explorer, a size variable of the Styles view | `glyphs` of `manifest/layout.json` |

A file of the Explorer and of the file tabs shows its type as a text tag (HTML, CSS, JS) or, for an image, a thumbnail, never an icon; a colour variable shows its swatch. The code view's HTML / CSS / JS tabs are text.

How each toolbar and panel control is drawn is data too (`drawnAs` of the door, and of a menu anchor): `icon-button` (the icon alone; the label is its tooltip and accessible name), `button` (its label, after its icon when it names one), `primary` (a button filled with the accent: the region's main action, the top bar's Export), `segment` (one of a segmented group), `tab`, `item` (a row, a tile, a file tab, a chip or the top bar's page switcher, whose icon and text come from the item it stands for), `field` (an input, or a control drawn as one: the top bar's command palette search), `toggle`, `area` (part of a larger control: a ruler, a matrix, a backdrop), `disclosure` (a Layers caret, a section header, an Insert group header, the Layers header: its icon is the `expanded` or `collapsed` glyph by its state, so the door names none, and the glyphs are the one owner of the caret). Whether a control says whether its state is on is the door's `pressed`: always for an on/off switch (`toggle`), for an icon button or a button that is a toggle button, never for anything else, and alike for the doors of one command with the same arguments (manifest:check rule `pressed`); how a menu item says it stands for the current state is the door's `checked`: `radio` (one choice of a set: a theme, a language, a zoom level, a style state), `checkbox` (an option on or off: a Layers row detail) or none (a command). Both show a state only once the door's command is built. An inspector field's door has a `drawnAs` too: `field` (its property's control of `properties.json`: keyword buttons, a menu, a value field) or `button` (an editor's action such as Add a shadow, or one fixed value such as Spread).

`npm run gen` writes `manifest/generated/icons.json` (every icon name of the installed Lucide) and `src/ui/icons.svg` (a sprite with only the icons the manifest names); the shell draws icons only from that sprite, by the names the manifest gives. `manifest:check` rule `icon-name` fails on a name Lucide does not have (plant `icon-not-in-library`); rule `icon-required` fails on a toolbar door, an icon button or an icon-button menu anchor without an icon (plants `toolbar-door-without-icon`, `panel-button-without-icon`), on an icon given to a key, a gesture or a disclosure, on a panel without an icon, and on a keyword offered by a keyword-buttons field drawn with icons that has none.

Every icon is taken from what `design/final/` draws. The mockup draws its own sprite in Lucide's style; each of its symbols is the Lucide icon of the same drawing: `undo` → `undo-2` · `redo` → `redo-2` · `search` → `search` · `desktop` → `monitor` · `laptop` → `laptop` · `tablet` → `tablet` · `phone` → `smartphone` · `magnet` → `magnet` · `play` → `play` · `pause` → `pause` · `stop` → `square` · `loop` → `repeat` · `export` → `share` · `file` → `file` · `sliders` → `sliders-horizontal` · `plus` → `plus` · `chev-down` → `chevron-down` · `chev-right` → `chevron-right` · `eye` → `eye` · `eye-off` → `eye-off` · `lock` → `lock` · `unlock` → `lock-open` · `layers` → `layers` · `insert` → `square-plus` · `folder` → `folder` · `folder-plus` → `folder-plus` · `file-plus` → `file-plus` · `palette` → `palette` · `braces` → `braces` · `cols` → `columns-3` · `rows` → `rows-3` · `dots` → `grip` · `outlines` → `square-dashed` · `zones` → `square-square` · `ruler` → `ruler` · `guides` → `ruler-dimension-line` · `zoom-in` → `zoom-in` · `zoom-out` → `zoom-out` · `minus` → `minus` · `fit` → `scan` · `more` → `ellipsis` · `close` → `x` · `link` → `link` · `al-left` → `align-start-vertical` · `al-hcenter` → `align-center-vertical` · `al-right` → `align-end-vertical` · `al-top` → `align-start-horizontal` · `al-vmid` → `align-center-horizontal` · `al-bottom` → `align-end-horizontal` · `dist-h` → `align-horizontal-space-around` · `dist-v` → `align-vertical-space-around` · `arrow-right` → `arrow-right` · `arrow-down` → `arrow-down` · `arrow-up` → `arrow-up` · `wrap` → `text-wrap` · `box` → `square` · `header` → `panel-top` · `footer` → `panel-bottom` · `nav` → `menu` · `main` → `app-window` · `section` → `rows-2` · `article` → `file-text` · `aside` → `panel-right` · `linkblock` → `link-2` · `heading` → `heading` · `para` → `pilcrow` · `quote` → `quote` · `code` → `code` · `divider` → `separator-horizontal` · `list` → `list` · `olist` → `list-ordered` · `table` → `table` · `form` → `clipboard-list` · `input` → `text-cursor-input` · `button` → `rectangle-horizontal` · `image` → `image` · `video` → `video` · `audio` → `music` · `embed` → `code-xml` · `shapes` → `shapes` · `details` → `list-collapse` · `dialog` → `message-square` · `component` → `component` · `bolt` → `zap` · `diamond` → `diamond` · `a11y` → `accessibility` · `warning` → `triangle-alert` · `reset` → `rotate-ccw` · `grip` → `grip-vertical` · `check` → `check` · `hand` → `hand` · `move` → `move` · `target` → `locate-fixed` · `expand` → `chevrons-up-down` · `collapse` → `chevrons-down-up` · `panel-left` → `panel-left` · `panel-right` → `panel-right` · `panel-bottom` → `panel-bottom` · `split` → `columns-2` · `maximize` → `maximize` · `copy` → `copy` · `download` → `arrow-down-to-line` · `upload` → `arrow-up-to-line` · `trash` → `trash` · `type` → `type` · `droplet` → `droplet` · `sparkle` → `sparkles` · `radius` → `square-round-corner` · `border` → `square-dashed` · `opacity` → `contrast` · `rotate` → `rotate-cw` · `cursor` → `mouse-pointer-2` · `keyboard` → `keyboard` · `git` → `git-commit-horizontal` · `settings` → `settings` · `pen` → `pen-tool` · `history` → `clock-arrow-left` · `files` → `files` · `frame` → `app-window` · `globe` → `globe` · `scissors` → `scissors` · `clipboard` → `clipboard`. A door the mockup does not draw takes the icon the mockup draws for the same command with the same arguments (the Edit menu's Undo takes the top bar's `undo-2`); the other toolbar buttons and icon buttons (the preview bar, dialog close buttons, the parts editors, the Explorer's row actions) take the icon the mockup uses for the same act (`plus` to add, `trash` to delete, `x` to close or remove). A text button the mockup draws as text stays text (+ Class, Apply the HTML, Apply the CSS, Save, dialog buttons, the toast's Undo); one drawn with an icon keeps it (+ Add an interaction, Add keyframe).

Where the icons depart from the mockup's drawing, and why: every toolbar door names an icon, so the status bar's Fit, drawn as text in `design/final/`, shows the `scan` icon before its label; the text toolbar's Bold and Italic, drawn there as the letters B and I, are Lucide's `bold` and `italic`, which are those letters; Make child of previous layer is `corner-down-right`, not the mockup's right chevron, which is the submenu glyph and would read as opening a submenu. `design/final/` itself keeps its own sprite: where its drawing differs from Lucide's, Lucide's is the editor's.

## Density and tokens

Colours, type, spacing, sizes, radii and shadows come only from the custom properties of `src/ui/tokens.css`, generated by `npm run gen` (Style Dictionary 5) from `design/final/tokens.json`; `gen:check` fails when the CSS is stale or edited by hand. The only literal colours are the sample page's.

- Type: micro 10/14 semibold (badges, ruler numbers, file-type tags), overline 11/16 semibold with 0.66 px letter spacing (upper-case sidebar headers), caption 11/16, body 12/18, label 12/16 semibold, title 13/18 semibold, dialog 14/20, input 15/22, code 12/18 mono.
- Spacing scale: 0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32.
- Targets: 24 × 24 px at least (`--size-target-min`); rows 24; fields 24; top bar and picker controls 28.
- Radii: 2, 3, 4, 6, pill (direction C). Shadows: three elevations per theme.
- Code font (`--font-mono`: Cascadia Code, Cascadia Mono, Consolas, monospace) for code and for everything that is code-like wherever it appears: the code view, file names (the Explorer, the file tabs, the page picker), tags (Layers rows, the selector bar), class names (the selector bar's chips, canvas labels), and CSS values (every inspector value field, the box model's numbers, a collapsed section's summary).
- Colours per theme (direction C's palette, teal accent): surfaces, borders, text, accent, focus, the five value origins and their soft backgrounds, the canvas overlay colours (selection, hover, measure, padding, margin, gap, drop, target, handle), the mode colours (breakpoint, state, text editing) with their on-colours, the status bar and its on-colour, syntax colours for the code view, danger, warning, success and the scrim. `npm run gen` fails when an on-colour reads below 4.5:1 on its colour (on-accent, on-status-bar, on-mode-*, on-canvas-hover), or when text, muted or subtle text does on the surfaces it sits on.
- IDE-compact density (direction C): every row is one row high (24): sidebar rows and section titles, inspector section heads (upper-case overline) and property rows, one row per property, a label column (100 px) and a value column. A's visual controls (the alignment matrix, the box model, segmented keyword buttons, value fields) sit in the value column. Every inspector section is present and open until collapsed.
