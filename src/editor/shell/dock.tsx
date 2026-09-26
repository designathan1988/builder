// The bottom dock (DESIGN.md "Dock and status bar"): its strip with a tab for each open dock panel (the tab-strip
// component, the panel's icon from layout.json panels), show or hide, maximize, close the tab; its body when open.
import { useMemo } from 'react';
import { DoorControl, Icon } from '../doors/door.tsx';
import { doorSlots } from '../doors/placement.ts';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { PANELS, panelName, type Panel } from '../workspace/panels.ts';
import type { BodyTable } from './bodies.ts';
import { Slots } from './slots.tsx';

const TAB = doorSlots('tab-strip')[0];
// the strip's button that closes the tab it shows (its door's own arguments close a panel)
const CLOSE = doorSlots('dock-strip').find((d) => d.door.args.open === 'close');

// The Timeline tab: the doors the manifest places in dock-timeline, where the animation features' doors wait, each
// disabled with "not available yet" until its command is built (the user's correction of decision 2).
function Timeline() {
  return (
    <div className="dock-region" data-region="dock-timeline" data-key-context="timeline">
      <Slots region="dock-timeline" />
    </div>
  );
}

// The Document tab of Developer tools (spec workbench-panel, Problems in Pager 2): the document as it is now, as JSON,
// read-only, drawn again after every command that changes it.
function DocumentJson() {
  const t = useT();
  const document = useEditorState((s) => s.document);
  const text = useMemo(() => JSON.stringify(document, null, 2), [document]);
  return (
    <pre className="dock-document" tabIndex={0} aria-readonly="true" aria-label={t(panelName('document'))}>
      {text}
    </pre>
  );
}

// The body of each dock tab the editor draws; a tab without one says "not available yet" and the doors that only open
// it are not available yet (bodies.ts). Checks (no check exists yet) and Keyboard shortcuts arrive with their features.
export const DOCK_TABS: BodyTable = { timeline: Timeline, document: DocumentJson };

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
