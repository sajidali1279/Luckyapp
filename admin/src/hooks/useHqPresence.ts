import { useEffect } from 'react';
import { authApi } from '../services/api';

const EVERY_MS = 5 * 60_000;

/**
 * HQ's "still here" signal (2026-11-21): sent when HQ opens, every 5 minutes while the page is on screen, and when it comes back on
 * screen. The server tracks Super Admins only (the Dev Admin is emailed when one signs in, signs out or goes quiet for 30 minutes);
 * for anyone else it does nothing. A failed signal is simply tried again next time.
 */
export function useHqPresence(role: string | undefined) {
  useEffect(() => {
    if (role !== 'SUPER_ADMIN') return;
    const ping = () => { if (document.visibilityState === 'visible') authApi.hqPing().catch(() => undefined); };
    ping();
    const timer = window.setInterval(ping, EVERY_MS);
    const onVisible = () => ping();
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [role]);
}

/** Before HQ forgets the sign-in: tells the server this Super Admin pressed Sign out (never holds the sign-out up for long). */
export async function hqSignOutSignal(role: string | undefined) {
  if (role !== 'SUPER_ADMIN') return;
  await Promise.race([authApi.hqSignOut().catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]);
}
