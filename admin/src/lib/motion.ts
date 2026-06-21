// admin/src/lib/motion.ts
import type { MouseEvent } from 'react';

/** cliffindus.com's premium-feel easing curve — use for all Dashboard hover/entrance motion. */
export const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const TRANSITION_FAST = `all 0.18s ${EASE}`;
export const TRANSITION_TRANSFORM = `transform 0.18s ${EASE}, box-shadow 0.18s ${EASE}, border-color 0.18s ${EASE}`;

/**
 * Tracks cursor position relative to the hovered element and writes it to
 * --mx/--my CSS custom properties, which the .dash-card / .dash-quick-btn
 * CSS classes read to position their mouse-tracking radial-gradient glow.
 */
export function handleGlowMove(e: MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
}
