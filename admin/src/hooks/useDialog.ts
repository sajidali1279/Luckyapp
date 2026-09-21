import { useEffect, useRef, RefObject } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Dialogs can open on top of each other (a confirm box over an edit form). Only the top one answers Escape and Tab, and the page
// behind is locked once, however many are open.
const openDialogs: object[] = [];
let scrollLocks = 0;
let scrollBefore = '';

/**
 * What every dialog has to do besides look like one: start focus inside (an input marked autoFocus keeps it), keep Tab inside,
 * close on Escape unless something is being saved, stop the page behind from scrolling, and hand focus back to whatever opened it.
 */
export function useDialog(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void, busy: boolean) {
  const token = useRef({}).current;
  // Whatever had focus when the dialog first rendered is what opened it. Read while rendering, because an input marked autoFocus takes
  // focus during the commit, before any effect could look.
  const openerRef = useRef<HTMLElement | null>(null);
  // The element inside the dialog that took focus on its own (an input marked autoFocus): where focus goes again if the effect below runs twice
  // (React's development mode mounts, unmounts and mounts again, and the unmount hands focus back to the opener).
  const startedOnRef = useRef<HTMLElement | null>(null);
  if (!open) { openerRef.current = null; startedOnRef.current = null; }
  else if (openerRef.current === null) openerRef.current = document.activeElement as HTMLElement | null;

  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    const node = ref.current;
    if (node) {
      if (node.contains(document.activeElement)) startedOnRef.current = document.activeElement as HTMLElement;
      else (startedOnRef.current && node.contains(startedOnRef.current) ? startedOnRef.current : node).focus();
    }
    openDialogs.push(token);
    if (scrollLocks++ === 0) { scrollBefore = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    return () => {
      const i = openDialogs.indexOf(token);
      if (i >= 0) openDialogs.splice(i, 1);
      if (--scrollLocks === 0) document.body.style.overflow = scrollBefore;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, ref, token]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== token) return;
      if (e.key === 'Escape') { if (!busy) onClose(); return; }
      const node = ref.current;
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); node.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, ref, onClose, busy, token]);
}
