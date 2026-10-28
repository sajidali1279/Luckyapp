import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { reloadForNewRelease } from './lib/newRelease';

// Any file of an older release that is gone after a new one (a page, a stylesheet, a library loaded on demand): reload once
// to pick up the new release. Prevented only when it does reload, so a repeat failure still reaches the error page.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewRelease()) event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
