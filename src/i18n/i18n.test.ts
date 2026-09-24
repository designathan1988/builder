import { describe, expect, it } from 'vitest';
import { formatMessage, t } from './index.ts';

describe('i18n', () => {
  it('returns the English text for a key', () => {
    expect(t('editor.label')).toBe('Page editor');
  });

  it('fills every placeholder with its parameter', () => {
    expect(formatMessage('{count} of {total} selected', { count: 2, total: 5 })).toBe('2 of 5 selected');
  });

  it('throws when a placeholder has no parameter', () => {
    expect(() => formatMessage('Hello {name}', {})).toThrow('Missing parameter "name"');
  });
});
