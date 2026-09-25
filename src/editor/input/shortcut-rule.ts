// When a shortcut runs (DESIGN.md "Build order"), part of the keymap owner (ARCHITECTURE.md): its command is built,
// and its door's feature is the feature that introduces the command or has every one of its own commands built
// (FEATURE_COMMANDS). A key has no drawing to say "not available yet", so the shortcut of a feature still to come
// does not run, while its command already runs through the doors of the feature that introduced it. Drawn doors keep
// their own rule (door.tsx). The keymap decides with this function and the door census (tests/e2e/census.spec.ts)
// imports the same one, so it is pure: it runs in the editor and in Node.
export interface ShortcutFacts {
  readonly command: string;
  // the feature that introduces the command (its manifest `introducedBy`)
  readonly introducedBy: string;
  // the door's own feature
  readonly feature: string;
}

export function shortcutRuns(door: ShortcutFacts, built: (command: string) => boolean, featureCommands: Readonly<Record<string, readonly string[]>>): boolean {
  if (!built(door.command)) return false;
  if (door.feature === door.introducedBy) return true;
  const commands = featureCommands[door.feature];
  return commands !== undefined && commands.every(built);
}
