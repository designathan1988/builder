// UI text in the language the person chose (preferences), through the i18n runtime (src/i18n/index.ts).
import { useCallback } from 'react';
import type { Message, MessageParam } from '../core/commands/registry.ts';
import type { Locale, MessageId } from '../generated/ids.ts';
import { translate } from '../i18n/index.ts';
import { useEditorState } from './store.ts';

export type Translate = (key: MessageId, params?: Readonly<Record<string, MessageParam>>) => string;

function resolve(locale: Locale, params: Readonly<Record<string, MessageParam>>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params)) out[name] = typeof value === 'object' ? translate(locale, value.key) : value;
  return out;
}

export function textOf(locale: Locale, key: MessageId, params: Readonly<Record<string, MessageParam>> = {}): string {
  return translate(locale, key, resolve(locale, params));
}

export function messageText(locale: Locale, message: Message): string {
  return textOf(locale, message.key, message.params);
}

export function useLocale(): Locale {
  return useEditorState((s) => s.ui.preferences.locale);
}

export function useT(): Translate {
  const locale = useLocale();
  return useCallback((key, params = {}) => textOf(locale, key, params), [locale]);
}
