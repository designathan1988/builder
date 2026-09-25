# inspector-panel — The inspector shows the selection's identity, its tabs and collapsible property sections

How Pager behaves, read from its source and observed by the coordinator running it from `.cache/pager-run` (Chrome, window 1600×900). The author of this spec did not run Pager (no browser in this session): what the coordinator observed is marked "observed"; everything else is read from the source. Source references are `path:line` inside Pager; without a file name the file is `src/features/inspector/properties.js`. Test documents: the empty page with nothing selected, then a Section (with a Paragraph inside) selected.

## Trigger

- The inspector repaints itself after every selection change and every document change (`ppRender`, `:2743-2790`). With nothing selected it draws an empty state (`:2754-2773`); with an element selected it draws the identity header (`ppIdentity`, `:2793-2818`), the state picker (`ppContextBar`, `:2819-2826`), the property search (`ppNav`) and the sections (`ppPaintSections`, `:2924-2993`).
- A click on a section's header toggles that section (`:2975-2979`): the new open state is written to `ppOpen[home + ":" + section]`, stored in the preferences under `pb.inspector.open.v4` (`ppRememberOpen`, `:2613-2615`), the whole inspector repaints and the focus goes back to the header.
- The element actions button ("…", labelled "Element actions") in the identity header opens a menu (`:2810-2815`): Lock or Unlock, Hide or Show, the provenance panel, Reset every value. Lock and Hide call `toggleNodeFlag(node, "locked" | "hidden")` (`src/features/layers/layers-panel.js:722-733`), the function behind the Layers row buttons.
- The text of a text element is a textarea in the Content section (`PP_SPEC.text`, `:2284`; `ppTextArea`, `:860-868`), written on the textarea's `change` event, that is when it loses the focus, through `ppWrite` → `setProp` → `setProps` (`:2673-2681`; `src/features/inspector/catalogue.js:668-718`).
- Pager has no Style / Settings / Interactions tabs: one panel holds the Content section (text, tag, attributes, an inline `style` field) above the design sections.

## Layout (observed by the coordinator)

| State | What the inspector shows |
|---|---|
| Nothing selected | "Nothing selected", "Select something to edit it here.", a "Page properties" button and three tips: drag an element from Elements onto the page; click to select, Shift+click adds to the selection; double-click text to edit it in place (`:2754-2773`, texts `src/core/i18n.js:659-665`). |
| A Section selected | A header with the element's icon, the name "Section" and the tag `section`; a State picker; a property search; then the sections Content (tag menu, attributes, inline style), Layout (summary `block`; Display, Position buttons), Space (collapsed, summary `P 56px 40px`), Size (open, summary `auto × auto`; Width and Height), Paint, Border, Text, Effects (collapsed, summary `None`), and "Advanced properties". |

## Hit zones and thresholds

- A section's whole header row is its toggle: one `button` with `aria-expanded` holding the caret, the title, the summary and the marks (`:2960-2974`). The "why" button inside the header does not toggle (`stopPropagation`, `:2916-2918`).
- The element actions button is a small icon button (`ppIconButton`, size `sm`, `:2810`).
- No distance or time thresholds.

## Visual feedback

| Stage | What is drawn (read from the source) |
|---|---|
| Default open state | `isOpen` (`:2952-2953`): Content, Size, the element's "home" section (`homeSection`, `:279-284`: Text for text elements, Size for media and form controls, Layout otherwise) and Layout (except for text elements) start open; the others start collapsed. On a Section: Space, Paint, Border, Text and Effects start collapsed (observed for Space and Effects). While a search is typed every section shows open. |
| Section collapsed | Its body is hidden (`sb.hidden = !isOpen`, `:2984`), the caret turns, `aria-expanded="false"`; the header keeps its summary. |
| Summaries | On every header, open or collapsed (`:2967-2969`), made by `INSPECTOR_SUMMARIES` (`:344-370`): Layout the display (else `block`), Space `M … · P …`, Size `W × H` (else `auto × auto`), Text `size · weight`, Paint the background (else `None`), Border the edge and radius (else `None`), Effects the number of effects (else `None`); cut to 22–24 characters with `…` (`inspectorShort`, `:373`). The values come from `propValue` (`src/features/layers/layers-panel.js:736-742`): the element's own value, or the value of the breakpoint or state being edited. |
| Element actions | A menu under the button. Lock/Unlock and Hide/Show name what the item will do (`:2811-2812`). A toggle writes no status message; a refused toggle writes `🔒 <name> is locked — click the lock in its bar to move it` into a developer readout, not the status bar (`layers-panel.js:724-727`, `i18n.js:1773`). |
| Text typed | Nothing changes on the canvas until the textarea loses the focus; Enter adds a new line. A refused write (a locked element) shows the same "locked … move it" words in a toast and repaints the field (`ppRefusal`, `:2667-2672`; `:2676-2680`). |

## Result in the document

- Collapsing or expanding a section changes nothing in the document: the open states live in the preferences, per element kind.
- The text field writes the text of **every** selected element (`setProps` over `selection.all()`, `catalogue.js:668-675`); writing the text they already have writes nothing (`sameProp`, `catalogue.js:699`).
- Lock and Hide set or clear `locked` and `hidden` on the node (`nwToggleBoolean` in a transaction, `layers-panel.js:730`).

## Undo and redo

- Collapsing and expanding are not undo steps.
- A text write, a lock and a hide are one transaction each (read from the source: `runInspectorProps`, `catalogue.js:66`, called at `:700`; `transaction(...)`, `layers-panel.js:730`).

## Nested elements

The inspector shows the selected element (the primary one with several). A write on an element inside a locked ancestor is refused and names the ancestor (`lockedAncestorOf`, `catalogue.js:674-675`; `layers-panel.js:724`).

## Zoom other than 100 %

Not affected: the inspector is outside the zoomed frame.

## Keyboard equivalent

- Section headers are buttons: Tab reaches them, Enter or Space toggles, and the focus stays on the header after the repaint (`:2977-2978`).
- The element actions menu opens from its button with the keyboard like any menu.
- The textarea is edited with the keyboard; only leaving it (Tab) writes the text.

## Our contract where the intent, Pager and DESIGN.md differ

The manifest, DESIGN.md and the other specs win over Pager and over the feature's intent (which is guidance only):

- **Tabs.** The inspector has three tabs in its header (DESIGN.md "Inspector"): Style (the selector bar, then the value-origin legend, Essentials only / All properties, the property search and the sections) and Settings arrive with this feature (`workspace.setActiveTab#inspector-tab-style`, `#inspector-tab-settings`); Interactions arrives with events-actions. Style is the tab shown at start. The chosen tab stays chosen when the selection changes.
- **Sections.** The Style tab shows always all eight sections, in this order: Layout, Space, Size, Position, Paint, Border, Text, Effects (DESIGN.md), whatever the element type; the intent's "Content" section is the Settings tab. Later entries may add sections after Effects.
- **Settings tab.** It has no selector bar: its region (`inspector-settings`) starts right under the inspector header. It holds the text of a text element first, then the attribute fields in their manifest order (DESIGN.md "Settings tab"). The text field is drawn when exactly one text element is selected (its door's adapter selection is `single`).
- **Summaries.** A collapsed section shows a summary of its values on its header row (DESIGN.md: "a collapsed section shows a summary of its values (Position: static · z auto)"; `design/final/shots/1440-01-default.png`); an open section shows its fields instead.
- **The Style tab's region is as tall as what it shows.** The inspector column scrolls the Style tab; the element that carries `data-region="inspector-style"` is the tab's content (legend, mode switch, search, sections), so its height is the height of what the tab shows and collapsing sections makes it shorter. The scenarios measure it, as the Layers scenarios measure `explorer-layers`.

## What this feature must do

1. **Nothing selected.** The Style tab says "Nothing selected" (`inspector.nothingSelected`) and three short hints that name this editor's panel and keys: insert an element from Insert (a click or a drag onto the page); click to select, Shift+click adds; double-click or Enter edits a text. The hints come first; the sections stay drawn below them with their fields empty (the doors of future features wait there, and the census and `current-state.spec.ts` read them at a fresh start). Page properties is the header's door (`page.openProperties#inspector-page-properties-button`, header order 4), drawn in every state and disabled with "not available yet" until page-properties is built; the feature table says which features are built, and the test reads it.
2. **Identity.** With one element selected the selector bar shows the element type's icon (`elements.json`, the icon of its Layers row and its Insert tile), its name and its tag as exported (`body` for the page root). With several selected it says how many (`canvas.selectedCount`).
3. **Sections collapse and expand.** A click on a section's header, or Enter or Space on it, toggles that section (`inspector.toggleSection`, no history, no document change); its body is hidden or shown and the focus stays on the header. Every section starts open. The collapsed set is one per section, the same for every element: a section collapsed on a Paragraph is collapsed on a Section too. It survives selection changes and is kept in the one preferences store (`src/editor/preferences/preferences.ts`), so it survives a reload.
4. **Summaries.** A collapsed section's header shows a summary built from the effective values its fields show (DESIGN.md: "a field never shows a blank: it shows the effective value and where it comes from"): Layout the display (and the direction for flex), Space `M … · P …`, Size `W × H`, Position `position · z z-index`, Paint the background or "None", Border the edge and radius or "None", Text `size · weight`, Effects the number of effects or "None". Every word through i18n.
5. **Text field.** In the Settings tab, the text of the one selected text element. Typing changes only the field (the field key context inherits no global or canvas key: `p`, `r`, `c`, `m`, Delete and Ctrl+Z act on the field). Enter commits: `text.set` writes the text into the document JSON as one undo step, the canvas shows it and the status bar says "Saved the text of <name>." (`status.textEdit.committed`). Shift+Enter inserts a line break (stored as "\n", as in text-edit-inline). Leaving the field (Tab, a click elsewhere) commits the same way. Escape puts back the stored text and writes nothing; the status bar says "Kept the text of <name> unchanged." (`status.textEdit.cancelled`). The keys are doors of the field's own key context, `element-text-field`, which inherits the field's (so Ctrl+A, the arrows, Ctrl+Z and typing stay the text area's own): Enter is `text.set#key-enter-in-element-text-field` (its content is what the field holds), Escape is `text.cancelEdit#key-escape-in-element-text-field`; Shift+Enter is bound nowhere there, so the text area inserts its own line break, which Enter then keeps. The same text records nothing. On a locked element the commit is refused: the document is unchanged, the status bar says "Unlock <name> before editing its text." (`status.locked.editText`) and the field shows the stored text again.
6. **Element actions.** The menu of the header's "…" button (`menu:element-actions`) offers Lock (`element.toggleLock#menu-element-actions`) and Hide (`element.toggleHidden#menu-element-actions`), the same commands as the Layers row buttons, on the primary selected element, each one undo step, with the status bar's "Locked: <name>" / "Unlocked: <name>" / "Hidden: <name>" / "Visible: <name>". Inside a locked ancestor both are refused with "<name> is locked by <ancestor>; unlock <ancestor> first." (`status.locked.byAncestor`) and the document is unchanged. With nothing selected both are disabled with "Select an element first." (`refusal.nothingSelected`). Reset every value (`style.resetAll`) is the menu's third item and arrives with inspector-provenance-reset.

## Problems in Pager

Each item is a requirement for this editor.

1. **The open state depends on the element kind.** Pager keys it by `homeSection(node) + ":" + section` (`:2952-2953`, `:2976`) and starts Space, Paint, Border, Text and Effects collapsed on a Section, but Text open on a Paragraph, so collapsing Text on a Paragraph leaves it open on a Section and a person meets a different inspector for each kind. Required: every section starts open (DESIGN.md); the collapsed state is one per section for every element, kept across selections and after a reload.
2. **The summary ignores values that come from elsewhere.** `propValue` (`layers-panel.js:736-742`) reads the element's own value only, and the summary falls back to fixed words (`block`, `auto × auto`, `static`, `visible`, `INSPECTOR_SUMMARIES`, `:344-370`), so a display, width or padding set by a class or at another breakpoint is summarised as the default. Required: the summary is built from the effective values the section's fields show.
3. **The text is written only when the field loses the focus.** Enter adds a new line, nothing commits from the keyboard but Tab, nothing cancels, and the canvas shows nothing while typing (`ppTextArea`, `:860-868`). Required: Enter commits as one undo step, Shift+Enter inserts a line break, leaving the field commits, Escape restores the stored text and writes nothing.
4. **The text field writes every selected element** (`setProps` over `selection.all()`, `catalogue.js:668-675`), so two selected paragraphs get the same text. Required: the text field edits one element (its door's adapter selection is `single`); it is drawn only when exactly one text element is selected.
5. **A refusal says the wrong thing in the wrong place.** A locked element's text change toasts "🔒 <name> is locked — click the lock in its bar to move it" (`:2676-2680`, `ppRefusal` `:2667-2672`), and a refused Lock or Hide writes it to a developer readout (`layers-panel.js:724-727`). Required: the status bar says "Unlock <name> before editing its text." for the text, and "<name> is locked by <ancestor>; unlock <ancestor> first." for Lock and Hide inside a locked ancestor; the document is unchanged.
6. **Lock and Hide from the inspector say nothing when they succeed** (`toggleNodeFlag`, `layers-panel.js:722-733`). Required: "Locked: <name>", "Unlocked: <name>", "Hidden: <name>", "Visible: <name>" in the status bar, as for every door of lock-element and hide-element.
7. **A second way into page properties.** The empty state's button clicks another button found by its DOM id (`document.getElementById("pageProperties")`, `:2767`). Required: Page properties is one door of the manifest, in the inspector header; the empty state draws no button of its own.
8. **The tips name Pager's panels** ("Drag an element from Elements…", `i18n.js:663-665`) and only the double-click for text. Required: the hints name this editor's Insert panel and keys (double-click or Enter edits a text), in both languages.
9. **The identity's icon comes from a table inside the inspector** (`PP_TAGICON`, `:2791-2792`), keyed by tag, so it can differ from the element's Layers row. Required: the icon of the element type in `elements.json`, the element's name and its exported tag.
10. **An inline `style` field** sits among the attributes (`PP_SPEC.style`, `:2302`). Required: no field writes a `style` attribute (the export has no inline styles); the Settings tab holds the text and the attributes of `elements.json`.
11. **The search and the mode are reset on every selection change** (`:2750`). Not this feature's (inspector-property-search, inspector-advanced-mode), noted for them: the collapsed sections of this feature are not reset.

## Open question (for the coordinator)

The manifest draws the two Element actions items with `checked: null`: the item reads "Lock" even on a locked element, where it unlocks it. Pager flips the label (Lock/Unlock). Proposal: `checked: "checkbox"` on `element.toggleLock#menu-element-actions` and `element.toggleHidden#menu-element-actions`, so each item says whether the primary selected element is locked or hidden. Not changed here: it is door data, outside this phase.
