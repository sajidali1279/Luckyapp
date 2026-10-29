// Unsaved edits on a page with several forms (Settings, 2026-10-17): each form says whether it has changes nobody saved, and the page
// asks before switching tabs (which throws a tab's form away) or before the browser tab is closed or reloaded.
import { useEffect, useState, useSyncExternalStore } from 'react';

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

/** A form's own edits over the saved values (2026-10-28): a box shows what was typed, else what is saved. The saved values loading
 *  again (another card's Save on the same page, the browser tab getting focus back) never throws typing away and shows through
 *  where nothing was typed; only this form's Undo, or its own Save, clears the typing. */
export function useDraft<T extends Record<string, unknown>>(saved: T) {
  const [edits, setEdits] = useState<Partial<T>>({});
  return {
    form: { ...saved, ...edits } as T,
    set: <K extends keyof T>(key: K, value: T[K]) => setEdits((e) => ({ ...e, [key]: value })),
    reset: () => setEdits({}),
    /** After a save, once the saved values have loaded again: forget the edits that were sent (anything typed since stays). `same`
     *  compares a box with what was sent for it when the two are written differently (the text "30" and the number 30). */
    settle: (sent: { [K in keyof T]?: unknown }, same: (typed: unknown, sent: unknown) => boolean = Object.is) =>
      setEdits((e) => Object.fromEntries(Object.entries(e).filter(([k, v]) => !(k in sent && same(v, sent[k])))) as Partial<T>),
  };
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
