/** The server's own explanation of a refusal ("over $800 needs a Super Admin", "already handled"), or the fallback line. */
export function serverMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === 'string' && msg ? msg : fallback;
}
