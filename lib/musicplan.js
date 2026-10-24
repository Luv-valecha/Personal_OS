// Pure decisions for the dashboard music widget (unit-tested; no browser needed).
// Audio files live only on the user's device, so a playlist can contain tracks this device can't play.

// → { ids: playable ids in the original order, skipped, note }
export function planPlayback(allIds = [], availableIds = []) {
  const have = new Set(availableIds); const ids = allIds.filter((id) => have.has(id)); const skipped = allIds.length - ids.length;
  if (!allIds.length) return { ids: [], skipped: 0, note: "Nothing to play here yet — add songs on the Music page." };
  if (!ids.length) return { ids: [], skipped, note: "None of these files are linked on this device — open Music to add or re-link them." };
  return { ids, skipped, note: skipped ? `Playing ${ids.length} of ${allIds.length} — the rest aren't linked on this device.` : "" };
}

// The Play button resumes/pauses when the player is still on the list this widget started; otherwise it (re)starts the selected list.
export function playAction({ active, queue = [], current = null }) {
  if (active && current != null && queue.length && queue.join(",") === active.key) return "toggle";
  return "start";
}

// The dashboard payload carries at most this many library tracks (the Music page has them all). The widget says so when it applies.
export const MUSIC_WIDGET_LIMIT = 800;
export const sourceKey = (ids) => ids.join(",");
// A saved selection that no longer exists (deleted playlist) falls back to "all".
export const resolveSource = (sel, playlists = []) => (sel && sel !== "all" && playlists.some((p) => p.id === sel) ? sel : "all");
