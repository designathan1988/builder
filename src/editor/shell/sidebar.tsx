// The activity bar and the sidebar (DESIGN.md "Regions"): Explorer (Pages, Files, Layers) and Insert (the element grid
// of elements.json's palette); Styles (classes and variables) comes with its features. Rows and tiles are the doors of
// their regions, one per page, node or palette entry; a section's actions are the region's controls before its first
// item.
import type { CSSProperties } from 'react';
import type { DocNode } from '../../core/document/model.ts';
import type { MessageId, RegionId } from '../../generated/ids.ts';
import { manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl, Icon, useDoor } from '../doors/door.tsx';
import { GLYPHS, doorSlots } from '../doors/placement.ts';
import { useEditorState } from '../store.ts';
import { isPanelOpen, panelName, type Panel } from '../workspace/panels.ts';
import { useT } from '../text.ts';
import type { BodyTable } from './bodies.ts';
import { Slots } from './slots.tsx';

const ELEMENT_ICON = new Map(manifest.elements.elements.map((e) => [e.id, e.icon]));

const drawnAs = (entry: DoorEntry): string | null => (entry.door.kind === 'toolbar' || entry.door.kind === 'panel-control' ? entry.door.drawnAs : null);
const orderOf = (entry: DoorEntry): number => (typeof entry.door.placement === 'object' ? entry.door.placement.order : 0);

function requireDoor(region: RegionId, test: (entry: DoorEntry) => boolean): DoorEntry {
  const found = doorSlots(region).find(test);
  if (!found) throw new Error(`region ${region} has no such door`);
  return found;
}

// the order of a region's first item or field: the controls before it are the section's actions
function itemOrder(region: RegionId): number {
  const item = doorSlots(region).find((d) => drawnAs(d) === 'item' || drawnAs(d) === 'field');
  return item ? orderOf(item) : Number.POSITIVE_INFINITY;
}

const PAGE_ROW = requireDoor('explorer-pages', (d) => drawnAs(d) === 'item');
const PAGE_ACTIONS = doorSlots('explorer-pages').filter((d) => drawnAs(d) === 'icon-button' && orderOf(d) > orderOf(PAGE_ROW));
const LAYERS_HEADER = requireDoor('explorer-layers', (d) => drawnAs(d) === 'disclosure');
const LAYERS_SELECT = requireDoor('layers-row', (d) => d.command.id === 'selection.select');
const LAYERS_CARET = requireDoor('layers-row', (d) => drawnAs(d) === 'disclosure');
const LAYERS_BUTTONS = doorSlots('layers-row').filter((d) => drawnAs(d) === 'icon-button');
const INSERT_TILE = requireDoor('insert', (d) => d.command.id === 'element.insert');
const INSERT_GROUP = requireDoor('insert', (d) => drawnAs(d) === 'disclosure');

export function ActivityBar() {
  return (
    <nav className="activity-bar" data-region="activity-bar" data-key-context="toolbar">
      <Slots region="activity-bar" />
    </nav>
  );
}

function SectionTitle({ title, region }: { readonly title: string; readonly region: RegionId }) {
  return (
    <div className="section-title">
      <span className="section-title__text">{title}</span>
      <span className="section-title__actions">
        <Slots region={region} to={itemOrder(region) - 1} />
      </span>
    </div>
  );
}

function PageRow({ page }: { readonly page: { readonly id: string; readonly name: string; readonly file: string } }) {
  const current = useEditorState((s) => s.document.pages[0]?.id === page.id);
  return (
    <div className={`row${current ? ' is-active' : ''}`}>
      <DoorControl entry={PAGE_ROW} args={{ page: page.id }} className="row__main">
        <Icon name={ELEMENT_ICON.get('page') ?? GLYPHS.folder} size="sm" />
        <span className="row__name">{page.name}</span>
        <span className="row__meta">{page.file}</span>
      </DoorControl>
      <span className="row__actions">
        {PAGE_ACTIONS.map((a) => (
          <DoorControl key={a.ref} entry={a} args={{ page: page.id }} />
        ))}
      </span>
    </div>
  );
}

function LayersRow({ node, depth }: { readonly node: DocNode; readonly depth: number }) {
  const door = useDoor(LAYERS_SELECT, { target: node.id });
  const selected = useEditorState((s) => s.selection.includes(node.id));
  return (
    <>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-disabled={door.built ? undefined : true}
        aria-level={depth + 1}
        tabIndex={-1}
        className={`row row--tree${selected ? ' is-selected' : ''}`}
        style={{ '--depth': depth } as CSSProperties}
        title={door.title}
        data-door={LAYERS_SELECT.ref}
        onClick={door.run}
      >
        {node.children.length > 0 ? <DoorControl entry={LAYERS_CARET} args={{ target: node.id }} expanded /> : <span className="row__caret-space" />}
        <Icon name={ELEMENT_ICON.get(node.type) ?? GLYPHS.folder} size="sm" />
        <span className="row__name">{node.name}</span>
        <span className="row__meta">{node.tag}</span>
        <span className="row__actions">
          {LAYERS_BUTTONS.map((b) => (
            <DoorControl key={b.ref} entry={b} args={{ target: node.id }} />
          ))}
        </span>
      </div>
      {node.children.map((child) => (
        <LayersRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

function Explorer() {
  const t = useT();
  const pages = useEditorState((s) => s.document.pages);
  const layersOpen = useEditorState((s) => isPanelOpen(s.ui, 'layers'));
  const tree = pages[0]?.tree;
  return (
    <section className="view" aria-label={t(panelName('explorer'))}>
      <div className="view__title">{t(panelName('explorer'))}</div>
      <div data-region="explorer-pages">
        <SectionTitle title={t('explorer.pages')} region="explorer-pages" />
        {pages.map((p) => (
          <PageRow key={p.id} page={p} />
        ))}
      </div>
      <div data-region="explorer-files">
        <SectionTitle title={t('explorer.files')} region="explorer-files" />
      </div>
      <div data-region="explorer-layers" className="layers">
        <div className="section-title">
          <DoorControl entry={LAYERS_HEADER} expanded={layersOpen} className="section-title__toggle" />
          <span className="section-title__actions">
            <Slots region="explorer-layers" render={(slot) => (slot.kind === 'door' && slot.entry === LAYERS_HEADER ? null : undefined)} />
          </span>
        </div>
        {layersOpen && tree ? (
          <div role="tree" aria-label={t(panelName('layers'))} data-region="layers-row" data-key-context="layers-tree">
            <LayersRow node={tree} depth={0} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Insert() {
  const t = useT();
  return (
    <section className="view" aria-label={t('activity.insert')} data-region="insert">
      <div className="view__title">{t('activity.insert')}</div>
      <div className="insert">
        <input className="search" type="search" placeholder={t('insert.search')} aria-label={t('insert.search')} data-local="search" />
        <div className="segmented" role="group">
          <Slots region="insert" render={(slot) => (slot.kind === 'door' && drawnAs(slot.entry) === 'segment' ? undefined : null)} />
        </div>
        {manifest.elements.palette.map((g) => (
          <div key={g.id} className="palette-group">
            <DoorControl entry={INSERT_GROUP} args={{ group: g.id }} expanded className="palette-group__header">
              <span className="door__label">{t(g.labelKey as MessageId)}</span>
              <span className="palette-group__count">{g.entries.length}</span>
            </DoorControl>
            <div className="tiles">
              {g.entries.map((e) => (
                <DoorControl key={e.id} entry={INSERT_TILE} args={{ entry: e.id }} className="tile" label={t(e.labelKey as MessageId)}>
                  <Icon name={ELEMENT_ICON.get(e.element) ?? GLYPHS.folder} />
                  <span className="tile__label">{t(e.labelKey as MessageId)}</span>
                </DoorControl>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// The body of each sidebar view the editor draws; a view without one says "not available yet" and the doors that
// only open it are not available yet (bodies.ts). Styles (classes and variables) arrives with its features.
export const SIDEBAR_VIEWS: BodyTable = { explorer: Explorer, elements: Insert };

function EmptyView({ panel }: { readonly panel: Panel }) {
  const t = useT();
  return (
    <section className="view" aria-label={t(panelName(panel))}>
      <div className="view__title">{t(panelName(panel))}</div>
      <p className="view__empty">{t('common.notAvailableYet')}</p>
    </section>
  );
}

export function Sidebar() {
  const view = useEditorState((s) => s.ui.panels.sidebarView);
  const View = SIDEBAR_VIEWS[view];
  return <aside className="sidebar">{View ? <View /> : <EmptyView panel={view} />}</aside>;
}
