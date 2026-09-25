// The top bar (DESIGN.md "Regions"): the application menus, the page switcher, the command palette search, undo and
// redo, Preview and Export, in the order of region top-bar.
import { PRODUCT_MARK, PRODUCT_NAME } from '../../config/product.ts';
import { DoorControl, useDoor } from '../doors/door.tsx';
import { GLYPHS, breaksIn, drawnAsOf } from '../doors/placement.ts';
import { useEditorState } from '../store.ts';
import { Slots } from './slots.tsx';
import { Icon } from '../doors/door.tsx';
import type { DoorEntry } from '../../manifest/runtime.ts';

const BREAKS = breaksIn('top-bar');

function PageSwitcher({ entry }: { readonly entry: DoorEntry }) {
  const page = useEditorState((s) => s.document.pages[0]);
  return (
    <DoorControl entry={entry} className="top-bar__page">
      <b>{page?.name}</b>
      <span className="top-bar__file">{page?.file}</span>
      <Icon name={GLYPHS.dropdown} size="xs" />
    </DoorControl>
  );
}

function Search({ entry }: { readonly entry: DoorEntry }) {
  const door = useDoor(entry);
  return (
    <DoorControl entry={entry} className="top-bar__search">
      <span className="door__label">{door.label}</span>
      {door.chord !== null ? <kbd>{door.chord}</kbd> : null}
    </DoorControl>
  );
}

export function TopBar() {
  return (
    <header className="top-bar" data-region="top-bar" data-key-context="toolbar">
      <h1 className="top-bar__mark" title={PRODUCT_NAME}>
        <svg className="icon icon--lg" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
          {PRODUCT_MARK.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
        <span className="visually-hidden">{PRODUCT_NAME}</span>
      </h1>
      <nav className="top-bar__menus" aria-label={PRODUCT_NAME}>
        <Slots region="top-bar" to={5} />
      </nav>
      <Slots
        region="top-bar"
        from={6}
        render={(slot) => {
          if (slot.kind !== 'door') return undefined;
          // the page switcher stands for the current page (an item), the palette's search is drawn as a field
          const drawn = drawnAsOf(slot.entry);
          const control = drawn === 'item' ? <PageSwitcher key={slot.entry.ref} entry={slot.entry} /> : drawn === 'field' ? <Search key={slot.entry.ref} entry={slot.entry} /> : <DoorControl key={slot.entry.ref} entry={slot.entry} />;
          // a separator before each group the region's breaks start (layout.json)
          return BREAKS.includes(slot.order) ? [<span key={`break-${slot.order}`} className="separator" />, control] : control;
        }}
      />
    </header>
  );
}
