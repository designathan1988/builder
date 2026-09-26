// The status bar (DESIGN.md "Dock and status bar"): the last message in an aria-live region, the breadcrumb of the
// selection, the breakpoint, the element count, the zoom controls and the language, in the order of region
// status-bar, then the save state (autosave-restore). During a palette tile's creation drag the message is the drag's
// words (palette-drag-insert).
import { activeBreakpoint } from '../view/breakpoints.ts';
import { useSyncExternalStore } from 'react';
import type { MessageId } from '../../generated/ids.ts';
import { saveState, type SaveState } from '../persistence/autosave.ts';
import { allNodes } from '../../core/document/model.ts';
import { pluralForm } from '../../i18n/index.ts';
import { dragWords } from '../canvas/chrome.tsx';
import { MenuButton } from '../doors/menu.tsx';
import { drag } from '../input/pointer.ts';
import { drawnAsOf } from '../doors/placement.ts';
import { useEditorState } from '../store.ts';
import { panelName } from '../workspace/panels.ts';
import { messageText, useLocale, useT } from '../text.ts';
import { ZoomValue } from './canvas.tsx';
import { Slots } from './slots.tsx';


export function StatusBar() {
  const t = useT();
  const locale = useLocale();
  const message = useEditorState((s) => s.message);
  const document = useEditorState((s) => s.document);
  const count = [...allNodes(document)].length;
  // the breakpoint the canvas shows and its width (spec breakpoints-switch)
  const breakpoint = useEditorState((s) => activeBreakpoint(s.ui));
  // while a palette tile's creation drag goes on (pointer.ts), the message is the drop's own words, as its label reads
  // them on the canvas, or, off the page, that releasing cancels (spec palette-drag-insert, Problems in Pager 1 and 2)
  const dragging = useSyncExternalStore(drag.subscribe, drag.get);
  const words = dragging !== null && dragging.inserting !== null ? dragWords(document, dragging) : null;
  const shown = words ?? message;
  return (
    <footer className="status-bar" data-region="status-bar">
      <span className="status-bar__message" role="status" aria-live="polite">
        {shown !== null ? messageText(locale, shown) : null}
      </span>
      <Slots
        region="status-bar"
        render={(slot) => {
          // the region's item is the breadcrumb of the selection (DESIGN.md "Regions": 1 the breadcrumb)
          if (slot.kind === 'door' && drawnAsOf(slot.entry) === 'item') {
            // the breadcrumb of the selection: empty without one, then the breakpoint and the element count
            return [
              <nav key="breadcrumb" className="status-bar__breadcrumb" aria-label={t(panelName('layers'))} />,
              <span key="breakpoint" className="status-bar__item">
                {t('statusBar.breakpoint', { breakpoint: t(breakpoint.labelKey as MessageId), width: breakpoint.width })}
              </span>,
              <span key="count" className="status-bar__item">
                {t(`status.elementCount.${pluralForm(locale, count)}`, { count })}
              </span>,
            ];
          }
          if (slot.kind === 'menu' && slot.menu === 'zoom') {
            return (
              <MenuButton key={slot.menu} menu={slot.menu} anchor={slot.anchor}>
                <ZoomValue />
              </MenuButton>
            );
          }
          if (slot.kind === 'menu' && slot.menu === 'language') {
            return (
              <MenuButton key={slot.menu} menu={slot.menu} anchor={slot.anchor}>
                <span className="status-bar__language">{locale.toUpperCase()}</span>
              </MenuButton>
            );
          }
          return undefined;
        }}
      />
      <SaveStateLabel />
    </footer>
  );
}

// The save state, last in the bar (autosave: Not saved, Saving…, Saved, Save failed). A read-only display.
const SAVE_STATE_KEYS: Readonly<Record<SaveState, MessageId>> = { notSaved: 'status.save.notSaved', saving: 'status.save.saving', saved: 'status.save.saved', recoveryRequired: 'status.save.recoveryRequired' };
function SaveStateLabel() {
  const t = useT();
  const current = useSyncExternalStore(saveState.subscribe, saveState.get);
  // a write IndexedDB refused says why (spec unsaved-work-guard)
  const reason = useSyncExternalStore(saveState.subscribe, saveState.reason);
  return (
    <span className={`status-bar__item status-bar__save is-${current}`} data-save-state={current}>
      {reason !== null && current === 'notSaved' ? t('status.save.notSavedBecause', { reason }) : t(SAVE_STATE_KEYS[current])}
    </span>
  );
}
