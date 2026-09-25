# elements-structure — Structure elements and the Link Block's link

How Pager behaves, read from its source and observed by running it from `.cache/pager-run` (Chrome, window 1600×900). Source references are `path:line` inside Pager.

## Trigger

- The Elements panel's **Structure and layout** group: Container, Header, Navigation, Main, Section, Article, Aside, Footer, Card and Link Block (`src/model/elements.js:11-21`, observed in the panel). A click on a tile inserts the element (the rules of palette-click-insert: into a selected container, after a selected leaf, at the end of the page with nothing selected); a drag places it (palette-drag-insert).
- The Link Block's link: the **href** text field of the inspector's Content section (`src/features/inspector/properties.js:2287`), shown for a Link Block.

## Result

- Each tile makes a container node (`src/model/templates.js:17-27`), named and styled:

| Tile | Tag | Layer name | Default styles |
|---|---|---|---|
| Container | `div` | Container | `padding: 0px` |
| Header | `header` | Header | `padding: 20px 40px; align-items: center` |
| Navigation | `nav` | **Nav** | `padding: 20px 40px; align-items: center` |
| Main | `main` | Main | `padding: 56px 40px` |
| Section | `section` | Section | `padding: 56px 40px` |
| Article | `article` | Article | `padding: 56px 40px` |
| Aside | `aside` | Aside | `padding: 24px` |
| Footer | `footer` | Footer | `padding: 20px 40px; align-items: center` |
| Card | `article` (the tile's hint says `div`) | Card | `padding: 20px` |
| Link Block | `a` | Link Block | none |

- The structure tags can be switched among each other afterwards (`src/model/tree.js:435`: div, section, header, main, footer, nav, aside, article).
- An interactive element (a link, a button, a form control, another Link Block) dropped or inserted inside a Link Block is refused with `An interactive element cannot sit inside a Link Block` (`src/model/grammar.js:47`, `:113`; `src/features/drag/drag.js:742`).
- The Link Block's href is stored as typed. Rendering and export pass it through `safeHref` (`src/model/urls.js:7-17`): a scheme other than http, https, mailto, tel or ftp becomes empty, and the export then writes `href="#"` (`src/features/export/index.js:159`). A Link Block with no href is exported with `href="#"` too.

## Visual feedback

| Stage | What is drawn |
|---|---|
| After a tile click | The new element on the canvas, selected, with its label; the Layers row appears. An empty container is drawn with the canvas's minimum height. |
| Link Block href typed | Nothing on the canvas (a link looks the same); an unsafe value is kept in the field and in the document without a word. |

## Undo and redo

Each insert is one undo step; each href change is one undo step.

## Keyboard equivalent

A focused tile inserts with Enter or Space (palette-click-insert). The href field takes the keyboard like any text field.

## Problems in Pager

1. **Card is a separate element type that is only an `article` under another name**, and its tile says `div` while it writes `article`. Required: there is no Card element type; the Structure group offers Container, Header, Navigation, Main, Section, Article, Aside, Footer and Link Block (`elements.json` palette), and cards come from templates.
2. **Navigation is named "Nav"** while its tile reads "Navigation". Required: a new element's layer name is its element label in the UI language (`Navigation`, numbered when taken, as palette-click-insert does).
3. **Header, Navigation and Footer get `align-items: center` without `display: flex`**, a declaration that does nothing and lands in the export. Required: an element's default styles are only declarations that act (the `defaultStyles` of `elements.json`: padding for the bands and bars); a Link Block is `display: block`, since it is a block link that holds other elements.
4. **An unsafe link is kept in the document and silently exported as `href="#"`**, and a Link Block without a link is exported as a link to `#`. Required: the Link field of the Settings tab (DESIGN.md `inspector-settings`, `element.setLink`) keeps a link on Enter or when the field loses focus, as one undo step, and the status bar names the element and the link (`status.link.set`); a value whose scheme is not http, https, mailto or tel is refused with `status.url.unsafe` naming it, and the document keeps its value; a Link Block with no link has no `href` (the export does not invent one).
5. **The refusal inside a Link Block is only in the drag's code path and its message names no element.** Required: every insert (tile click, Enter/Space on a tile, drag) of an interactive element (a Link Block, a link, a button, a form control) into a Link Block, or into an element inside one, is refused with `status.refused.interactiveInside` naming the Link Block, and nothing changes.
6. **An empty structure element would collapse** to no height on the canvas. Required (already true in the editor): an empty container keeps the canvas's minimum height (`canvas.emptyContainerMinHeight`), an editor aid never written into the document nor the export.
