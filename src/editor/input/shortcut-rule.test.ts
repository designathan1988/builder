// The shortcut rule on the manifest's own data: which shortcut doors of the focus and dismiss commands, and of the
// background image's gradient stops, run.
import { describe, expect, it } from 'vitest';
import { manifest } from '../../manifest/runtime.ts';
import { shortcutRuns } from './shortcut-rule.ts';

const shortcut = (ref: string) => {
  const entry = manifest.doorByRef.get(ref as never);
  if (!entry || entry.door.kind !== 'shortcut') throw new Error(`${ref} is no shortcut`);
  return { command: entry.command.id, introducedBy: entry.command.introducedBy, feature: entry.door.feature };
};

describe('when a shortcut runs', () => {
  const built = (ids: readonly string[]) => (command: string) => ids.includes(command);
  const registered = (ids: readonly string[]) => (feature: string) => ids.includes(feature);
  const focus = ['focus.next', 'focus.previous', 'focus.first', 'focus.last', 'focus.activate', 'ui.dismiss'];

  it('runs a door of the feature that introduces its command once the command is built', () => {
    expect(shortcutRuns(shortcut('focus.next#key-arrow-down-in-menu'), built(focus), registered([]))).toBe(true);
    expect(shortcutRuns(shortcut('ui.dismiss#key-escape-in-menu'), built(focus), registered([]))).toBe(true);
  });

  it('never runs a door whose command is not built', () => {
    expect(shortcutRuns(shortcut('focus.next#key-arrow-down-in-menu'), built([]), registered(['keyboard-panel-navigation']))).toBe(false);
  });

  it('waits for the door\'s own feature to be registered when another feature introduces the command', () => {
    const toolbar = shortcut('focus.next#key-arrow-right-in-toolbar');
    expect(shortcutRuns(toolbar, built(focus), registered([]))).toBe(false);
    expect(shortcutRuns(toolbar, built(focus), registered([toolbar.feature]))).toBe(true);
    // the gradient editor's stop keys run the background image's command, built with props-background: they wait
    const stop = shortcut('style.setBackgroundImage#key-delete-in-gradient-stop');
    expect(stop.feature).not.toBe(stop.introducedBy);
    expect(shortcutRuns(stop, built(['style.setBackgroundImage']), registered([stop.introducedBy]))).toBe(false);
    expect(shortcutRuns(stop, built(['style.setBackgroundImage']), registered([stop.introducedBy, stop.feature]))).toBe(true);
  });
});
