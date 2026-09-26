# settings-class-management — Reserved attributes and one project class registry

This is audit 7.1c (A3.3 and A3.9). It extends `settings-audit.md` and `shared-style-classes.md`. The existing Settings Classes field and the Style selector bar act on the same project registry in `src/core/design/classes.ts`.

## Custom attributes

The Add an attribute name is a draft of the selected element only. A new selection clears it even after a refusal. Names owned by dedicated fields (`style`, `class`, `id`, `href`, `src`, `title`, `hidden`, `tabindex`, `srcdoc`, `contenteditable` and the HTML names of manifest attributes) are refused before any document change. The message beside Attribute name points to the owning field; `style` directs the person to Style. Event handlers remain refused without promising an unavailable Interactions panel. Undo history remains unchanged by any refusal.

## Class application and targets

Typing valid words in Settings Classes replaces the element's class list and creates empty project class definitions for names not already defined, in one undo step. A class applied this way is immediately visible in Styles and its Style chip can be selected as the target. Renaming one project class changes its definition and every use on every page in one undo step; exported selectors and `class` attributes use the new name. A rename to an invalid or taken name is refused. Deleting a class states the number of elements using it in the confirmation, then removes the definition and every use in one undo step. Cancel leaves the project unchanged. A locked use prevents either action. The class picker is an overlay and never changes the inspector's width.

A legacy document may already list a valid class on elements without a project definition (the Aurora example lists `.card`). Clicking such a class chip registers its empty definition in one undo step and selects it as the Style target. Undo removes the new definition. Existing project-class chip clicks remain editor-only changes with no undo entry.

## End artifacts

The document's `classes` list and each element's classes agree after application, rename, delete, undo and immediate reload. The ZIP's HTML and CSS agree with the same names. A selected class target receives a Style edit shared by its users.

## Prior behavior

The audited Settings field wrote only an element's raw class words, leaving no project definition; its chip was inert. Styles listed classes without Rename or Delete. The Add a property draft could follow the next selection, and reserved custom names could leak an inline `style` or duplicate `id` into export. These are the defects this part removes.
