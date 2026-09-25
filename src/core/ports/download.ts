// The download port (ARCHITECTURE.md): the one way a command hands the person a file (File › Save project's
// project.zip, the export). A handler returns the file in its outcome and stays pure; the store gives it to this
// port once the command has run. The editor's port saves it through the browser (src/editor/download.ts); tests
// pass one that records what it got, or none.

export interface DownloadFile {
  readonly name: string;
  // the file's media type
  readonly type: string;
  readonly bytes: Uint8Array;
}

export interface Downloads {
  deliver(file: DownloadFile): void;
}
