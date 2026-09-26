// The clipboard port (ARCHITECTURE.md): the one way a command writes the system clipboard (clipboard.copy). A handler
// returns what to write in its outcome and stays pure; the store hands it to this port once the command has run. The
// editor's port writes the browser's clipboard (src/editor/clipboard.ts); tests pass one that records what it got, or
// none. What the clipboard holds is read by src/editor/clipboard.ts before a command that takes it runs.

export interface ClipboardWrite {
  // the text the clipboard holds as text/plain: the app's element format, readable back by clipboard.paste
  readonly text: string;
}

export interface ClipboardWriter {
  write(content: ClipboardWrite): void;
}
