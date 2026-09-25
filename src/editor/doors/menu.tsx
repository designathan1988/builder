// Menus (ARCHITECTURE.md): a menu's button opens it; its items are the doors placed in "menu:<menu>" and the buttons
// of its submenus (menus anchored in it), in their order. An application menu shows every item: one whose command is
// not built yet is disabled with "not available yet" (DESIGN.md "Overlays"). Opening a menu is not a command, so which
// menu is open is this component's own state.
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { MenuId, MessageId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { useT } from '../text.ts';
import { Icon, useDoor } from './door.tsx';
import { GLYPHS, menuOf, slotsIn, type Anchor } from './placement.ts';

function MenuItem({ entry, onDone }: { readonly entry: DoorEntry; readonly onDone: () => void }) {
  const door = useDoor(entry);
  const t = useT();
  // how the item says it stands for the current state: the door's checked (radio, checkbox or none), manifest data
  const checked = entry.door.kind === 'menu' ? entry.door.checked : null;
  const icon = checked !== null ? (door.current ? GLYPHS.checked : null) : entry.door.icon;
  return (
    <button
      type="button"
      role={checked === 'radio' ? 'menuitemradio' : checked === 'checkbox' ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={checked !== null ? door.current : undefined}
      aria-disabled={door.available ? undefined : true}
      className={['menu__item', door.available ? '' : 'is-unavailable'].filter((c) => c !== '').join(' ')}
      data-door={entry.ref}
      title={door.title}
      onClick={() => {
        if (!door.available) return;
        door.run();
        onDone();
      }}
    >
      <span className="menu__icon">{icon !== null ? <Icon name={icon} size="sm" /> : null}</span>
      <span className="menu__label">{door.label}</span>
      {door.built || door.reason === null ? null : <span className="menu__reason">{t(door.reason)}</span>}
      {door.chord !== null ? <kbd className="menu__chord">{door.chord}</kbd> : null}
    </button>
  );
}

// A menu's items. A menu opened from its button takes the focus on its first item; a submenu is drawn with its menu
// and shown while the pointer is over its item or the focus is in it (shell.css), so no pointer listener is needed.
function MenuList({ menu, onDone, focusFirst }: { readonly menu: MenuId; readonly onDone: () => void; readonly focusFirst: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  const t = useT();
  useEffect(() => {
    if (focusFirst) list.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [focusFirst]);
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...(list.current?.querySelectorAll<HTMLElement>(':scope > [role^="menuitem"], :scope > .menu__sub > [role^="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
    next?.focus();
  };
  return (
    // tabIndex -1: a press inside the menu keeps the focus in it, so the menu stays open (MenuButton closes on blur)
    <div className="menu" role="menu" ref={list} tabIndex={-1} aria-label={t(menuOf(menu).labelKey as MessageId)} data-region={`menu:${menu}`} data-key-context="menu" onKeyDown={onKeyDown}>
      {slotsIn(`menu:${menu}`).map((slot) =>
        slot.kind === 'door' ? <MenuItem key={slot.entry.ref} entry={slot.entry} onDone={onDone} /> : <SubMenu key={slot.menu} menu={slot.menu} onDone={onDone} />,
      )}
    </div>
  );
}

function SubMenu({ menu, onDone }: { readonly menu: MenuId; readonly onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <div className={`menu__sub${open ? ' is-open' : ''}`}>
      <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open} className="menu__item" onClick={() => setOpen(!open)}>
        <span className="menu__icon" />
        <span className="menu__label">{t(menuOf(menu).labelKey as MessageId)}</span>
        <Icon name={GLYPHS.submenu} size="sm" />
      </button>
      <MenuList menu={menu} onDone={onDone} focusFirst={false} />
    </div>
  );
}

export interface MenuButtonProps {
  readonly menu: MenuId;
  readonly anchor: Anchor;
  // what the button shows instead of the menu's label (the zoom value, the language)
  readonly children?: ReactNode;
  // draw the dropdown glyph after the label
  readonly indicator?: boolean;
  readonly className?: string;
}

export function MenuButton({ menu, anchor, children, indicator = false, className }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const t = useT();
  const label = t(menuOf(menu).labelKey as MessageId);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLElement>('.menu-button')?.focus();
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  // a press anywhere outside the menu takes the focus out of it, and the menu closes
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  };
  const icon = anchor.icon !== null ? <Icon name={anchor.icon} size={anchor.drawnAs === 'icon-button' ? 'md' : 'sm'} /> : null;
  return (
    <div className={['menu-anchor', className ?? ''].filter((c) => c !== '').join(' ')} ref={root} onBlur={onBlur}>
      <button
        type="button"
        className={`menu-button menu-button--${anchor.drawnAs}${open ? ' is-open' : ''}`}
        data-menu={menu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={anchor.drawnAs === 'icon-button' || children !== undefined ? label : undefined}
        title={label}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon}
        {anchor.drawnAs === 'icon-button' ? null : (children ?? <span className="door__label">{label}</span>)}
        {indicator ? <Icon name={GLYPHS.dropdown} size="xs" /> : null}
      </button>
      {open ? <MenuList menu={menu} onDone={() => setOpen(false)} focusFirst /> : null}
    </div>
  );
}
