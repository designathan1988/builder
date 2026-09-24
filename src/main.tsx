import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import './editor/shell/shell.css';
import sprite from './ui/icons.svg?raw';
import { App } from './editor/App.tsx';
import { createEditorStore } from './editor/store.ts';

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

createRoot(container).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
