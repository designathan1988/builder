# settings-audit — Organised, type-safe Settings

This extends the Inspector, form, class and inline-text specs for audit 7.1 and A3.1, A3.3, A3.5, A3.7, A3.9, A3.25 and A3.39. Pager has no separate Settings tab (`inspector-panel.md`); the existing Builder tab and the audited real-use cases define the interface. The manifest is authoritative for field doors, attribute applicability and section membership.

## Settings layout

Settings shows the manifest's General, Link, Image, Accessibility, SEO and Attributes sections in that order. A section is shown when the selected element has a field assigned to it; Attributes also holds the custom-attribute editor. Every shown section has its description. General identifies the element and its content. Link appears only for links, Image only for images, and SEO only for the page. A link shows General, Link and Attributes. The page's editor-grid controls live in Guides & Grids, not in Settings. A button whose type is not stored displays the HTML default `submit` as a muted default, while the document remains without an explicit type.

## Attribute rules

`src/core/elements/attributes.ts` owns validation of a value and its relationship to the selected element. Input type is a closed choice of every HTML input type listed in `elements.json`; a typed value outside it, including `potato`, is refused beside the field and changes nothing. Switching type states which stored attributes it will discard before the person accepts; confirming changes type and removes only inapplicable attributes in one undo step. Number, range, progress, meter, date, time, colour, pattern, autocomplete, name, rows, columns and canvas dimensions are checked against their HTML meaning. A minimum above an existing maximum, an out-of-range value and a malformed BCP 47 page language are refused beside the field. The controls for date/time, colour and range offer suitable native input affordances but dispatch the same manifest door.

Custom attribute names are case-insensitive for validation. A name owned by a dedicated field (`id`, `class`, `style`, `href`, `src`, `title`, `hidden`, `tabindex` and other manifest attributes), `srcdoc`, `contenteditable`, an editor-only `data-*` name, or an `on*` event handler is refused with a reason that names its owner where one exists. URL values use the one address rule of A3.2 when it arrives. The rejected draft belongs to the current node and is cleared on selection change. Until Interactions is built, an event-handler refusal does not direct the person there.

## Element grammar and tag changes

A label accepts phrasing content and at most one labelable control, whether insertion uses click, drag, paste or a structural command. A paragraph aimed inside a label is refused in place with a reason. In a single select, setting one option's Selected clears the former option in the same undo step; the options editor edits the option's text and value. Summary, Legend, table Caption, cells and list items expose their text in Settings. Changing an element's tag warns which incompatible fields will be removed. Link to button removes `href` and `newTab` in the same transaction; Settings immediately follows the new tag and hides Link fields. Undo restores the previous tag and attributes.

## Classes and marked text

The Settings Classes field uses the same project class registry as the Style selector bar. Adding a valid name creates a class definition if absent, and its chip can be selected as a style target. Renaming a class from Styles changes its project definition, every element's class list and the exported CSS together in one undo step. Deleting states its use count, asks for confirmation, removes the definition and its uses, and is undoable. The class picker is an overlay that does not reduce inspector width.

In inline text editing, Ctrl+B and Ctrl+I with no selection toggle marks for subsequent typing. The Settings text field indicates when the content has inline formatting, and editing its plain text preserves the existing marks where their ranges survive. The document's `inline` tree, canvas and export agree.

## Type-specific fields

Settings includes cite on blockquotes; start, reversed and type on ordered lists; Caption text and th scope in tables; accept and multiple for file inputs; cols, maxlength and minlength on textareas; low, high and optimum on meters; title, allow and loading on iframes; playsinline and preload on video. A page's body title is labelled Tooltip to distinguish it from Page title. Empty iframe title is reported by Checks (7.5). Each field renders to its HTML attribute, survives reload and is undoable.

## Problems in Pager and the prior Builder

Pager has no Settings tab or project class controls; Builder's flat field list buried context and omitted these type-specific fields. The audited Builder accepted malformed values, leaked reserved attributes into export, left stale drafts on another selection, kept hidden link data after a tag switch, let labels contain paragraphs, and made formatting shortcuts with an empty selection inert. Each correction above is required, including refusal without document change, one undo step per accepted edit and an exported terminal.
