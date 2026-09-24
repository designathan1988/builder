import { en } from './en.ts';

export type MessageKey = keyof typeof en;
export type MessageParams = Readonly<Record<string, string | number>>;

const messages: Readonly<Record<MessageKey, string>> = en;

// Placeholders are written as {name}. A placeholder without a value is a bug, so it throws.
export function formatMessage(template: string, params: MessageParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (_placeholder, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`Missing parameter "${name}" in "${template}".`);
    }
    return String(value);
  });
}

// Every UI string goes through this function.
export function t(key: MessageKey, params: MessageParams = {}): string {
  return formatMessage(messages[key], params);
}
