// Text as a search compares it (ARCHITECTURE.md): lower case, without accents, so "ÉLÉMENT" finds "element". The command
// bar's query (src/editor/command-bar/command-bar.ts) and the Style tab's Find a property (src/editor/inspector/
// sections.ts) compare through it.
export const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
