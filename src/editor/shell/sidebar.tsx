// The activity bar and the sidebar (DESIGN.md "Regions"): Explorer (Pages, Files, Layers), Insert (the element grid
// of elements.json's palette) and Styles (classes and variables). Rows and tiles are the doors of their regions, one
// per page, node or palette entry; a section's actions are the region's controls before its first item.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import { isFeatureBuilt } from '../../app/features.ts';
import { walk, type DocNode } from '../../core/document/model.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import type { CommandId, FeatureId, MessageId, RegionId } from '../../generated/ids.ts';
import { elementIcon, manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl, Icon, useDoor } from '../doors/door.tsx';
import { GLYPHS, doorSlots } from '../doors/placement.ts';
import { drag, modifierOf } from '../input/pointer.ts';
import { renamedNode } from '../layers/rename.ts';
import { paletteDensity, paletteMatches } from '../palette/palette.ts';
import { isExpanded, rowDetailsOf, searchView, type SearchView } from '../layers/tree.ts';
import { useEditorState, useStore } from '../store.ts';
import { isPanelOpen, panelName, type Panel } from '../workspace/panels.ts';
import { useT } from '../text.ts';
import type { BodyTable } from './bodies.ts';
import { Slots } from './slots.tsx';
import { Variables } from './variables.tsx';
import { classesOf, usesOfClass } from '../../core/design/classes.ts';
import { componentsOf } from '../../core/design/components.ts';


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
// a Layers row's plain click: the row's door of the layers-row-click gesture with no key held
const LAYERS_SELECT = requireDoor('layers-row', (d) => d.door.kind === 'panel-control' && d.door.gesture === 'layers-row-click' && d.door.modifier === null);
// the row's other clicks: the doors of the same gesture with a key held (Shift+click adds, Ctrl+click toggles)
const LAYERS_MODIFIED = doorSlots('layers-row').filter((d) => d.door.kind === 'panel-control' && d.door.gesture === 'layers-row-click' && d.door.modifier !== null);
// the row pressed with the secondary button: the door whose button is the secondary one (the context menu)
const LAYERS_SECONDARY = requireDoor('layers-row', (d) => d.door.kind === 'panel-control' && d.door.button === 'secondary');
const LAYERS_CARET = requireDoor('layers-row', (d) => drawnAs(d) === 'disclosure');
const LAYERS_BUTTONS = doorSlots('layers-row').filter((d) => drawnAs(d) === 'icon-button');
// the row's name: the control a number of clicks runs (its double-click renames the row's node in place, spec
// rename-element), and the field that takes the name's place while the node is renamed
const LAYERS_NAME = requireDoor('layers-row', (d) => d.door.kind === 'panel-control' && d.door.count !== undefined);
const NAME_CLICKS = LAYERS_NAME.door.kind === 'panel-control' ? LAYERS_NAME.door.count : undefined;
const LAYERS_NAME_FIELD = requireDoor('layers-row', (d) => drawnAs(d) === 'field' && d.door.adapter.selection === 'target');
// the search field above the rows: the region's field that acts on no selection (spec layers-search)
const LAYERS_SEARCH = requireDoor('layers-row', (d) => drawnAs(d) === 'field' && d.door.adapter.selection === 'none');
// an element tile: the item whose command takes a palette entry (a component tile takes a component)
const INSERT_TILE = requireDoor('insert', (d) => drawnAs(d) === 'item' && Object.values(d.command.args).some((a) => a.type === 'palette-entry'));
const INSERT_GROUP = requireDoor('insert', (d) => drawnAs(d) === 'disclosure');
// a component's tile (components.insertInstance): the project's components, after the element groups
const COMPONENT_TILE = requireDoor('insert', (d) => drawnAs(d) === 'item' && 'component' in d.command.args);
// the panel header's doors (DESIGN.md `panel-header`: Close the panel), drawn in the title of each sidebar view
const PANEL_HEADER = doorSlots('panel-header');

// A sidebar view's title: its name, and the panel header's doors, each standing for the view it acts on.
function ViewTitle({ panel, title }: { readonly panel: Panel; readonly title: string }) {
  return (
    <div className="view__title" data-region="panel-header">
      <span className="view__name">{title}</span>
      {PANEL_HEADER.map((entry) => (
        <DoorControl key={entry.ref} entry={entry} args={{ panel }} />
      ))}
    </div>
  );
}

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

// the current page's row is marked by its door's own current state (pages.switch), none before that command exists
function PageRow({ page }: { readonly page: { readonly id: string; readonly name: string; readonly file: string } }) {
  return (
    <div className="row">
      <DoorControl entry={PAGE_ROW} args={{ page: page.id }} className="row__main">
        <Icon name={elementIcon('page') ?? GLYPHS.folder} size="sm" />
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

// A row's name while its node is renamed (spec rename-element, layers/rename.ts): a field holding the name, which
// takes the focus with the whole name selected once it is drawn (after a menu that started the rename has given its
// own focus back), so typing replaces it. Enter (the form's submit) or leaving the field keeps what it holds, once:
// element.rename ends the rename, and the field that leaves the page then keeps nothing more.
function NameField({ node }: { readonly node: DocNode }) {
  const field = useDoor(LAYERS_NAME_FIELD, { target: node.id });
  const store = useStore();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const keep = (name: string) => {
    if (!field.built || renamedNode(store.getState().ui) !== node.id) return;
    (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(LAYERS_NAME_FIELD.command.id as CommandId, { ...LAYERS_NAME_FIELD.door.args, target: node.id, name });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    keep(input.current?.value ?? node.name);
  };
  return (
    <form className="row__rename" onSubmit={submit}>
      <input
        ref={input}
        className="row__name-field"
        type="text"
        defaultValue={node.name}
        aria-label={field.label}
        title={field.title}
        spellCheck={false}
        autoComplete="off"
        data-door={LAYERS_NAME_FIELD.ref}
        data-args={JSON.stringify({ target: node.id })}
        onBlur={(event) => keep(event.currentTarget.value)}
      />
    </form>
  );
}

// A node's row, then, while its branch is unfolded, its children's rows. A click on the row selects its node, a
// Shift+click adds it to the selection and a Ctrl+click toggles it (spec multi-select-click), a secondary click opens
// the context menu on it (spec context-menu); a click on a control
// of its own (the caret, Hide, Lock) runs that control's door alone. Its name is part of the row: a click on it selects
// as the row's does, and the click its door counts (the second of a double-click) renames the node the first click
// selected (spec rename-element); while the node is renamed, the name field takes the name's place. The primary
// selection's row
// is scrolled into view, at the nearest edge and without animation, whichever surface selected it (spec layers-tree,
// Problems in Pager 1). A hidden node's row is dimmed, and its Hide stays shown, pressed (spec hide-element); a
// locked node's row keeps its Lock shown, pressed (spec lock-element).
// What a row shows beside its name (spec layers-row-columns, layers.setRowDetails): its HTML tag, its id (#id), its
// classes (.a .b) and its attributes (name=value), each only while chosen.
function RowDetails({ node }: { readonly node: DocNode }) {
  const details = useEditorState((s) => rowDetailsOf(s.ui));
  const parts: string[] = [];
  for (const detail of details) {
    if (detail === 'tag' && node.tag !== null) parts.push(node.tag);
    if (detail === 'id' && typeof node.attributes.id === 'string') parts.push(`#${node.attributes.id}`);
    if (detail === 'classes' && node.classes.length > 0) parts.push(node.classes.map((c) => `.${c}`).join(' '));
    if (detail === 'attributes') {
      const own = Object.entries(node.attributes).filter(([name]) => name !== 'id').map(([name, value]) => (value === true ? name : `${name}=${String(value)}`));
      const custom = Object.entries(node.customAttributes ?? {}).map(([name, value]) => (value === '' ? name : `${name}=${value}`));
      if (own.length + custom.length > 0) parts.push([...own, ...custom].join(' '));
    }
  }
  return parts.length === 0 ? null : (
    <span className="row__meta" data-region="layers-row-details">
      {parts.join(' ')}
    </span>
  );
}

// A row of a text element whose text is empty says so beside its name (spec text-edit-inline, Problems in Pager 4):
// the canvas draws it with a minimum height, the Layers row names it empty.
const TEXT_TYPES: ReadonlySet<string> = new Set(manifest.elements.elements.filter((e) => e.content === 'text').map((e) => e.id));
function EmptyMark({ node }: { readonly node: DocNode }) {
  const t = useT();
  return TEXT_TYPES.has(node.type) && (node.text ?? '') === '' ? (
    <span className="row__meta" data-region="layers-row-empty">
      {t('layers.empty')}
    </span>
  ) : null;
}

function LayersRow({ node, depth, view }: { readonly node: DocNode; readonly depth: number; readonly view: SearchView | null }) {
  const door = useDoor(LAYERS_SELECT, { target: node.id });
  const rename = useDoor(LAYERS_NAME);
  const selected = useEditorState((s) => s.selection.includes(node.id));
  const primary = useEditorState((s) => s.selection[0] === node.id);
  // the tree is one Tab stop (spec layers-keyboard-navigation, Problems in Pager 3): the primary selected row, else the
  // page root's row, takes the Tab key; every other row is reached with the arrow keys
  const tabStop = useEditorState((s) => (s.selection[0] === undefined ? depth === 0 : s.selection[0] === node.id));
  const expanded = useEditorState((s) => isExpanded(s.ui, node.id));
  const renaming = useEditorState((s) => renamedNode(s.ui) === node.id);
  // a drag in progress, from Layers or from the canvas (spec layers-drag): the row its drop is placed against says
  // where (before, after, inside, or refused over the dragged nodes' own subtree), and the receiving parent's row is
  // marked, except while the drop is refused (Problems in Pager 4)
  const dropping = useSyncExternalStore(drag.subscribe, drag.get);
  const proposal = dropping?.proposal ?? null;
  const dropAt = proposal !== null && proposal.reference === node.id ? (proposal.refused ? 'refused' : proposal.placement) : undefined;
  const receiving = proposal !== null && !proposal.refused && proposal.placement !== 'inside' && proposal.parent === node.id;
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (primary) row.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }, [primary]);
  const store = useStore();
  const branch = node.children.length > 0;
  // while Layers is searched, only the rows that match and the rows above them show, unfolded (spec layers-search)
  const open = view !== null ? true : expanded;
  const match = view !== null && view.matches.has(node.id);
  // a click with no key held runs the row's own door (the rename on its name's counted click); with a key held, the
  // door of that key (none for another key)
  const select = (event: MouseEvent<HTMLDivElement>) => {
    const on = event.target instanceof Element ? event.target.closest('[data-door]') : null;
    const onName = on !== null && on !== event.currentTarget && on.getAttribute('data-door') === LAYERS_NAME.ref;
    if (on !== event.currentTarget && !onName) return;
    const held = modifierOf(event);
    if (held === null) {
      if (onName && event.detail === NAME_CLICKS) rename.run();
      else door.run();
      return;
    }
    const entry = LAYERS_MODIFIED.find((d) => d.door.kind === 'panel-control' && d.door.modifier === held);
    if (entry) (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(entry.command.id as CommandId, { ...entry.door.args, target: node.id });
  };
  // a secondary click anywhere on the row runs the row's secondary door (the context menu) instead of the browser's
  // own menu, except in the name field, whose text keeps the browser's; the keyboard's menu key is no door, so a
  // contextmenu event it sends is left to the browser
  const secondary = useDoor(LAYERS_SECONDARY, { target: node.id });
  const openMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 2) return;
    if (event.target instanceof Element && event.target.closest('[data-door]')?.getAttribute('data-door') === LAYERS_NAME_FIELD.ref) return;
    event.preventDefault();
    secondary.run();
  };
  if (view !== null && !view.shown.has(node.id)) return null;
  return (
    <>
      <div
        ref={row}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={branch ? open : undefined}
        aria-disabled={door.built ? undefined : true}
        aria-level={depth + 1}
        tabIndex={tabStop ? 0 : -1}
        className={`row row--tree${selected ? ' is-selected' : ''}${node.hidden === true ? ' row--hidden' : ''}${node.locked === true ? ' row--locked' : ''}${receiving ? ' is-receiving' : ''}${match ? ' is-match' : ''}`}
        data-drop-position={dropAt}
        style={{ '--depth': depth } as CSSProperties}
        title={door.title}
        data-door={LAYERS_SELECT.ref}
        data-args={JSON.stringify({ target: node.id })}
        onClick={select}
        onContextMenu={openMenu}
      >
        {branch ? (
          <DoorControl entry={LAYERS_CARET} args={{ target: node.id }} expanded={open}>
            {null}
          </DoorControl>
        ) : (
          <span className="row__caret-space" />
        )}
        <Icon name={elementIcon(node.type) ?? GLYPHS.folder} size="sm" />
        {renaming ? (
          <NameField node={node} />
        ) : (
          <span
            className="row__name"
            data-door={LAYERS_NAME.ref}
            data-args={JSON.stringify({ target: node.id })}
            tabIndex={-1}
            aria-disabled={rename.built ? undefined : true}
            title={rename.built ? rename.label : rename.title}
          >
            {node.name}
          </span>
        )}
        <RowDetails node={node} />
        <EmptyMark node={node} />
        <span className="row__actions">
          {LAYERS_BUTTONS.map((b) => (
            <DoorControl key={b.ref} entry={b} args={{ target: node.id }} />
          ))}
        </span>
      </div>
      {open
        ? node.children.map((child) => (
            <LayersRow key={child.id} node={child} depth={depth + 1} view={view} />
          ))
        : null}
    </>
  );
}

// The Layers search field (spec layers-search): each change runs layers.search with what it holds; Enter keeps it
function LayersSearch() {
  const field = useDoor(LAYERS_SEARCH);
  const query = useEditorState((s) => s.ui.layers.query);
  const store = useStore();
  const change = (text: string) => {
    if (!field.built) return;
    (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(LAYERS_SEARCH.command.id as CommandId, { ...LAYERS_SEARCH.door.args, query: text });
  };
  return (
    <form className="layers__search" data-door={LAYERS_SEARCH.ref} data-args="{}" onSubmit={(event) => event.preventDefault()}>
      <input
        className="search"
        type="search"
        placeholder={field.label}
        aria-label={field.label}
        title={field.title}
        disabled={!field.built}
        spellCheck={false}
        autoComplete="off"
        value={query}
        onChange={(event) => change(event.target.value)}
      />
    </form>
  );
}

// how many nodes the tree has, whatever is folded (spec layers-tree, Problems in Pager 3)
const nodeCount = (tree: DocNode): number => [...walk(tree)].length;

function Explorer() {
  const t = useT();
  const pages = useEditorState((s) => s.document.pages);
  const layersOpen = useEditorState((s) => isPanelOpen(s.ui, 'layers'));
  const tree = pages[0]?.tree;
  const query = useEditorState((s) => s.ui.layers.query);
  const view = useMemo(() => (tree ? searchView(tree, query) : null), [tree, query]);
  return (
    <section className="view" aria-label={t(panelName('explorer'))}>
      <ViewTitle panel="explorer" title={t(panelName('explorer'))} />
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
          {tree ? (
            <span className="section-title__count" data-count="layers">
              {nodeCount(tree)}
            </span>
          ) : null}
          <span className="section-title__actions">
            <Slots region="explorer-layers" render={(slot) => (slot.kind === 'door' && slot.entry === LAYERS_HEADER ? null : undefined)} />
          </span>
        </div>
        {layersOpen && tree ? (
          // the rows' region holds the search field above the tree (manifest: its door is placed in layers-row)
          <div data-region="layers-row">
            <LayersSearch />
            <div role="tree" aria-label={t(panelName('layers'))} data-key-context="layers-tree">
              <LayersRow node={tree} depth={0} view={view} />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// every palette entry, for the search's count of all the panel's entries
const PALETTE_SIZE = manifest.elements.palette.reduce((n, g) => n + g.entries.length, 0);
const tagOfElement = (element: string) => manifest.elements.elements.find((e) => e.id === element)?.tag ?? null;

function Insert() {
  const t = useT();
  const density = useEditorState((s) => paletteDensity(s.ui));
  const collapsed = useEditorState((s) => s.ui.preferences.collapsedGroups ?? NO_GROUPS);
  // what the search field holds: the panel's own view (a filter, not a command)
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  const groups = manifest.elements.palette.map((g) => ({ group: g, entries: g.entries.filter((e) => paletteMatches(query, t(e.labelKey as MessageId), tagOfElement(e.element))) }));
  const matches = groups.reduce((n, g) => n + g.entries.length, 0);
  return (
    <section className="view" aria-label={t('activity.insert')} data-region="insert">
      <ViewTitle panel="elements" title={t('activity.insert')} />
      <div className={`insert insert--${density}`}>
        <input className="search" type="search" placeholder={t('insert.search')} aria-label={t('insert.search')} data-local="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        {/* the densities fill the panel's width, each drawn by its icon with its name as its tooltip */}
        <div className="segmented segmented--wide segmented--icons" role="group">
          <Slots region="insert" render={(slot) => (slot.kind === 'door' && drawnAs(slot.entry) === 'segment' ? undefined : null)} />
        </div>
        {groups.map(({ group: g, entries }) => {
          if (searching && entries.length === 0) return null;
          // a search shows every group that matches, collapsed or not
          const open = searching || !collapsed.includes(g.id);
          return (
            <div key={g.id} className="palette-group">
              <DoorControl entry={INSERT_GROUP} args={{ group: g.id }} expanded={open} className="palette-group__header">
                <span className="door__label">{t(g.labelKey as MessageId)}</span>
                <span className="palette-group__count">{entries.length}</span>
              </DoorControl>
              {/* the tiles are the palette's key context: Enter and Space insert the focused tile's entry */}
              {open ? (
                <div className="tiles" data-region="palette-tiles" data-key-context="palette">
                  {entries.map((e) => (
                    <DoorControl key={e.id} entry={INSERT_TILE} args={{ entry: e.id }} className="tile" label={t(e.labelKey as MessageId)} ready={isFeatureBuilt(e.feature as FeatureId)}>
                      <Icon name={elementIcon(e.element) ?? GLYPHS.folder} />
                      <span className="tile__label">{t(e.labelKey as MessageId)}</span>
                      {density === 'list' ? <span className="tile__tag">{`<${tagOfElement(e.element) ?? ''}>`}</span> : null}
                    </DoorControl>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        <ComponentTiles query={query} density={density} />
        {searching ? <p className="insert__matches">{matches === 0 ? t('palette.search.noMatch', { query: query.trim() }) : t('palette.search.matchCount', { count: matches, total: PALETTE_SIZE })}</p> : null}
      </div>
    </section>
  );
}
const NO_GROUPS: readonly string[] = [];

// The Components group of the Insert view (DESIGN.md `insert` 7; spec reusable-components): a tile per component of the
// project that the search matches, which places an instance (its click, or its drag onto the page); no group while the
// project has none.
function ComponentTiles({ query, density }: { readonly query: string; readonly density: string }) {
  const t = useT();
  const text = useEditorState((s) => componentsOf(s.document).map((c) => c.name).join('\n'));
  const names = (text === '' ? [] : text.split('\n')).filter((name) => paletteMatches(query, name, null));
  if (names.length === 0) return null;
  return (
    <div className="palette-group">
      <div className="palette-group__header palette-group__header--static">
        <span className="door__label">{t('palette.group.components')}</span>
        <span className="palette-group__count">{names.length}</span>
      </div>
      {/* a component tile is a button of its own: Enter and Space press it (the palette key context inserts elements) */}
      <div className="tiles" data-region="palette-tiles">
        {names.map((name) => (
          <DoorControl key={name} entry={COMPONENT_TILE} args={{ component: name }} className="tile" label={t(COMPONENT_TILE.door.labelKey as MessageId, { component: name })}>
            {COMPONENT_TILE.door.icon !== null ? <Icon name={COMPONENT_TILE.door.icon} /> : null}
            <span className="tile__label">{name}</span>
            {density === 'list' ? <span className="tile__tag">{t('palette.group.components')}</span> : null}
          </DoorControl>
        ))}
      </div>
    </div>
  );
}

// The Styles view: its Classes and Variables sections, with the doors the manifest places in the styles region, each
// disabled with "not available yet" until its command is built (the user's correction of decision 2).
function Styles() {
  const t = useT();
  return (
    <section className="view" aria-label={t('activity.styles')} data-region="styles">
      <ViewTitle panel="variables" title={t('activity.styles')} />
      <div className="section-title">
        <span className="section-title__text">{t('styles.classes')}</span>
      </div>
      <StyleClasses />
      <Variables />
    </section>
  );
}

// The project's classes, read-only (DESIGN.md "Regions", styles; spec shared-style-classes): each name and how many
// elements have it; a class is edited through the selector bar.
function StyleClasses() {
  const t = useT();
  const text = useEditorState((s) => JSON.stringify(classesOf(s.document).map((c) => [c.name, usesOfClass(s.document, c.name)])));
  const rows = JSON.parse(text) as [string, number][];
  return (
    <ul className="style-classes">
      {rows.map(([name, count]) => (
        <li key={name} className="style-classes__row">
          <span className="style-classes__name">.{name}</span>
          <span className="style-classes__count">{count === 1 ? t('styles.count.one') : t('styles.count.other', { count })}</span>
        </li>
      ))}
    </ul>
  );
}

// The body of each sidebar view the editor draws; a view without one says "not available yet" and the doors that
// only open it are not available yet (bodies.ts).
export const SIDEBAR_VIEWS: BodyTable = { explorer: Explorer, elements: Insert, variables: Styles };

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
