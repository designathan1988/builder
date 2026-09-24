// The bottom dock (DESIGN.md "Dock and status bar"): its strip with a tab for each open dock panel (the tab-strip
// component, the panel's icon from layout.json panels), show or hide, maximize, close the tab; its body when open.
import type { MessageId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';
import { DoorControl, Icon } from '../doors/door.tsx';
import { doorSlots } from '../doors/placement.ts';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { PANELS, hasContent, panelName, type Panel } from '../workspace/panels.ts';
import { Slots } from './slots.tsx';

const TAB = doorSlots('tab-strip')[0];
const CLOSE = doorSlots('dock-strip').find((d) => d.command.id === 'workspace.setPanelOpen');

function DockBody({ tab }: { readonly tab: Panel }) {
  const t = useT();
  // a panel without its content says so (panels.ts PANEL_CONTENT)
  if (!hasContent(tab)) return <div className="dock-body dock-body--empty">{t('common.notAvailableYet')}</div>;
  if (tab === 'timeline') {
    return (
      <div className="dock-body dock-body--timeline" data-region="dock-timeline" data-key-context="timeline">
        <Slots region="dock-timeline" />
      </div>
    );
  }
  if (tab === 'checks') {
    return (
      <div className="dock-body" data-region="dock-checks">
        {manifest.checks.categories.map((c) => (
          <div key={c.id} className="checks-category">
            <span className="checks-category__name">{t(c.labelKey as MessageId)}</span>
            <span className="checks-category__none">{t('checks.none')}</span>
          </div>
        ))}
      </div>
    );
  }
  // the Keyboard shortcuts and Document tabs show their content when their features are built
  return <div className="dock-body dock-body--empty">{t('common.notAvailableYet')}</div>;
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
                <DoorControl key={tab} entry={TAB} args={{ group: 'workbench', panel: tab }} className={tab === active ? 'is-active' : ''}>
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
