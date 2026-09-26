# Settings grammar and coherent tag changes

The HTML content model owns label placement across palette clicks, drops, paste and structural moves. A label directly accepts phrasing elements and holds at most one labelable descendant. A refused insertion explains the rule without changing the document or history.

In a single select, selecting another option clears the former selection in the same undo step. A multiple select may keep several selected options. The options list in Settings exposes each option's Text and Value beside its move and remove actions. Summary and Legend expose a plain Text field while retaining any element children; the canvas and exported HTML render that text before the children.

Changing a Link's HTML tag to `button` warns that Link address and Open in a new tab will be removed. The command changes the tag and removes those attributes in one undo step. Settings immediately shows the fields of the new tag, and Undo restores the old tag and its data. The exported page contains no stale `href` or new-tab attributes.
