// Opens the print dialog for a window this page just wrote into, once its content (images, drawn barcodes) has loaded.
//
// The print windows used to carry their own <script>window.onload = () => window.print();</script>. A window opened with
// window.open('') inherits this site's Content-Security-Policy, which only allows the site's own script files, so that inline
// script would be blocked and the print dialog would never appear. Printing is started from here instead.

export function printWhenLoaded(win: Window) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    try { win.focus(); win.print(); } catch { /* the window was closed first */ }
  };
  if (win.document.readyState === 'complete') { setTimeout(go, 50); return; }
  win.addEventListener('load', () => setTimeout(go, 50), { once: true });
  setTimeout(go, 3000);   // if the load event never arrives, print anyway
}
