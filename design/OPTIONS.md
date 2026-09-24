# Interface options

Three static mockups of the full editor, one per direction. Open `design/<direction>/index.html` in Chrome; the dark control at the bottom right switches the drawn state and the theme (also `#state=<id>&theme=light|dark` in the URL). Each direction draws 12 states: the 10 of the brief plus `menu` (an app menu open) and `context` (the element context menu), added so the menu and context-menu command groups are visible. Screenshots are in `design/<direction>/shots/` (`1440-NN-<state>.png`, and `1920-01-default.png`). Tokens are in `design/<direction>/tokens.json` (DTCG); `tokens.css` holds the same values as CSS custom properties.

✓ meets · ◐ partly · ✗ does not. Requirements 12 and 13 were measured in every screenshot (targets under 24 px not spaced per WCAG 2.5.8, text overflowing its box, console errors): 0 findings in all 39.

| Requirement | A — classic refined | B — pen | C — studio |
|---|---|---|---|
| 1. Three-column skeleton | ✓ Insert/Files/Styles tabs over a permanent Layers pane · canvas · inspector | ✓ Rail (Insert, Layers, Files, Styles) + panel · canvas · narrow inspector | ✓ Activity bar + explorer (pages, files, layers) · canvas/code split · inspector |
| 2. Fixed, resizable panels; floating only as an option | ✓ Splitters on both columns and between Insert and Layers | ✓ Panels fixed with splitters; only the quick panel floats, by design | ✓ Splitters; code pane width is its own token |
| 3. Frequent controls never behind menus or popovers | ✓ Every inspector section open; palette and Layers both visible | ◐ Inspector shows essentials; the rest is behind "Todas as propriedades" or the property search; 8 quick-insert tiles, full palette one rail click away | ◐ Full palette is behind the activity bar (it replaces the explorer) |
| 4. Selector bar (classes, state, breakpoint); origin colour on every field; section dots; no blank field | ✓ Class chips with target, state and breakpoint pickers, 5-colour legend, effective values everywhere | ✓ Same, compact; values shown as effective value plus default hint | ✓ Property grid: origin colour on value and a bar on the label; source named in the row (Desktop, Base, body) |
| 5. Active breakpoint on the canvas frame and in the inspector | ✓ Frame header, inspector picker, top bar | ✓ Breakpoint tabs are the frame's own header; inspector pill | ✓ Breakpoint ruler above the canvas, frame header, inspector picker |
| 6. Held keys (Alt, Space, Ctrl); persistent modes on the canvas | ✓ Mode chips on the frame header (breakpoint, state, text, Alt, drag keys, picking); key hint line | ✓ Mode pill above the canvas HUD, coloured per mode | ✓ Mode chips on the frame header (small at 36 %) |
| 7. Figma-style handles; every visual property with a canvas and an inspector door | ◐ Resize, radius, padding, margin, gap, rotation handles and hint; the manifest has no canvas door for most typography, filters and skew | ◐ Same handles plus an inline number field; the quick panel reaches size, fill, gradient, border, effects, opacity, font size, text colour, move/rotate/scale | ◐ As A |
| 8. Events and timeline in one Interactions tab; timeline in the dock while editing | ✓ | ✓ | ✓ |
| 9. Bottom dock collapsed by default | ✓ 28 px strip | ✓ Merged into the 32 px bottom bar | ✓ Permanent 32 px strip with counts and the latest problem |
| 10. Palette (Ctrl+K, Ctrl+Shift+K) reaches commands, elements, pages, files, properties | ✓ Scoped results for all five | ✓ Central field in the top bar; sets a value inline with a preview (`preench 24`) | ✓ Prefixes `>` `@` `/` `#` |
| 11. No Chrome-reserved shortcut | ✓ All from the manifest | ✓ | ✓ |
| 12. Targets ≥ 24 px or spaced; focus visible | ✓ | ✓ | ✓ |
| 13. pt-BR, nothing clipped | ✓ | ✓ | ✓ |
| Canvas at 1440 × 900 | 888 px wide, page at 56 % | 920 px wide, page at 56 % | 564 px wide, page at 36 % (60 % at 1920) |
| Suits | Professionals coming from Webflow or Bricks who want every property in view and a predictable layout. | Designers who work on the canvas with the mouse and the palette and want the fewest panels. | Designer-developers who read and edit HTML and CSS next to the canvas. |
| Main risk | Density: the inspector is long and scrolls, the top bar is full at 1440, and it looks like the tools it replaces. | Less-used properties are one step away, and the quick panel covers the content just above the selection. | At 1440 the split leaves the page at 36 %, so handles and text are small; the code pane sync is the most work to build. |
