// The tab guard (ARCHITECTURE.md; spec multi-tab-guard): one tab edits the project at a time. The first tab to open
// holds the editing lock (the browser's Web Locks, one lock for the project) for its life and edits; a tab that opens
// while another holds it is read-only (it writes nothing, the store refuses its document commands). Take over editing
// steals the lock and starts this tab again on the latest saved project; the tab it was taken from, its lock gone,
// becomes read-only at once ("lost"). A browser without Web Locks edits in every tab, as before.
const LOCK = 'builder-project-editing';

export type TabRole = 'editing' | 'readOnly' | 'lost';
let role: TabRole = 'editing';
const listeners = new Set<() => void>();
// this tab's role, for the store, autosave and the notice. Not editor state: no command changes it.
export const tabRole = {
  get: (): TabRole => role,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
function setRole(next: TabRole) {
  if (next === role) return;
  role = next;
  for (const listener of [...listeners]) listener();
}
export const isEditing = (): boolean => role === 'editing';

// Asks for the editing lock at start: held for the page's life when free, else this tab is read-only; the lock taken
// by another tab later makes it read-only then.
export function claimEditing(): Promise<void> {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return Promise.resolve();
  return new Promise((resolve) => {
    navigator.locks
      .request(LOCK, { ifAvailable: true }, (lock) => {
        if (lock === null) {
          setRole('readOnly');
          resolve();
          return undefined;
        }
        setRole('editing');
        resolve();
        return new Promise<void>(() => undefined);
      })
      .catch(() => setRole('lost'));
  });
}

// Take over editing: the lock stolen from the tab that holds it, then this tab started again, on the saved project.
export function takeOver(): void {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return;
  void navigator.locks.request(LOCK, { steal: true }, () => {
    window.location.reload();
    return new Promise<void>(() => undefined);
  });
}
