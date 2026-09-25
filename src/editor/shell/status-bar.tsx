// The status bar (DESIGN.md "Dock and status bar"): the last message in an aria-live region, the breadcrumb of the
// selection, the breakpoint, the element count, the zoom controls and the language, in the order of region
// status-bar. The save state appears with the save feature.
import type { MessageId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';
import { allNodes } from '../../core/document/model.ts';
import { pluralForm } from '../../i18n/index.ts';
import { MenuButton } from '../doors/menu.tsx';
import { drawnAsOf } from '../doors/placement.ts';
import { useEditorState } from '../store.ts';
import { panelName } from '../workspace/panels.ts';
import { messageText, useLocale, useT } from '../text.ts';
import { ZoomValue } from './canvas.tsx';
import { Slots } from './slots.tsx';

const BASE_BREAKPOINT = manifest.properties.breakpoints.find((b) => b.base);

export function StatusBar() {
  const t = useT();
  const locale = useLocale();
  const message = useEditorState((s) => s.message);
  const document = useEditorState((s) => s.document);
  const count = [...allNodes(document)].length;
  return (
    <footer className="status-bar" data-region="status-bar">
      <span className="status-bar__message" role="status" aria-live="polite">
        {message !== null ? messageText(locale, message) : null}
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
                {BASE_BREAKPOINT ? t(BASE_BREAKPOINT.labelKey as MessageId) : null}
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
    </footer>
  );
}
