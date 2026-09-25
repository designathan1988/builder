// The shortcut rule on the manifest's own data: which shortcut doors of the focus and dismiss commands run.
import { describe, expect, it } from 'vitest';
import { FEATURE_COMMANDS } from '../../generated/commands.ts';
import { manifest } from '../../manifest/runtime.ts';
import { shortcutRuns } from './shortcut-rule.ts';

const shortcut = (ref: string) => {
  const entry = manifest.doorByRef.get(ref as never);
  if (!entry || entry.door.kind !== 'shortcut') throw new Error(`${ref} is no shortcut`);
  return { command: entry.command.id, introducedBy: entry.command.introducedBy, feature: entry.door.feature };
};

describe('when a shortcut runs', () => {
  const built = (ids: readonly string[]) => (command: string) => ids.includes(command);
  const focus = ['focus.next', 'focus.previous', 'focus.first', 'focus.last', 'focus.activate', 'ui.dismiss'];

  it('runs a door of the feature that introduces its command once the command is built', () => {
    expect(shortcutRuns(shortcut('focus.next#key-arrow-down-in-menu'), built(focus), FEATURE_COMMANDS)).toBe(true);
    expect(shortcutRuns(shortcut('ui.dismiss#key-escape-in-menu'), built(focus), FEATURE_COMMANDS)).toBe(true);
  });

  it('never runs a door whose command is not built', () => {
    expect(shortcutRuns(shortcut('focus.next#key-arrow-down-in-menu'), built([]), FEATURE_COMMANDS)).toBe(false);
  });

  it('waits for the door\'s own feature when another feature introduces the command', () => {
    expect(shortcutRuns(shortcut('focus.next#key-arrow-right-in-toolbar'), built(focus), FEATURE_COMMANDS)).toBe(false);
    expect(shortcutRuns(shortcut('ui.dismiss#key-escape-in-command-bar'), built(focus), FEATURE_COMMANDS)).toBe(false);
    // with every command of keyboard-panel-navigation built, its toolbar keys run
    const panelNavigation = FEATURE_COMMANDS['keyboard-panel-navigation'];
    expect(shortcutRuns(shortcut('focus.next#key-arrow-right-in-toolbar'), built([...focus, ...panelNavigation]), FEATURE_COMMANDS)).toBe(true);
  });
});
