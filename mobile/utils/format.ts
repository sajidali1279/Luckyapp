// Shared formatting helpers used across manager screens.

/** Today → "3:45 PM". Any other day → "Jan 5 · 3:45 PM". */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getInitial(name: string): string {
  return (name || '?')[0].toUpperCase();
}
