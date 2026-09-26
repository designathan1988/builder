// Grid tracks (ARCHITECTURE.md; spec props-grid-container): the track list a grid's columns have once a track is added
// (the Add column button, a door of style.set): the tracks they have, then one more of 1fr; a grid with none (none, or
// no value of its own) gets its first.
const NEW_TRACK = '1fr';

export function withTrackAdded(tracks: string | undefined): string {
  const held = tracks?.trim() ?? '';
  return held === '' || held.toLowerCase() === 'none' ? NEW_TRACK : `${held} ${NEW_TRACK}`;
}
