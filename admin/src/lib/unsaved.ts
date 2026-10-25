// Unsaved edits on a page with several forms (Settings, 2026-10-17): each form says whether it has changes nobody saved, and the page
// asks before switching tabs (which throws a tab's form away) or before the browser tab is closed or reloaded.
import { useEffect, useSyncExternalStore } from 'react';

const dirty = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** A form reports whether it has unsaved edits; it stops counting when it goes away. */
export function useUnsaved(id: string, isDirty: boolean) {
  useEffect(() => {
    const had = dirty.has(id);
    if (isDirty) dirty.add(id); else dirty.delete(id);
    if (had !== isDirty) emit();
    return () => { if (dirty.delete(id)) emit(); };
  }, [id, isDirty]);
}

/** Whether any form on the page has unsaved edits; also warns before the browser tab is closed or reloaded. */
export function useAnyUnsaved(): boolean {
  const any = useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => dirty.size > 0);
  useEffect(() => {
    if (!any) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [any]);
  return any;
}
