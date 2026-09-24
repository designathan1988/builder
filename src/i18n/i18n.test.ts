import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, MESSAGE_IDS, type MessageId } from '../generated/ids.ts';
import { formatMessage, isLocale, translate, translator, type Locale, type MessageParams } from './index.ts';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

const catalogues: Record<Locale, Readonly<Record<string, string>>> = { en, 'pt-BR': ptBR };

// A value for every placeholder of a key, so that every text can be formatted.
function paramsFor(key: MessageId): MessageParams {
  const names = [...en[key].matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '');
  return Object.fromEntries(names.map((name) => [name, `<${name}>`]));
}

function expected(locale: Locale, key: MessageId): string {
  const text = catalogues[locale][key];
  if (text === undefined) throw new Error(`${locale} has no "${key}"`);
  return formatMessage(text, paramsFor(key));
}

describe('formatMessage', () => {
  it('fills every placeholder with its parameter', () => {
    expect(formatMessage('{count} of {total} selected', { count: 2, total: 5 })).toBe('2 of 5 selected');
  });

  it('throws when a placeholder has no parameter', () => {
    expect(() => formatMessage('Hello {name}', {})).toThrow('Missing parameter "name"');
  });
});

describe('the i18n runtime', () => {
  it('has English as the default UI language', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(translate(DEFAULT_LOCALE, 'editor.label')).toBe('Page editor');
    expect(translate(DEFAULT_LOCALE, 'activity.insert')).toBe('Insert');
  });

  it('has a text for every key in every locale', () => {
    for (const locale of LOCALES) {
      for (const key of MESSAGE_IDS) {
        expect(translate(locale, key, paramsFor(key))).toBe(expected(locale, key));
      }
    }
  });

  it('returns the Brazilian Portuguese texts', () => {
    expect(translate('pt-BR', 'activity.insert')).toBe('Inserir');
    expect(translate('pt-BR', 'attribute.alt.label')).toBe('Texto alternativo');
    expect(translator('pt-BR')('assets.picker.choose')).toBe('Escolher um arquivo');
  });

  it('fills placeholders in both locales', () => {
    expect(translate('en', 'canvas.editingText', { name: 'Hero' })).toBe('Editing text · Hero');
    expect(translate('pt-BR', 'canvas.editingText', { name: 'Hero' })).toBe('Editando texto · Hero');
    expect(translate('en', 'canvas.pickTarget', { name: 'Card' })).toBe('Target: Card · click to choose');
    expect(translate('pt-BR', 'canvas.pickTarget', { name: 'Card' })).toBe('Alvo: Card · clique para escolher');
  });

  it('throws when a placeholder has no value, in both locales', () => {
    expect(() => translate('en', 'canvas.editingText')).toThrow('Missing parameter "name"');
    expect(() => translate('pt-BR', 'canvas.editingText')).toThrow('Missing parameter "name"');
  });

  it('has no fallback: a key missing from a catalogue throws, naming the key and the locale', () => {
    const unknown = 'no.such.key' as MessageId;
    expect(() => translate('pt-BR', unknown)).toThrow('The pt-BR catalogue has no text for "no.such.key".');
    expect(() => translate('en', unknown)).toThrow('The en catalogue has no text for "no.such.key".');
  });

  it('switching the locale changes every text, and switching back restores English', () => {
    const changed = MESSAGE_IDS.filter((key) => en[key] !== ptBR[key]);
    expect(changed.length).toBeGreaterThan(MESSAGE_IDS.length / 2);
    const portuguese = translator('pt-BR');
    for (const key of MESSAGE_IDS) expect(portuguese(key, paramsFor(key))).toBe(expected('pt-BR', key));
    for (const key of changed) expect(portuguese(key, paramsFor(key))).not.toBe(expected('en', key));
    const english = translator('en');
    for (const key of MESSAGE_IDS) expect(english(key, paramsFor(key))).toBe(expected('en', key));
  });

  it('a translator stays bound to its locale', () => {
    const english = translator('en');
    const portuguese = translator('pt-BR');
    expect(english('activity.insert')).toBe('Insert');
    expect(portuguese('activity.insert')).toBe('Inserir');
    expect(english('activity.insert')).toBe('Insert');
  });

  it('accepts only the UI languages', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('pt-BR')).toBe(true);
    expect(isLocale('pt')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
