import * as Haptics from 'expo-haptics';

// One place for haptics, so every screen feels the same on iPhone (Taptic Engine) and Android. Calls never throw, and the same
// kind fired twice within a moment (a success toast right after a success tap, say) is felt once.
type Kind = 'tap' | 'press' | 'select' | 'success' | 'warning' | 'error';
let last: { kind: Kind; at: number } = { kind: 'tap', at: 0 };

function fire(kind: Kind, run: () => Promise<void>) {
  const now = Date.now();
  if (last.kind === kind && now - last.at < 400) return;
  if ((kind === 'success' || kind === 'error' || kind === 'warning') && now - last.at < 120) return; // one buzz per moment
  last = { kind, at: now };
  run().catch(() => {});
}

export const haptic = {
  /** A light tap: opening something, pull to refresh. */
  tap: () => fire('tap', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A firmer press: a QR code or barcode was read. */
  press: () => fire('press', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** A selection tick: switching a tab, a chip, a toggle. */
  select: () => fire('select', () => Haptics.selectionAsync()),
  success: () => fire('success', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => fire('warning', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => fire('error', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
