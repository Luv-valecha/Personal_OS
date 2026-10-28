// When the global mini player bar is shown. The ✕ on the bar sets `dismissed` (pause + hide) WITHOUT touching the queue; any new playback clears it.
export const miniPlayerVisible = ({ queue, index, dismissed }) => Array.isArray(queue) && index >= 0 && queue[index] != null && !dismissed;
