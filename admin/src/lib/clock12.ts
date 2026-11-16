/** A shift's saved time ("14:00") as "2:00 pm", the way the app shows it (2026-11-15); anything that is not hh:mm comes back as it was */
export function clock12(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? '').trim());
  if (!m) return String(hhmm ?? '');
  const h = Number(m[1]) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}
