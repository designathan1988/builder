# inspector-property-search — Find a property in the Style tab

The Style tab's "Find a property…" field filters the tab down to the properties it names. Pager has no such filter (its
inspector lists every section); the behaviour here is the user's real-use audit, item 1.2, after Webflow's Style panel
search.

## Trigger

- Typing in "Find a property…" (the field of `inspector.search`, drawn above the sections, `inspector-style` order 211)
  runs `inspector.search` with what the field holds, at every change; Enter keeps it; emptying the field clears the search.
- The query is editor state (`ui.inspectorSearch`), kept while the selection changes and cleared by an empty query. It is
  never stored in the document nor in the preferences.

## Hit zones and thresholds

A field or an editor control matches when the query (trimmed, case and accents ignored) is part of its label, in the
language shown, or of one of the CSS names it edits (a composite: its own name and its longhands'; the box model: every
side of every box it draws).

## Visual feedback

- While a query is typed, each section shows only its matching fields and controls, in their usual order; a section
  with none is not drawn at all, header included. A collapsed section with a match is drawn open for the search, and
  its collapsed state is kept for when the search is cleared.
- The search looks at every property that applies to the selection, in Essentials only as in All properties.
- With no match, the tab says `No property matches "zzz".` where the sections would be.
- The status bar says `Showing the properties that match "letter".`, and `Search cleared; every property is shown.`
  when the field is emptied.

## Result in the document

None: a search changes nothing in the document.

## Undo and redo

Not undo steps.

## Nested elements

Not applicable.

## Zoom other than 100 %

Not affected.

## Keyboard equivalent

The field takes the focus by Tab like any field; Escape in it keeps the field's keys (it is a field).

## Problems in Pager

1. **"Find a property…" took text and filtered nothing** (the audit, item 1.2: the field existed with no command).
   Required: typing filters the sections and fields by label and by CSS name; typing `letter` on a paragraph leaves only
   Letter spacing (section Text); clearing brings every section back as it was.
