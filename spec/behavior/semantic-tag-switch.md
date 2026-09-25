# semantic-tag-switch — Switch an element between equivalent semantic tags

How Pager behaves, read from its source (it was not run for this spec). Source references are `path:line` inside Pager.

## Trigger

- The inspector's **Tag** row (`catalogueProperty({id:"tag",kind:"sel",…})`, `src/features/inspector/catalogue.js:248-249`), in its attributes group: a `<select>` drawn only when the element has more than one equivalent tag (`when: semanticTags(n).length>1`). Its options are the element's equivalent tags (`src/features/inspector/properties.js:3251`, `semanticTags(node)`).
- The quick panel's **Semantic type** select (`src/features/inspector/quick-panel.js:406-413`), with the same options, acting on every selected element.
- No shortcut.

## Result

- The equivalent tags (`semanticTags`, `src/model/tree.js:431-437`): a Button or a Link takes `button` or `a`; a Heading, a Paragraph, a Badge or a Preformatted element takes any of `h1`…`h6`, `p`, `span`, `pre`; a container whose tag is one of `div`, `section`, `header`, `main`, `footer`, `nav`, `aside`, `article` takes any of them. Every other element has its own tag alone and shows no Tag row.
- Choosing an option writes the node's `tag` field (`attrBind("tag")`, `catalogue.js:233-236`); the element keeps its type, name, children, text and styles, and the canvas draws the new tag.
- A tag outside the element's equivalents is refused without saying which rule refused it: the write returns `false` (`catalogue.js:677`) and the toast says only that the value was refused for the property (`properties.js:2666-2671`, `inspector.refused`). The quick panel puts the old value back without a word (`quick-panel.js:409`).
- A locked element, or one inside a locked element, refuses the write (`catalogue.js:674-675`) and the toast names the lock (`cmd.lockedNode`).
- An empty value clears the field (`attrBind`, `catalogue.js:235`), and the node falls back to its type's default tag (`tagOf`, `src/model/tree.js:163-166`); an unknown tag stored in a project is silently replaced by the default the same way.
- Nothing checks where the new tag lands: a container inside a `<footer>` can become a `<header>` (HTML forbids a header or a footer inside a header or a footer, and a `<main>` inside an article, an aside, a nav, a header or a footer), and the page exports invalid HTML.

## Visual feedback

| Stage | What is drawn |
|---|---|
| Element selected | The Tag row shows the current tag in its select. |
| After a switch | The canvas draws the new element (a heading drawn at its new level's size, a `pre` in a monospace font); the select shows the new tag. The status bar says nothing. |
| Refused | A toast with a generic refusal (inspector) or nothing at all (quick panel); the select shows the old tag again. |

## Undo and redo

Each switch is one undo step (`runEditorOperation`, `quick-panel.js:411`); undo gives back the old tag, redo the new one. A refused switch records nothing.

## Keyboard equivalent

Tab to the Tag select, then the arrow keys and Enter, as for any `<select>`.

## Problems in Pager

1. **A heading and a paragraph share one list of tags** (`tree.js:433`): a Heading switched to `span` or `p` stays a Heading in the layers and the inspector while the page draws a paragraph, and a Paragraph switched to `h2` is a heading that says it is a paragraph. Required: an element's equivalent tags are its own tag and the `alternativeTags` of its element type in `elements.json`, and nothing else: `div`, `section`, `header`, `main`, `footer`, `nav`, `aside` and `article` for a container, `h1`…`h6` for a Heading, `p`, `span` and `pre` for a Paragraph. Any other tag is refused with `status.tag.notEquivalent`, which names the tag and the element (`<p> is not an equivalent tag for Title.`); the document keeps its tag and nothing is recorded.
2. **A refused tag is not explained** (a generic toast in the inspector, silence in the quick panel). Required: every refusal is said in the status bar with the rule that refused it (Problems 1, 3 and 4), and the field shows the element's tag again.
3. **Nothing checks where the new tag lands**, so a switch can build HTML the content model forbids. Required: a switch is refused when the new tag may not sit in its parent (the content model's closed lists, `status.refused.onlyAccepts`: a `div` inside a `<dl>` cannot become a `section`), when an ancestor excludes the new tag from its descendants, or when the new tag excludes a tag among the element's descendants (the permitted descendants of `manifest/generated/html-elements.json`: no `header` or `footer` inside a `header` or a `footer`, no `main` inside an `article`, an `aside`, a `nav`, a `header` or a `footer`). The descendant rule is refused with `status.refused.notInside`, which names both tags (`Refused. <footer> cannot sit inside <header>.`); the document keeps its tag and nothing is recorded. The rules live in the content model (`src/core/elements/content-model.ts`), the one owner of which element may sit inside which.
4. **The lock is named, but not which lock** when the element sits inside a locked element. Required: a locked element refuses with `status.locked.edit` (`Unlock Hero before changing it.`); an element inside a locked element refuses with `status.locked.byAncestor`, which names the element and the lock (spec lock-element). The document keeps its tag and nothing is recorded.
5. **An emptied value silently writes the type's default tag**, and an unknown stored tag silently becomes the default. Required: the tag is the element's own and is never guessed: an emptied field changes nothing (the element keeps its tag, nothing is recorded, and the field shows the tag again); a project whose tag is not an equivalent tag of its element is refused when it is opened (document validation).
6. **The switch is a select only**, so a professional who knows the tag cannot type it. Required: the **HTML tag** field of the inspector's Settings tab (`element.setTag#inspector-tag`, drawn as a one-line text field after the text of a text element) takes a typed tag, kept on Enter or when the field loses the focus, and offers the element's equivalent tags as suggestions under it (the list read from `elements.json`, never re-listed in code). The typed tag is taken without the spaces around it and in lower case (`H4` keeps `h4`). A kept tag changes only the node's `tag`: its type, name, children, text, attributes, classes and styles stay, the canvas draws the new element, and the change survives an immediate reload. Each switch that changes the tag is one undo step, undo restoring the tag and the selection; keeping the tag the element already has records nothing. The status bar names the element and its new tag (`status.tag.set`, `Hero is now <article>.`).
