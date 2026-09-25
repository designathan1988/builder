import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import './editor/shell/shell.css';
import sprite from './ui/icons.svg?raw';
import { App } from './editor/App.tsx';
import { createEditorStore } from './editor/store.ts';
import { installTestPort } from './editor/test-port.ts';

const container = document.getElementById('root');
if (!container) {
  throw new Error('The #root element is missing from index.html.');
}

// The icon sprite (src/ui/icons.svg, generated from the icons the manifest names), once in the page, so every
// <use href="#name"> finds its symbol.
const icons = document.createElement('div');
icons.hidden = true;
icons.innerHTML = sprite;
document.body.prepend(icons);

const store = createEditorStore();
// what the end-to-end tests read, in development only (src/editor/test-port.ts)
installTestPort(store);

createRoot(container).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
