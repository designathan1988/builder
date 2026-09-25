// The browser's side of the download port (src/core/ports/download.ts): a file a command hands out is saved the way
// a person saves any download, through a link to it that is clicked once and then let go.
import type { Downloads } from '../core/ports/download.ts';

export const browserDownloads: Downloads = {
  deliver(file) {
    const url = URL.createObjectURL(new Blob([file.bytes.slice().buffer], { type: file.type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    // the browser has taken the file once the click is handled: the link's address is released afterwards
    setTimeout(() => URL.revokeObjectURL(url), 0);
  },
};
