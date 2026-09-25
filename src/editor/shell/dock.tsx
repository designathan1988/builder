// The bottom dock (DESIGN.md "Dock and status bar"): its strip with a tab for each open dock panel (the tab-strip
// component, the panel's icon from layout.json panels), show or hide, maximize, close the tab; its body when open.
import { DoorControl, Icon } from '../doors/door.tsx';
import { doorSlots } from '../doors/placement.ts';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { PANELS, panelName, type Panel } from '../workspace/panels.ts';
import type { BodyTable } from './bodies.ts';
import { Slots } from './slots.tsx';

const TAB = doorSlots('tab-strip')[0];
const CLOSE = doorSlots('dock-strip').find((d) => d.command.id === 'workspace.setPanelOpen');

// The body of each dock tab the editor draws; a tab without one says "not available yet" and the doors that only open
// it are not available yet (bodies.ts). Timeline, Checks, Keyboard shortcuts and Document arrive with their features.
export const DOCK_TABS: BodyTable = {};

// the tab's panel, named after its tab
function DockBody({ tab }: { readonly tab: Panel }) {
  const t = useT();
  const Body = DOCK_TABS[tab];
  return (
    <div className={`dock-body${Body ? '' : ' dock-body--empty'}`} role="tabpanel" aria-label={t(panelName(tab))}>
      {Body ? <Body /> : t('common.notAvailableYet')}
    </div>
  );
}

export function Dock() {
  const t = useT();
  const tabs = useEditorState((s) => s.ui.panels.dockTabs);
  const active = useEditorState((s) => s.ui.layout.activeDockTab);
  const state = useEditorState((s) => s.ui.layout.dock);
  return (
    <section className={`dock dock--${state}`} aria-label={t(panelName('workbench'))}>
      <div className="dock-strip" data-region="dock-strip">
        <div className="dock-strip__tabs" role="tablist" data-region="tab-strip" data-key-context="tab-strip">
          {TAB
            ? tabs.map((tab) => (
                <DoorControl key={tab} entry={TAB} args={{ group: 'workbench', panel: tab }}>
                  <Icon name={PANELS[tab].icon} size="sm" />
                  <span className="door__label">{t(panelName(tab))}</span>
                </DoorControl>
              ))
            : null}
        </div>
        <span className="dock-strip__actions">
          <Slots
            region="dock-strip"
            render={(slot) => {
              if (slot.kind !== 'door' || slot.entry !== CLOSE) return undefined;
              return active !== null ? <DoorControl key={slot.entry.ref} entry={slot.entry} args={{ panel: active }} /> : null;
            }}
          />
        </span>
      </div>
      {state !== 'collapsed' && active !== null ? <DockBody tab={active} /> : null}
    </section>
  );
}
