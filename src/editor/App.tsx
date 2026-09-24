import { Shell } from './shell/shell.tsx';
import { StoreContext, type EditorStore } from './store.ts';

export function App({ store }: { readonly store: EditorStore }) {
  return (
    <StoreContext.Provider value={store}>
      <Shell />
    </StoreContext.Provider>
  );
}
